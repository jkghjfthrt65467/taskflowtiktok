const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(cors());

const REQUESTS_FILE = path.join(__dirname, 'requests.json');
const DEVICES_FILE = path.join(__dirname, 'devices.json');

const API_KEY = process.env.API_KEY || '1a26d1859e5b8060b4b46806651bfe9a';
const EXTERNAL_API = 'https://kd1s.com/api/v2';

// Initialize files
function initializeFiles() {
    if (!fs.existsSync(REQUESTS_FILE)) {
        fs.writeFileSync(REQUESTS_FILE, JSON.stringify({}));
    }
    if (!fs.existsSync(DEVICES_FILE)) {
        fs.writeFileSync(DEVICES_FILE, JSON.stringify({}));
    }
}

// Get device fingerprint
function getDeviceFingerprint(req) {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    return `${ip}|${userAgent}`;
}

// Normalize URL
function normalizeUrl(url) {
    try {
        const urlObj = new URL(url);
        return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
    } catch (error) {
        return url;
    }
}

// Check if URL was recently requested
function checkUrlRecency(url) {
    try {
        const data = JSON.parse(fs.readFileSync(REQUESTS_FILE, 'utf8'));
        const normalizedUrl = normalizeUrl(url);
        
        if (data[normalizedUrl]) {
            const lastRequestTime = data[normalizedUrl].timestamp;
            const now = Date.now();
            const hourInMs = 60 * 60 * 1000;
            
            if (now - lastRequestTime < hourInMs) {
                return true; // URL was requested recently
            }
        }
        return false;
    } catch (error) {
        return false;
    }
}

// Check if device made a request recently
function checkDeviceRecency(fingerprint) {
    try {
        const data = JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf8'));
        
        if (data[fingerprint]) {
            const lastRequestTime = data[fingerprint].timestamp;
            const now = Date.now();
            const hourInMs = 60 * 60 * 1000;
            
            if (now - lastRequestTime < hourInMs) {
                return true; // Device made a request recently
            }
        }
        return false;
    } catch (error) {
        return false;
    }
}

// Save URL request
function saveUrlRequest(url) {
    try {
        const data = JSON.parse(fs.readFileSync(REQUESTS_FILE, 'utf8'));
        const normalizedUrl = normalizeUrl(url);
        data[normalizedUrl] = {
            timestamp: Date.now(),
            url: url
        };
        fs.writeFileSync(REQUESTS_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error saving URL request:', error);
    }
}

// Save device request
function saveDeviceRequest(fingerprint) {
    try {
        const data = JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf8'));
        data[fingerprint] = {
            timestamp: Date.now(),
            fingerprint: fingerprint
        };
        fs.writeFileSync(DEVICES_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error saving device request:', error);
    }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Server is running normally',
        timestamp: new Date().toISOString()
    });
});

// Config endpoint
app.get('/api/config', (req, res) => {
    res.json({
        success: true,
        data: {
            'tiktok-views': { serviceId: 13372, quantity: 100 },
            'instagram-reels-views': { serviceId: 17337, quantity: 100 },
            'instagram-likes': { serviceId: 17512, quantity: 10 },
            'instagram-followers': { serviceId: 17437, quantity: 10 },
            'tiktok-followers': { serviceId: 17629, quantity: 10 },
            'tiktok-likes': { serviceId: 17648, quantity: 10 }
        }
    });
});

// Device status endpoint
app.get('/api/device-status', (req, res) => {
    const fingerprint = getDeviceFingerprint(req);
    const isRecent = checkDeviceRecency(fingerprint);
    
    res.json({
        success: true,
        data: {
            fingerprint: fingerprint,
            canMakeRequest: !isRecent,
            message: isRecent ? 'Device has made a request recently. Please wait an hour.' : 'Device is ready to make a request.'
        }
    });
});

// Main order endpoint
app.post('/api/order', async (req, res) => {
    try {
        const { link, serviceId, quantity } = req.body;

        // Validate input
        if (!link || !serviceId || !quantity) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: link, serviceId, quantity'
            });
        }

        // Get device fingerprint
        const deviceFingerprint = getDeviceFingerprint(req);

        // Check if URL was recently requested
        if (checkUrlRecency(link)) {
            return res.status(429).json({
                success: false,
                error: 'هذا الرابط تم طلبه قبل قليل، حاول بعد ساعة'
            });
        }

        // Check if device made a request recently
        if (checkDeviceRecency(deviceFingerprint)) {
            return res.status(429).json({
                success: false,
                error: 'هذا الجهاز قام بطلب قبل قليل، حاول بعد ساعة'
            });
        }

        // Save URL request
        saveUrlRequest(link);

        // Save device request
        saveDeviceRequest(deviceFingerprint);

        // Send request to external API
        const externalResponse = await axios.post(EXTERNAL_API, {
            key: API_KEY,
            action: 'add',
            service: serviceId,
            link: link,
            quantity: quantity
        });

        // Return response
        res.json({
            success: true,
            data: externalResponse.data,
            message: 'Order created successfully'
        });

    } catch (error) {
        console.error('Error:', error.message);
        
        if (error.response) {
            return res.status(error.response.status).json({
                success: false,
                error: error.response.data?.error || error.message
            });
        }

        res.status(500).json({
            success: false,
            error: 'Internal server error: ' + error.message
        });
    }
});

// Stats endpoint
app.get('/api/stats', (req, res) => {
    try {
        const urlsData = JSON.parse(fs.readFileSync(REQUESTS_FILE, 'utf8'));
        const devicesData = JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf8'));

        res.json({
            success: true,
            data: {
                totalUrlRequests: Object.keys(urlsData).length,
                totalDeviceRequests: Object.keys(devicesData).length,
                recentUrls: Object.entries(urlsData).slice(-10).map(([url, data]) => ({
                    url: data.url,
                    timestamp: new Date(data.timestamp).toISOString()
                })),
                recentDevices: Object.entries(devicesData).slice(-10).map(([fingerprint, data]) => ({
                    timestamp: new Date(data.timestamp).toISOString()
                }))
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Error retrieving stats: ' + error.message
        });
    }
});

// Initialize and start server
initializeFiles();

app.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
    console.log(`📊 API متاح على: http://localhost:${PORT}/api`);
    console.log(`✅ نظام الأمان: IP + User Agent`);
    console.log(`🔒 مفتاح API محمي على الخادم`);
});
