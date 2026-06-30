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

const COOLDOWN_MS = 1 * 60 * 1000; // 1 minute for testing

// Initialize files
function initializeFiles() {
    if (!fs.existsSync(REQUESTS_FILE)) {
        fs.writeFileSync(REQUESTS_FILE, JSON.stringify({}, null, 2));
    }
    if (!fs.existsSync(DEVICES_FILE)) {
        fs.writeFileSync(DEVICES_FILE, JSON.stringify({}, null, 2));
    }
}

// Get device fingerprint
function getDeviceFingerprint(req) {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const fingerprint = `${ip}|${userAgent}`;
    console.log('Device Fingerprint:', fingerprint);
    return fingerprint;
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
        
        console.log('Checking URL:', normalizedUrl);
        console.log('Stored URLs:', Object.keys(data));
        
        if (data[normalizedUrl]) {
            const lastRequestTime = data[normalizedUrl].timestamp;
            const now = Date.now();
            const timeSinceLastRequest = now - lastRequestTime;
            
            console.log('Last request time:', lastRequestTime);
            console.log('Time since last request:', timeSinceLastRequest);
            console.log('Cooldown MS:', COOLDOWN_MS);
            
            if (timeSinceLastRequest < COOLDOWN_MS) {
                const timeRemaining = Math.ceil((COOLDOWN_MS - timeSinceLastRequest) / 1000);
                console.log('URL is recent. Time remaining:', timeRemaining);
                return {
                    isRecent: true,
                    timeRemaining: timeRemaining
                };
            }
        }
        console.log('URL is not recent or not found');
        return { isRecent: false, timeRemaining: 0 };
    } catch (error) {
        console.error('Error checking URL recency:', error);
        return { isRecent: false, timeRemaining: 0 };
    }
}

// Check if device made a request recently
function checkDeviceRecency(fingerprint) {
    try {
        const data = JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf8'));
        
        console.log('Checking Device:', fingerprint);
        console.log('Stored Devices:', Object.keys(data));
        
        if (data[fingerprint]) {
            const lastRequestTime = data[fingerprint].timestamp;
            const now = Date.now();
            const timeSinceLastRequest = now - lastRequestTime;
            
            console.log('Last device request time:', lastRequestTime);
            console.log('Time since last device request:', timeSinceLastRequest);
            
            if (timeSinceLastRequest < COOLDOWN_MS) {
                const timeRemaining = Math.ceil((COOLDOWN_MS - timeSinceLastRequest) / 1000);
                console.log('Device is recent. Time remaining:', timeRemaining);
                return {
                    isRecent: true,
                    timeRemaining: timeRemaining
                };
            }
        }
        console.log('Device is not recent or not found');
        return { isRecent: false, timeRemaining: 0 };
    } catch (error) {
        console.error('Error checking device recency:', error);
        return { isRecent: false, timeRemaining: 0 };
    }
}

// Format time remaining
function formatTimeRemaining(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    
    if (minutes > 0) {
        return `${minutes} دقيقة و ${secs} ثانية`;
    }
    return `${secs} ثانية`;
}

// Save URL request
function saveUrlRequest(url, orderId) {
    try {
        const data = JSON.parse(fs.readFileSync(REQUESTS_FILE, 'utf8'));
        const normalizedUrl = normalizeUrl(url);
        const now = Date.now();
        
        data[normalizedUrl] = {
            timestamp: now,
            url: url,
            orderId: orderId
        };
        
        fs.writeFileSync(REQUESTS_FILE, JSON.stringify(data, null, 2));
        console.log('URL saved:', normalizedUrl, 'at', now);
    } catch (error) {
        console.error('Error saving URL request:', error);
    }
}

