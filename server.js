const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(cors());

const REQUESTS_FILE = path.join(__dirname, 'requests.json');
const DEVICES_FILE = path.join(__dirname, 'devices.json');
const FINGERPRINTS_FILE = path.join(__dirname, 'fingerprints.json');

const API_KEY = process.env.API_KEY || '75d051012adf93f000fccb6910a58563';
const EXTERNAL_API = 'https://kd1s.com/api/v2';

const COOLDOWN_MS = 60 * 60 * 1000; // 60 دقيقة

// Services Configuration
const SERVICES_CONFIG = {
    'instagram-followers': { serviceId: 17737, quantity: 10, name: 'متابعين Instagram' },
    'tiktok-followers': { serviceId: 17629, quantity: 10, name: 'متابعين TikTok' },
    'tiktok-views': { serviceId: 13372, quantity: 100, name: 'مشاهدات TikTok' },
    'instagram-likes': { serviceId: 17512, quantity: 10, name: 'لايكات Instagram' },
    'tiktok-likes': { serviceId: 17648, quantity: 10, name: 'لايكات TikTok' },
    'instagram-reels-views': { serviceId: 17337, quantity: 100, name: 'مشاهدات Reels' },
    'telegram-post-views': { serviceId: 15864, quantity: 10, name: 'مشاهدات بوست Telegram' },
    'telegram-interactions': { serviceId: 16682, quantity: 5, name: 'تفاعلات Telegram' },
    'telegram-members': { serviceId: 14680, quantity: 10, name: 'أعضاء Telegram' },
    'instagram-reels-shares': { serviceId: 14149, quantity: 100, name: 'مشاركات Reels' },
    'tiktok-shares': { serviceId: 17207, quantity: 10, name: 'مشاركات TikTok' },
    'facebook-views': { serviceId: 16930, quantity: 10, name: 'مشاهدات Facebook' },
    'instagram-reels-likes': { serviceId: 17758, quantity: 10, name: 'لايكات Reels' }
};

// Initialize files
function initializeFiles() {
    if (!fs.existsSync(REQUESTS_FILE)) {
        fs.writeFileSync(REQUESTS_FILE, JSON.stringify({}, null, 2));
    }
    if (!fs.existsSync(DEVICES_FILE)) {
        fs.writeFileSync(DEVICES_FILE, JSON.stringify({}, null, 2));
    }
    if (!fs.existsSync(FINGERPRINTS_FILE)) {
        fs.writeFileSync(FINGERPRINTS_FILE, JSON.stringify({}, null, 2));
    }
}

// Get IP address
function getIpAddress(req) {
    return req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
}

// Get User Agent
function getUserAgent(req) {
    return req.headers['user-agent'] || 'unknown';
}

