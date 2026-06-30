const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json());

// Constants
const API_KEY = process.env.API_KEY || '75d051012adf93f000fccb6910a58563';
const EXTERNAL_API_URL = 'https://kd1s.com/api/v2';
const SERVICE_ID = 13372;
const QUANTITY = 100;

// File paths
const requestsFile = path.join(__dirname, 'requests.json');
const deviceStatusFile = path.join(__dirname, 'device-status.json');

// Initialize files if they don't exist
function initializeFiles() {
    if (!fs.existsSync(requestsFile)) {
        fs.writeFileSync(requestsFile, JSON.stringify({}));
    }
    if (!fs.existsSync(deviceStatusFile)) {
        fs.writeFileSync(deviceStatusFile, JSON.stringify({}));
    }
}

initializeFiles();

// Helper functions
function getClientFingerprint(req) {
    const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'unknown';
    return `${clientIP}|${userAgent}`;
}

function cleanUrl(url) {
    try {
        const urlObj = new URL(url);
        return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
    } catch (e) {
        return url.split('?')[0].split('#')[0];
    }
}

function loadDeviceStatus() {
    try {
        return JSON.parse(fs.readFileSync(deviceStatusFile, 'utf8'));
    } catch (e) {
        return {};
    }
}

function saveDeviceStatus(data) {
    fs.writeFileSync(deviceStatusFile, JSON.stringify(data, null, 2));
}

function loadRequests() {
    try {
        return JSON.parse(fs.readFileSync(requestsFile, 'utf8'));
    } catch (e) {
        return {};
    }
}

function saveRequests(data) {
    fs.writeFileSync(requestsFile, JSON.stringify(data, null, 2));
}

function canDeviceOrder(fingerprint) {
    const deviceStatus = loadDeviceStatus();
    const lastOrder = deviceStatus[fingerprint];
    
    if (!lastOrder) {
        return { canOrder: true, minutesUntilNextOrder: 0 };
    }
    
    const now = Date.now();
    const hourInMs = 60 * 60 * 1000;
    const timeSinceLastOrder = now - lastOrder;
    
    if (timeSinceLastOrder >= hourInMs) {
        return { canOrder: true, minutesUntilNextOrder: 0 };
    }
    
    const minutesRemaining = Math.ceil((hourInMs - timeSinceLastOrder) / (60 * 1000));
    return { canOrder: false, minutesUntilNextOrder: minutesRemaining };
}

function recordDeviceOrder(fingerprint) {
    const deviceStatus = loadDeviceStatus();
    deviceStatus[fingerprint] = Date.now();
    saveDeviceStatus(deviceStatus);
}

// Routes

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running normally' });
});

// Get configuration
app.get('/api/config', (req, res) => {
    res.json({
        success: true,
        data: {
            'tiktok-views': { serviceId: 17648, quantity: 100 },
            'instagram-reels-views': { serviceId: 17337, quantity: 100 },
            'instagram-likes': { serviceId: 17512, quantity: 10 },
            'instagram-followers': { serviceId: 17437, quantity: 10 },
            'tiktok-followers': { serviceId: 17629, quantity: 10 },
            'tiktok-likes': { serviceId: 17648, quantity: 10 }
        }
    });
});

// Check device status
app.get('/api/device-status', (req, res) => {
    const fingerprint = getClientFingerprint(req);
    const status = canDeviceOrder(fingerprint);
    
    res.json({
        success: true,
        ...status
    });
});

// Create order
app.post('/api/order', async (req, res) => {
    try {
        const { link, serviceId, quantity } = req.body;
        const fingerprint = getClientFingerprint(req);
        
        // Validate input
        if (!link) {
            return res.status(400).json({
                success: false,
                error: 'الرجاء إدخال رابط صحيح'
            });
        }
        
        // Check device status
        const deviceStatus = canDeviceOrder(fingerprint);
        if (!deviceStatus.canOrder) {
            return res.status(429).json({
                success: false,
                error: `هذا الرابط تم طلبه قبل قليل، حاول بعد ساعة`
            });
        }
        
        // Clean URL
        const cleanedUrl = cleanUrl(link);
        
        // Check if URL was ordered recently
        const requests = loadRequests();
        const urlKey = cleanedUrl.toLowerCase();
        
        if (requests[urlKey]) {
            const lastOrderTime = requests[urlKey];
            const now = Date.now();
            const hourInMs = 60 * 60 * 1000;
            
            if (now - lastOrderTime < hourInMs) {
                return res.status(429).json({
                    success: false,
                    error: 'هذا الرابط تم طلبه قبل قليل، حاول بعد ساعة'
                });
            }
        }
        
        // Send to external API
        const payload = {
            key: API_KEY,
            action: 'add',
            service: serviceId || SERVICE_ID,
            link: cleanedUrl,
            quantity: quantity || QUANTITY
        };
        
        console.log('📤 Sending order to external API:', payload);
        
        const response = await axios.post(EXTERNAL_API_URL, payload, {
            timeout: 10000,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        
        console.log('✅ External API response:', response.data);
        
        // Record the order
        requests[urlKey] = Date.now();
        saveRequests(requests);
        recordDeviceOrder(fingerprint);
        
        res.json({
            success: true,
            data: response.data,
            message: 'تم إنشاء الطلب بنجاح'
        });
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        
        let errorMessage = 'حدث خطأ في معالجة الطلب';
        
        if (error.response && error.response.data) {
            errorMessage = error.response.data.error || error.response.data;
        } else if (error.message) {
            errorMessage = error.message;
        }
        
        res.status(500).json({
            success: false,
            error: errorMessage
        });
    }
});

// Get statistics
app.get('/api/stats', (req, res) => {
    try {
        const requests = loadRequests();
        const deviceStatus = loadDeviceStatus();
        
        res.json({
            success: true,
            stats: {
                totalRequests: Object.keys(requests).length,
                totalDevices: Object.keys(deviceStatus).length,
                requests: requests,
                devices: deviceStatus
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
    console.log(`📍 الرابط: http://localhost:${PORT}`);
    console.log(`🔑 API Key: ${API_KEY.substring(0, 5)}...${API_KEY.substring(-5)}`);
});

module.exports = app;
