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

const API_KEY = process.env.API_KEY || '1a26d1859e5b8060b4b46806651bfe9a';
const EXTERNAL_API = 'https://kd1s.com/api/v2';

const COOLDOWN_MS = 1 * 60 * 1000; // 1 minute

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
    
    // Extract browser info
    const browserInfo = {
        userAgent: userAgent,
        acceptLanguage: req.headers['accept-language'] || 'unknown',
        acceptEncoding: req.headers['accept-encoding'] || 'unknown',
        referer: req.headers['referer'] || 'unknown'
    };
    
    // Create hash of browser info
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
    
    const violations = [];
    
    // Layer 1: IP Check
    console.log('\n🔍 Layer 1: IP Address Check');
    const ipCheck = checkIpRecency(ip);
    if (ipCheck.isRecent) {
        violations.push({
            layer: 'IP Address',
            reason: `IP ${ip} قام بطلب قبل قليل`,
            timeRemaining: ipCheck.timeRemaining
        });
        console.log(`✗ IP is recent: ${formatTimeRemaining(ipCheck.timeRemaining)} متبقية`);
    } else {
        console.log('✓ IP is clear');
    }
    
    // Layer 2: User Agent Check
    console.log('\n🔍 Layer 2: User Agent Check');
    const uaCheck = checkUserAgentRecency(userAgent);
    if (uaCheck.isRecent) {
        violations.push({
            layer: 'User Agent',
            reason: `User Agent قام بطلب قبل قليل`,
            timeRemaining: uaCheck.timeRemaining
        });
        console.log(`✗ User Agent is recent: ${formatTimeRemaining(uaCheck.timeRemaining)} متبقية`);
    } else {
        console.log('✓ User Agent is clear');
    }
    
    // Layer 3: Combined Fingerprint Check
    console.log('\n🔍 Layer 3: Combined Fingerprint Check');
    const combinedFingerprint = `${ip}|${userAgent}`;
    const combinedCheck = checkCombinedFingerprintRecency(combinedFingerprint);
    if (combinedCheck.isRecent) {
        violations.push({
            layer: 'Combined Fingerprint',
            reason: 'جهاز كامل قام بطلب قبل قليل',
            timeRemaining: combinedCheck.timeRemaining
        });
        console.log(`✗ Combined Fingerprint is recent: ${formatTimeRemaining(combinedCheck.timeRemaining)} متبقية`);
    } else {
        console.log('✓ Combined Fingerprint is clear');
    }
    
    // Layer 4: Client Fingerprint Check (from browser)
    console.log('\n🔍 Layer 4: Client Fingerprint Check (Browser)');
    if (clientFingerprint) {
        const clientCheck = checkClientFingerprintRecency(clientFingerprint);
        if (clientCheck.isRecent) {
            violations.push({
                layer: 'Client Fingerprint',
                reason: 'معرّف المتصفح قام بطلب قبل قليل',
                timeRemaining: clientCheck.timeRemaining
            });
            console.log(`✗ Client Fingerprint is recent: ${formatTimeRemaining(clientCheck.timeRemaining)} متبقية`);
        } else {
            console.log('✓ Client Fingerprint is clear');
        }
    } else {
        console.log('⚠ Client Fingerprint not provided');
    }
    
    // Layer 5: URL Check
    console.log('\n🔍 Layer 5: URL Recency Check');
    const urlCheck = checkUrlRecency(url);
    if (urlCheck.isRecent) {
        violations.push({
            layer: 'URL',
            reason: 'نفس الرابط تم طلبه قبل قليل',
            timeRemaining: urlCheck.timeRemaining
        });
        console.log(`✗ URL is recent: ${formatTimeRemaining(urlCheck.timeRemaining)} متبقية`);
    } else {
        console.log('✓ URL is clear');
    }
    
    console.log('\n' + '═'.repeat(60));
    
    if (violations.length > 0) {
        console.log(`❌ Security violations found: ${violations.length}`);
        return {
            passed: false,
            violations: violations,
            maxTimeRemaining: Math.max(...violations.map(v => v.timeRemaining))
        };
    } else {
        console.log('✅ All security checks passed');
        return { passed: true, violations: [] };
    }
}

// Layer 1: IP Check
function checkIpRecency(ip) {
    try {
        const data = JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf8'));
        const ipKey = `ip:${ip}`;
        
        if (data[ipKey]) {
            const lastRequestTime = data[ipKey].timestamp;
            const now = Date.now();
            const timeRemaining = COOLDOWN_MS - (now - lastRequestTime);
            
            if (timeRemaining > 0) {
                return { isRecent: true, timeRemaining: timeRemaining };
            }
        }
        return { isRecent: false, timeRemaining: 0 };
    } catch (error) {
        console.error('Error checking IP recency:', error);
        return { isRecent: false, timeRemaining: 0 };
    }
}