// Save device request
function saveDeviceRequest(fingerprint, orderId) {
    try {
        const data = JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf8'));
        const now = Date.now();
        
        data[fingerprint] = {
            timestamp: now,
            fingerprint: fingerprint,
            orderId: orderId
        };
        
        fs.writeFileSync(DEVICES_FILE, JSON.stringify(data, null, 2));
        console.log('Device saved:', fingerprint, 'at', now);
    } catch (error) {
        console.error('Error saving device request:', error);
    }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
    console.log('Health check requested');
    res.json({
        status: 'ok',
        message: 'Server is running normally',
        timestamp: new Date().toISOString()
    });
});

// Config endpoint
app.get('/api/config', (req, res) => {
    console.log('Config requested');
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
    const deviceStatus = checkDeviceRecency(fingerprint);
    
    console.log('Device status check:', deviceStatus);
    
    res.json({
        success: true,
        data: {
            fingerprint: fingerprint,
            canMakeRequest: !deviceStatus.isRecent,
            timeRemaining: deviceStatus.timeRemaining,
            message: deviceStatus.isRecent 
                ? `⏳ ${formatTimeRemaining(deviceStatus.timeRemaining)} متبقية` 
                : 'Device is ready to make a request.'
        }
    });
});

// Main order endpoint
app.post('/api/order', async (req, res) => {
    try {
        console.log('Order request received:', req.body);
        
        const { link, serviceId, quantity } = req.body;

        // Validate input
        if (!link || !serviceId || !quantity) {
            console.log('Missing required fields');
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: link, serviceId, quantity'
            });
        }

        // Get device fingerprint
        const deviceFingerprint = getDeviceFingerprint(req);

        // Check if URL was recently requested
        const urlStatus = checkUrlRecency(link);
        if (urlStatus.isRecent) {
            console.log('URL is recent, rejecting request');
            return res.status(429).json({
                success: false,
                error: `⏳ هذا الرابط تم طلبه قبل قليل، حاول بعد ${formatTimeRemaining(urlStatus.timeRemaining)}`,
                timeRemaining: urlStatus.timeRemaining
            });
        }

        // Check if device made a request recently
        const deviceStatus = checkDeviceRecency(deviceFingerprint);
        if (deviceStatus.isRecent) {
            console.log('Device is recent, rejecting request');
            return res.status(429).json({
                success: false,
                error: `⏳ هذا الجهاز قام بطلب قبل قليل، حاول بعد ${formatTimeRemaining(deviceStatus.timeRemaining)}`,
                timeRemaining: deviceStatus.timeRemaining
            });
        }

        // Send request to external API
        console.log('Sending request to external API');
        const externalResponse = await axios.post(EXTERNAL_API, {
            key: API_KEY,
            action: 'add',
            service: serviceId,
            link: link,
            quantity: quantity
        });

        console.log('External API response:', externalResponse.data);

        // Extract order ID from response
        const orderId = externalResponse.data?.order || externalResponse.data?.id || 'N/A';

        // Save URL request
        saveUrlRequest(link, orderId);

        // Save device request
        saveDeviceRequest(deviceFingerprint, orderId);

        // Return response with order ID and cooldown info
        const cooldownSeconds = Math.ceil(COOLDOWN_MS / 1000);
        
        res.json({
            success: true,
            data: externalResponse.data,
            orderId: orderId,
            cooldownSeconds: cooldownSeconds,
            message: 'Order created successfully'
        });

    } catch (error) {
        console.error('Error:', error.message);
        
        if (error.response) {
            console.error('External API error:', error.response.data);
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
                cooldownSeconds: Math.ceil(COOLDOWN_MS / 1000),
                recentUrls: Object.entries(urlsData).slice(-10).map(([url, data]) => ({
                    url: data.url,
                    orderId: data.orderId,
                    timestamp: new Date(data.timestamp).toISOString()
                })),
                recentDevices: Object.entries(devicesData).slice(-10).map(([fingerprint, data]) => ({
                    orderId: data.orderId,
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
    console.log(`⏳ مدة الانتظار: ${Math.ceil(COOLDOWN_MS / 1000)} ثانية`);
});
