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

const COOLDOWN_MS = 60 * 60 * 1000; // 60 minutes

// Initialize files
function initializeFiles() {
    if (!fs.existsSync(REQUESTS_FILE)) {
        fs.writeFileSync(REQUESTS_FILE, JSON.stringify({}, null, 2));
    }
    if (!fs.existsSync(DEVICES_FILE)) {
        fs.writeFileSync(DEVICES_FILE, JSON.stringify({}, null, 2));
    }
}

// Get device fingerprint with details
function getDeviceFingerprint(req) {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const fingerprint = `${ip}|${userAgent}`;
    
    console.log('═══════════════════════════════════════');
    console.log('📱 Device Information:');
    console.log('IP Address:', ip);
    console.log('User Agent:', userAgent);
    console.log('Fingerprint:', fingerprint);
    console.log('═══════════════════════════════════════');
    
    return { fingerprint, ip, userAgent };
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

// Format time remaining
function formatTimeRemaining(milliseconds) {
    const totalSeconds = Math.ceil(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    if (minutes > 0) {
        return `${minutes} دقيقة و ${seconds} ثانية`;
    }
    return `${seconds} ثانية`;
}

// Check if URL was recently requested
function checkUrlRecency(url) {
    try {
        const data = JSON.parse(fs.readFileSync(REQUESTS_FILE, 'utf8'));
        const normalizedUrl = normalizeUrl(url);
        
        console.log('🔍 Checking URL Recency:');
        console.log('URL:', normalizedUrl);
        
        if (data[normalizedUrl]) {
            const lastRequestTime = data[normalizedUrl].timestamp;
            const now = Date.now();
            const timeSinceLastRequest = now - lastRequestTime;
            const timeRemaining = COOLDOWN_MS - timeSinceLastRequest;
            
            console.log('Last Request Time:', new Date(lastRequestTime).toISOString());
            console.log('Current Time:', new Date(now).toISOString());
            console.log('Time Since Last Request:', formatTimeRemaining(timeSinceLastRequest));
            console.log('Time Remaining:', formatTimeRemaining(timeRemaining));
            
            if (timeRemaining > 0) {
                console.log('✗ URL is recent - Request rejected');
                return {
                    isRecent: true,
                    timeRemaining: timeRemaining,
                    timeRemainingSeconds: Math.ceil(timeRemaining / 1000)
                };
            }
        }
        
        console.log('✓ URL is not recent or not found');
        return { isRecent: false, timeRemaining: 0, timeRemainingSeconds: 0 };
    } catch (error) {
        console.error('Error checking URL recency:', error);
        return { isRecent: false, timeRemaining: 0, timeRemainingSeconds: 0 };
    }
}

// Check if device made a request recently
function checkDeviceRecency(fingerprint) {
    try {
        const data = JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf8'));
        
        console.log('🔍 Checking Device Recency:');
        console.log('Device Fingerprint:', fingerprint);
        
        if (data[fingerprint]) {
            const lastRequestTime = data[fingerprint].timestamp;
            const now = Date.now();
            const timeSinceLastRequest = now - lastRequestTime;
            const timeRemaining = COOLDOWN_MS - timeSinceLastRequest;
            
            console.log('Last Request Time:', new Date(lastRequestTime).toISOString());
            console.log('Current Time:', new Date(now).toISOString());
            console.log('Time Since Last Request:', formatTimeRemaining(timeSinceLastRequest));
            console.log('Time Remaining:', formatTimeRemaining(timeRemaining));
            
            if (timeRemaining > 0) {
                console.log('✗ Device is recent - Request rejected');
                return {
                    isRecent: true,
                    timeRemaining: timeRemaining,
                    timeRemainingSeconds: Math.ceil(timeRemaining / 1000),
                    nextAllowedTime: new Date(lastRequestTime + COOLDOWN_MS).toISOString()
                };
            }
        }
        
        console.log('✓ Device is not recent or not found');
        return { 
            isRecent: false, 
            timeRemaining: 0, 
            timeRemainingSeconds: 0,
            nextAllowedTime: new Date().toISOString()
        };
    } catch (error) {
        console.error('Error checking device recency:', error);
        return { isRecent: false, timeRemaining: 0, timeRemainingSeconds: 0 };
    }
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
            orderId: orderId,
            nextAllowedTime: new Date(now + COOLDOWN_MS).toISOString()
        };
        
        fs.writeFileSync(REQUESTS_FILE, JSON.stringify(data, null, 2));
        console.log('✓ URL saved:', normalizedUrl);
        console.log('  Next allowed time:', data[normalizedUrl].nextAllowedTime);
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
            orderId: orderId,
            nextAllowedTime: new Date(now + COOLDOWN_MS).toISOString()
        };
        
        fs.writeFileSync(DEVICES_FILE, JSON.stringify(data, null, 2));
        console.log('✓ Device saved:', fingerprint);
        console.log('  Next allowed time:', data[fingerprint].nextAllowedTime);
    } catch (error) {
        console.error('Error saving device request:', error);
    }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
    console.log('🏥 Health check requested');
    res.json({
        status: 'ok',
        message: 'Server is running normally',
        timestamp: new Date().toISOString()
    });
});