// Generate advanced browser fingerprint
function generateAdvancedFingerprint(req, clientFingerprint) {
    const ip = getIpAddress(req);
    const userAgent = getUserAgent(req);
    
    const browserInfo = {
        userAgent: userAgent,
        acceptLanguage: req.headers['accept-language'] || 'unknown',
        acceptEncoding: req.headers['accept-encoding'] || 'unknown',
        referer: req.headers['referer'] || 'unknown'
    };
    
    const browserHash = crypto.createHash('sha256')
        .update(JSON.stringify(browserInfo))
        .digest('hex')
        .substring(0, 16);
    
    return {
        ip: ip,
        userAgent: userAgent,
        browserHash: browserHash,
        clientFingerprint: clientFingerprint,
        timestamp: Date.now()
    };
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

// Check security layers
function checkSecurityLayers(ip, userAgent, clientFingerprint, url) {
    console.log('\n🔐 Security Check - Multiple Layers:');
    console.log('═'.repeat(60));
    
    const requestsData = JSON.parse(fs.readFileSync(REQUESTS_FILE, 'utf-8'));
    const devicesData = JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf-8'));
    const fingerprintsData = JSON.parse(fs.readFileSync(FINGERPRINTS_FILE, 'utf-8'));
    
    const now = Date.now();
    
    // Layer 1: IP Check
    console.log('1️⃣ IP Address Check:');
    if (requestsData[ip]) {
        const lastRequestTime = requestsData[ip];
        const timeSinceLastRequest = now - lastRequestTime;
        console.log(`   Last request: ${formatTimeRemaining(timeSinceLastRequest)} ago`);
        if (timeSinceLastRequest < COOLDOWN_MS) {
            console.log(`   ❌ BLOCKED: IP cooldown not met`);
            return {
                allowed: false,
                reason: `IP cooldown: ${formatTimeRemaining(COOLDOWN_MS - timeSinceLastRequest)} remaining`,
                timeRemaining: COOLDOWN_MS - timeSinceLastRequest
            };
        }
    }
    console.log('   ✅ PASSED');
    
    // Layer 2: User Agent Check
    console.log('2️⃣ User Agent Check:');
    if (devicesData[userAgent]) {
        const lastRequestTime = devicesData[userAgent];
        const timeSinceLastRequest = now - lastRequestTime;
        console.log(`   Last request: ${formatTimeRemaining(timeSinceLastRequest)} ago`);
        if (timeSinceLastRequest < COOLDOWN_MS) {
            console.log(`   ❌ BLOCKED: Device cooldown not met`);
            return {
                allowed: false,
                reason: `Device cooldown: ${formatTimeRemaining(COOLDOWN_MS - timeSinceLastRequest)} remaining`,
                timeRemaining: COOLDOWN_MS - timeSinceLastRequest
            };
        }
    }
    console.log('   ✅ PASSED');
    
    // Layer 3: Client Fingerprint Check
    console.log('3️⃣ Client Fingerprint Check:');
    if (fingerprintsData[clientFingerprint]) {
        const lastRequestTime = fingerprintsData[clientFingerprint];
        const timeSinceLastRequest = now - lastRequestTime;
        console.log(`   Last request: ${formatTimeRemaining(timeSinceLastRequest)} ago`);
        if (timeSinceLastRequest < COOLDOWN_MS) {
            console.log(`   ❌ BLOCKED: Fingerprint cooldown not met`);
            return {
                allowed: false,
                reason: `Browser cooldown: ${formatTimeRemaining(COOLDOWN_MS - timeSinceLastRequest)} remaining`,
                timeRemaining: COOLDOWN_MS - timeSinceLastRequest
            };
        }
    }
    console.log('   ✅ PASSED');
    
    // Layer 4: URL Recency Check
    console.log('4️⃣ URL Recency Check:');
    const normalizedUrl = normalizeUrl(url);
    const urlKey = `${ip}:${normalizedUrl}`;
    if (requestsData[urlKey]) {
        const lastRequestTime = requestsData[urlKey];
        const timeSinceLastRequest = now - lastRequestTime;
        console.log(`   Last request to this URL: ${formatTimeRemaining(timeSinceLastRequest)} ago`);
        if (timeSinceLastRequest < COOLDOWN_MS) {
            console.log(`   ❌ BLOCKED: URL cooldown not met`);
            return {
                allowed: false,
                reason: `URL cooldown: ${formatTimeRemaining(COOLDOWN_MS - timeSinceLastRequest)} remaining`,
                timeRemaining: COOLDOWN_MS - timeSinceLastRequest
            };
        }
    }
    console.log('   ✅ PASSED');
    
    console.log('═'.repeat(60));
    console.log('✅ ALL SECURITY CHECKS PASSED\n');
    
    return { allowed: true };
}

// Update security data
function updateSecurityData(ip, userAgent, clientFingerprint, url) {
    const now = Date.now();
    const requestsData = JSON.parse(fs.readFileSync(REQUESTS_FILE, 'utf-8'));
    const devicesData = JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf-8'));
    const fingerprintsData = JSON.parse(fs.readFileSync(FINGERPRINTS_FILE, 'utf-8'));
    
    requestsData[ip] = now;
    devicesData[userAgent] = now;
    fingerprintsData[clientFingerprint] = now;
    
    const normalizedUrl = normalizeUrl(url);
    const urlKey = `${ip}:${normalizedUrl}`;
    requestsData[urlKey] = now;
    
    fs.writeFileSync(REQUESTS_FILE, JSON.stringify(requestsData, null, 2));
    fs.writeFileSync(DEVICES_FILE, JSON.stringify(devicesData, null, 2));
    fs.writeFileSync(FINGERPRINTS_FILE, JSON.stringify(fingerprintsData, null, 2));
}

// Generate Order ID
function generateOrderId() {
    return `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
}

// POST /api/order
app.post('/api/order', async (req, res) => {
    try {
        const { link, serviceId, quantity, clientFingerprint } = req.body;
        
        if (!link || !serviceId || !quantity || !clientFingerprint) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }
        
        const ip = getIpAddress(req);
        const userAgent = getUserAgent(req);
        
        console.log('\n📨 New Order Request:');
        console.log('═'.repeat(60));
        console.log(`Link: ${link}`);
        console.log(`Service ID: ${serviceId}`);
        console.log(`Quantity: ${quantity}`);
        console.log(`IP: ${ip}`);
        console.log(`User Agent: ${userAgent.substring(0, 50)}...`);
        
        // Security Check
        const securityCheck = checkSecurityLayers(ip, userAgent, clientFingerprint, link);
        
        if (!securityCheck.allowed) {
            console.log(`\n❌ Request REJECTED: ${securityCheck.reason}\n`);
            return res.status(429).json({
                success: false,
                error: securityCheck.reason,
                timeRemaining: securityCheck.timeRemaining
            });
        }
        
        // Send to external API
        console.log('\n📤 Sending to external API...');
        const externalResponse = await axios.post(EXTERNAL_API, {
            api_key: API_KEY,
            service: serviceId,
            link: link,
            quantity: quantity
        }, {
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!externalResponse.data || !externalResponse.data.order) {
            console.log('❌ External API Error\n');
            return res.status(500).json({
                success: false,
                error: 'External API error'
            });
        }
        
        // Update security data
        updateSecurityData(ip, userAgent, clientFingerprint, link);
        
        const orderId = externalResponse.data.order;
        const nextAllowedTime = new Date(Date.now() + COOLDOWN_MS).toISOString();
        
        console.log(`✅ Order Created: ${orderId}`);
        console.log(`Next allowed request: ${formatTimeRemaining(COOLDOWN_MS)}\n`);
        
        res.json({
            success: true,
            orderId: orderId,
            nextAllowedTime: nextAllowedTime,
            message: 'Order created successfully'
        });
        
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Server error: ' + error.message
        });
    }
});

// GET /api/config
app.get('/api/config', (req, res) => {
    res.json({
        success: true,
        data: SERVICES_CONFIG
    });
});

// GET /api/health
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

// GET /api/stats
app.get('/api/stats', (req, res) => {
    try {
        const requestsData = JSON.parse(fs.readFileSync(REQUESTS_FILE, 'utf-8'));
        const devicesData = JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf-8'));
        const fingerprintsData = JSON.parse(fs.readFileSync(FINGERPRINTS_FILE, 'utf-8'));
        
        res.json({
            success: true,
            stats: {
                totalIPs: Object.keys(requestsData).length,
                totalDevices: Object.keys(devicesData).length,
                totalFingerprints: Object.keys(fingerprintsData).length,
                cooldownMinutes: COOLDOWN_MS / 1000 / 60
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Initialize and start server
initializeFiles();

app.listen(PORT, () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`📡 API Key: ${API_KEY.substring(0, 8)}...`);
    console.log(`⏱️ Cooldown: ${COOLDOWN_MS / 1000 / 60} minutes`);
    console.log(`🔐 Security Layers: IP + User Agent + Fingerprint + URL Recency\n`);
});