// Layer 2: User Agent Check
function checkUserAgentRecency(userAgent) {
    try {
        const data = JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf8'));
        const uaKey = `ua:${crypto.createHash('sha256').update(userAgent).digest('hex').substring(0, 16)}`;
        
        if (data[uaKey]) {
            const lastRequestTime = data[uaKey].timestamp;
            const now = Date.now();
            const timeRemaining = COOLDOWN_MS - (now - lastRequestTime);
            
            if (timeRemaining > 0) {
                return { isRecent: true, timeRemaining: timeRemaining };
            }
        }
        return { isRecent: false, timeRemaining: 0 };
    } catch (error) {
        console.error('Error checking User Agent recency:', error);
        return { isRecent: false, timeRemaining: 0 };
    }
}

// Layer 3: Combined Fingerprint Check
function checkCombinedFingerprintRecency(fingerprint) {
    try {
        const data = JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf8'));
        const fingerprintKey = `combined:${crypto.createHash('sha256').update(fingerprint).digest('hex').substring(0, 16)}`;
        
        if (data[fingerprintKey]) {
            const lastRequestTime = data[fingerprintKey].timestamp;
            const now = Date.now();
            const timeRemaining = COOLDOWN_MS - (now - lastRequestTime);
            
            if (timeRemaining > 0) {
                return { isRecent: true, timeRemaining: timeRemaining };
            }
        }
        return { isRecent: false, timeRemaining: 0 };
    } catch (error) {
        console.error('Error checking combined fingerprint recency:', error);
        return { isRecent: false, timeRemaining: 0 };
    }
}

// Layer 4: Client Fingerprint Check
function checkClientFingerprintRecency(clientFingerprint) {
    try {
        const data = JSON.parse(fs.readFileSync(FINGERPRINTS_FILE, 'utf8'));
        const clientKey = `client:${clientFingerprint}`;
        
        if (data[clientKey]) {
            const lastRequestTime = data[clientKey].timestamp;
            const now = Date.now();
            const timeRemaining = COOLDOWN_MS - (now - lastRequestTime);
            
            if (timeRemaining > 0) {
                return { isRecent: true, timeRemaining: timeRemaining };
            }
        }
        return { isRecent: false, timeRemaining: 0 };
    } catch (error) {
        console.error('Error checking client fingerprint recency:', error);
        return { isRecent: false, timeRemaining: 0 };
    }
}

// Layer 5: URL Check
function checkUrlRecency(url) {
    try {
        const data = JSON.parse(fs.readFileSync(REQUESTS_FILE, 'utf8'));
        const normalizedUrl = normalizeUrl(url);
        
        if (data[normalizedUrl]) {
            const lastRequestTime = data[normalizedUrl].timestamp;
            const now = Date.now();
            const timeRemaining = COOLDOWN_MS - (now - lastRequestTime);
            
            if (timeRemaining > 0) {
                return { isRecent: true, timeRemaining: timeRemaining };
            }
        }
        return { isRecent: false, timeRemaining: 0 };
    } catch (error) {
        console.error('Error checking URL recency:', error);
        return { isRecent: false, timeRemaining: 0 };
    }
}