// Config endpoint
app.get('/api/config', (req, res) => {
    console.log('⚙️ Config requested');
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
    const deviceInfo = getDeviceFingerprint(req);
    const deviceStatus = checkDeviceRecency(deviceInfo.fingerprint);
    
    console.log('📊 Device status check');
    
    res.json({
        success: true,
        data: {
            ip: deviceInfo.ip,
            userAgent: deviceInfo.userAgent,
            fingerprint: deviceInfo.fingerprint,
            canMakeRequest: !deviceStatus.isRecent,
            timeRemaining: deviceStatus.timeRemaining,
            timeRemainingSeconds: deviceStatus.timeRemainingSeconds,
            nextAllowedTime: deviceStatus.nextAllowedTime,
            message: deviceStatus.isRecent 
                ? `⏳ لديك محاولة واحدة كل 60 دقيقة - حاول بعد ${formatTimeRemaining(deviceStatus.timeRemaining)}` 
                : '✅ جهازك جاهز لإرسال طلب جديد'
        }
    });
});

// Main order endpoint
app.post('/api/order', async (req, res) => {
    try {
        console.log('\n' + '═'.repeat(50));
        console.log('🎯 New Order Request Received');
        console.log('═'.repeat(50));
        console.log('Request Body:', req.body);
        
        const { link, serviceId, quantity } = req.body;

        // Validate input
        if (!link || !serviceId || !quantity) {
            console.log('❌ Missing required fields');
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: link, serviceId, quantity'
            });
        }

        // Get device fingerprint
        const deviceInfo = getDeviceFingerprint(req);

        // Check if URL was recently requested
        console.log('\n📝 Step 1: Checking URL Recency...');
        const urlStatus = checkUrlRecency(link);
        if (urlStatus.isRecent) {
            console.log('❌ URL is recent - rejecting request');
            return res.status(429).json({
                success: false,
                error: `⏳ لديك محاولة واحدة كل 60 دقيقة - حاول بعد ${formatTimeRemaining(urlStatus.timeRemaining)}`,
                timeRemaining: urlStatus.timeRemaining,
                timeRemainingSeconds: urlStatus.timeRemainingSeconds
            });
        }

        // Check if device made a request recently
        console.log('\n📱 Step 2: Checking Device Recency...');
        const deviceStatus = checkDeviceRecency(deviceInfo.fingerprint);
        if (deviceStatus.isRecent) {
            console.log('❌ Device is recent - rejecting request');
            return res.status(429).json({
                success: false,
                error: `⏳ لديك محاولة واحدة كل 60 دقيقة - حاول بعد ${formatTimeRemaining(deviceStatus.timeRemaining)}`,
                timeRemaining: deviceStatus.timeRemaining,
                timeRemainingSeconds: deviceStatus.timeRemainingSeconds,
                nextAllowedTime: deviceStatus.nextAllowedTime
            });
        }

        // Send request to external API
        console.log('\n🌐 Step 3: Sending request to external API...');
        console.log('External API URL:', EXTERNAL_API);
        console.log('Service ID:', serviceId);
        console.log('Quantity:', quantity);
        
        const externalResponse = await axios.post(EXTERNAL_API, {
            key: API_KEY,
            action: 'add',
            service: serviceId,
            link: link,
            quantity: quantity
        });

        console.log('✓ External API response:', externalResponse.data);

        // Extract order ID from response
        const orderId = externalResponse.data?.order || externalResponse.data?.id || 'N/A';
        console.log('Order ID:', orderId);

        // Save URL request
        console.log('\n💾 Step 4: Saving request data...');
        saveUrlRequest(link, orderId);

        // Save device request
        saveDeviceRequest(deviceInfo.fingerprint, orderId);

        // Return response with order ID and cooldown info
        const cooldownSeconds = Math.ceil(COOLDOWN_MS / 1000);
        const nextAllowedTime = new Date(Date.now() + COOLDOWN_MS).toISOString();
        
        console.log('\n✅ Order processed successfully');
        console.log('═'.repeat(50) + '\n');
        
        res.json({
            success: true,
            data: externalResponse.data,
            orderId: orderId,
            cooldownSeconds: cooldownSeconds,
            nextAllowedTime: nextAllowedTime,
            message: 'تم إنشاء الطلب بنجاح'
        });

    } catch (error) {
        console.error('\n❌ Error occurred:', error.message);
        
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
                cooldownMinutes: Math.ceil(COOLDOWN_MS / 1000 / 60),
                recentUrls: Object.entries(urlsData).slice(-10).map(([url, data]) => ({
                    url: data.url,
                    orderId: data.orderId,
                    timestamp: new Date(data.timestamp).toISOString(),
                    nextAllowedTime: data.nextAllowedTime
                })),
                recentDevices: Object.entries(devicesData).slice(-10).map(([fingerprint, data]) => ({
                    orderId: data.orderId,
                    timestamp: new Date(data.timestamp).toISOString(),
                    nextAllowedTime: data.nextAllowedTime
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
    console.log('\n' + '═'.repeat(50));
    console.log('🚀 Server Started Successfully');
    console.log('═'.repeat(50));
    console.log(`📍 Port: ${PORT}`);
    console.log(`🔗 API Base: http://localhost:${PORT}/api`);
    console.log(`🔒 Security: IP + User Agent Fingerprinting`);
    console.log(`⏳ Cooldown: 60 دقيقة (3600 ثانية)`);
    console.log(`🔐 API Key: Protected`);
    console.log('═'.repeat(50) + '\n');
});