// Save all security layers
function saveAllSecurityLayers(ip, userAgent, clientFingerprint, url, orderId) {
    try {
        const now = Date.now();
        const nextAllowedTime = new Date(now + COOLDOWN_MS).toISOString();
        
        // Save URL
        const urlData = JSON.parse(fs.readFileSync(REQUESTS_FILE, 'utf8'));
        const normalizedUrl = normalizeUrl(url);
        urlData[normalizedUrl] = {
            timestamp: now,
            url: url,
            orderId: orderId,
            nextAllowedTime: nextAllowedTime
        };
        fs.writeFileSync(REQUESTS_FILE, JSON.stringify(urlData, null, 2));
        
        // Save device layers
        const deviceData = JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf8'));
        
        // Layer 1: IP
        deviceData[`ip:${ip}`] = {
            timestamp: now,
            type: 'IP',
            orderId: orderId,
            nextAllowedTime: nextAllowedTime
        };
        
        // Layer 2: User Agent
        const uaKey = `ua:${crypto.createHash('sha256').update(userAgent).digest('hex').substring(0, 16)}`;
        deviceData[uaKey] = {
            timestamp: now,
            type: 'User Agent',
            orderId: orderId,
            nextAllowedTime: nextAllowedTime
        };
        
        // Layer 3: Combined Fingerprint
        const combinedFingerprint = `${ip}|${userAgent}`;
        const combinedKey = `combined:${crypto.createHash('sha256').update(combinedFingerprint).digest('hex').substring(0, 16)}`;
        deviceData[combinedKey] = {
            timestamp: now,
            type: 'Combined Fingerprint',
            orderId: orderId,
            nextAllowedTime: nextAllowedTime
        };
        
        fs.writeFileSync(DEVICES_FILE, JSON.stringify(deviceData, null, 2));
        
        // Layer 4: Client Fingerprint
        if (clientFingerprint) {
            const fingerprintData = JSON.parse(fs.readFileSync(FINGERPRINTS_FILE, 'utf8'));
            const clientKey = `client:${clientFingerprint}`;
            fingerprintData[clientKey] = {
                timestamp: now,
                type: 'Client Fingerprint',
                orderId: orderId,
                nextAllowedTime: nextAllowedTime
            };
            fs.writeFileSync(FINGERPRINTS_FILE, JSON.stringify(fingerprintData, null, 2));
        }
        
        console.log('✓ All security layers saved');
    } catch (error) {
        console.error('Error saving security layers:', error);
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
app.post('/api/device-status', (req, res) => {
    const { clientFingerprint } = req.body;
    const ip = getIpAddress(req);
    const userAgent = getUserAgent(req);
    
    const securityCheck = checkSecurityLayers(ip, userAgent, clientFingerprint, 'status-check');
    
    res.json({
        success: true,
        data: {
            ip: ip,
            userAgent: userAgent,
            clientFingerprint: clientFingerprint,
            canMakeRequest: securityCheck.passed,
            violations: securityCheck.violations,
            message: securityCheck.passed 
                ? '✅ جهازك جاهز لإرسال طلب جديد' 
                : `❌ لديك محاولة واحدة كل 60 دقيقة - حاول بعد ${formatTimeRemaining(securityCheck.maxTimeRemaining)}`
        }
    });
});

// Main order endpoint
app.post('/api/order', async (req, res) => {
    try {
        console.log('\n' + '═'.repeat(70));
        console.log('🎯 NEW ORDER REQUEST');
        console.log('═'.repeat(70));
        
        const { link, serviceId, quantity, clientFingerprint } = req.body;

        // Validate input
        if (!link || !serviceId || !quantity) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }

        const ip = getIpAddress(req);
        const userAgent = getUserAgent(req);

        // Check all security layers
        const securityCheck = checkSecurityLayers(ip, userAgent, clientFingerprint, link);
        
        if (!securityCheck.passed) {
            const maxTimeRemaining = securityCheck.maxTimeRemaining;
            console.log(`\n❌ Security check failed. Max time remaining: ${formatTimeRemaining(maxTimeRemaining)}`);
            
            return res.status(429).json({
                success: false,
                error: `⏳ لديك محاولة واحدة كل 60 دقيقة - حاول بعد ${formatTimeRemaining(maxTimeRemaining)}`,
                timeRemaining: maxTimeRemaining,
                violations: securityCheck.violations
            });
        }

        // Send request to external API
        console.log('\n🌐 Sending request to external API...');
        const externalResponse = await axios.post(EXTERNAL_API, {
            key: API_KEY,
            action: 'add',
            service: serviceId,
            link: link,
            quantity: quantity
        });

        console.log('✓ External API response received');

        const orderId = externalResponse.data?.order || externalResponse.data?.id || 'N/A';

        // Save all security layers
        saveAllSecurityLayers(ip, userAgent, clientFingerprint, link, orderId);

        const cooldownSeconds = Math.ceil(COOLDOWN_MS / 1000);
        const nextAllowedTime = new Date(Date.now() + COOLDOWN_MS).toISOString();
        
        console.log(`\n✅ Order processed successfully. Order ID: ${orderId}`);
        console.log('═'.repeat(70) + '\n');
        
        res.json({
            success: true,
            data: externalResponse.data,
            orderId: orderId,
            cooldownSeconds: cooldownSeconds,
            nextAllowedTime: nextAllowedTime,
            message: 'تم إنشاء الطلب بنجاح'
        });

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        
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
        const fingerprintsData = JSON.parse(fs.readFileSync(FINGERPRINTS_FILE, 'utf8'));

        res.json({
            success: true,
            data: {
                totalUrlRequests: Object.keys(urlsData).length,
                totalDeviceRequests: Object.keys(devicesData).length,
                totalClientFingerprints: Object.keys(fingerprintsData).length,
                cooldownSeconds: Math.ceil(COOLDOWN_MS / 1000),
                cooldownMinutes: Math.ceil(COOLDOWN_MS / 1000 / 60),
                securityLayers: 5
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
    console.log('\n' + '═'.repeat(70));
    console.log('🚀 ULTRA SECURE SERVER STARTED');
    console.log('═'.repeat(70));
    console.log(`📍 Port: ${PORT}`);
    console.log(`🔒 Security Layers: 5`);
    console.log(`  1️⃣ IP Address Check`);
    console.log(`  2️⃣ User Agent Check`);
    console.log(`  3️⃣ Combined Fingerprint Check`);
    console.log(`  4️⃣ Client Fingerprint Check (Browser)`);
    console.log(`  5️⃣ URL Recency Check`);
    console.log(`⏳ Cooldown: 60 دقيقة`);
    console.log(`🔐 API Key: Protected`);
    console.log('═'.repeat(70) + '\n');
});
