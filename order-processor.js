const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 10001;

app.use(express.json());
app.use(cors());

// Configuration
const ADMIN_API_URL = 'https://kd1s.com/admin/adminapi/v2/';
const ADMIN_API_KEY = '9495qsacgcm64hj0z1sprxce7qj0nkbh71w6h6xumigan8h141koirzkxwoqg48b';
const EXTERNAL_API_URL = 'https://kd1s.com/apikd1s';
const EXTERNAL_API_KEY = 'ce5d33dc71b144c60cab2f8f977bbc21';

const SERVICE_ID_TO_CHECK = 17337; // الخدمة المراد فحصها
const SERVICE_ID_TO_FORWARD = 17828; // الخدمة المراد إرسالها
const DUPLICATE_CHECK_WINDOW = 30 * 60 * 1000; // 30 دقيقة

// Data files
const PROCESSED_ORDERS_FILE = path.join(__dirname, 'processed_orders.json');
const USER_ORDERS_FILE = path.join(__dirname, 'user_orders.json');
const URL_ORDERS_FILE = path.join(__dirname, 'url_orders.json');

// Initialize files
function initializeFiles() {
    if (!fs.existsSync(PROCESSED_ORDERS_FILE)) {
        fs.writeFileSync(PROCESSED_ORDERS_FILE, JSON.stringify({}, null, 2));
    }
    if (!fs.existsSync(USER_ORDERS_FILE)) {
        fs.writeFileSync(USER_ORDERS_FILE, JSON.stringify({}, null, 2));
    }
    if (!fs.existsSync(URL_ORDERS_FILE)) {
        fs.writeFileSync(URL_ORDERS_FILE, JSON.stringify({}, null, 2));
    }
}

// Utility functions
function normalizeUrl(url) {
    try {
        // إزالة البروتوكول والـ www والمعاملات
        let normalized = url.replace(/^(https?:\/\/)?(www\.)?/, '').split('?')[0].split('#')[0];
        // إزالة الـ trailing slash
        normalized = normalized.replace(/\/$/, '');
        return normalized.toLowerCase();
    } catch (error) {
        return url.toLowerCase();
    }
}

function generateOrderHash(userId) {
    return crypto.createHash('md5').update(userId).digest('hex');
}

function loadJsonFile(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        return {};
    }
}

function saveJsonFile(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Check if user made an order within 30 minutes
function checkUserDuplicate(userId) {
    const userOrders = loadJsonFile(USER_ORDERS_FILE);
    const userHash = generateOrderHash(userId);
    
    if (userOrders[userHash]) {
        const lastOrderTime = userOrders[userHash];
        const timeSinceLastOrder = Date.now() - lastOrderTime;
        
        if (timeSinceLastOrder < DUPLICATE_CHECK_WINDOW) {
            return {
                isDuplicate: true,
                timeSinceLastOrder: timeSinceLastOrder,
                nextAllowedTime: lastOrderTime + DUPLICATE_CHECK_WINDOW
            };
        }
    }
    
    return { isDuplicate: false };
}

// Check if URL was used within 30 minutes
function checkUrlDuplicate(url) {
    const urlOrders = loadJsonFile(URL_ORDERS_FILE);
    const normalizedUrl = normalizeUrl(url);
    const urlHash = crypto.createHash('md5').update(normalizedUrl).digest('hex');
    
    if (urlOrders[urlHash]) {
        const lastOrderTime = urlOrders[urlHash];
        const timeSinceLastOrder = Date.now() - lastOrderTime;
        
        if (timeSinceLastOrder < DUPLICATE_CHECK_WINDOW) {
            return {
                isDuplicate: true,
                timeSinceLastOrder: timeSinceLastOrder,
                nextAllowedTime: lastOrderTime + DUPLICATE_CHECK_WINDOW
            };
        }
    }
    
    return { isDuplicate: false };
}

// Record user order
function recordUserOrder(userId) {
    const userOrders = loadJsonFile(USER_ORDERS_FILE);
    const userHash = generateOrderHash(userId);
    userOrders[userHash] = Date.now();
    saveJsonFile(USER_ORDERS_FILE, userOrders);
}

// Record URL order
function recordUrlOrder(url) {
    const urlOrders = loadJsonFile(URL_ORDERS_FILE);
    const normalizedUrl = normalizeUrl(url);
    const urlHash = crypto.createHash('md5').update(normalizedUrl).digest('hex');
    urlOrders[urlHash] = Date.now();
    saveJsonFile(URL_ORDERS_FILE, urlOrders);
}

// Fetch pending orders from admin API
async function fetchPendingOrders() {
    try {
        const response = await axios.get(`${ADMIN_API_URL}orders`, {
            params: {
                api_key: ADMIN_API_KEY,
                service: SERVICE_ID_TO_CHECK,
                status: 'Pending'
            },
            timeout: 30000
        });
        
        return response.data.data || [];
    } catch (error) {
        console.error('Error fetching pending orders:', error.message);
        return [];
    }
}

// Cancel and refund order
async function cancelAndRefundOrder(orderId) {
    try {
        const response = await axios.post(`${ADMIN_API_URL}orders/${orderId}/cancel`, {
            api_key: ADMIN_API_KEY
        }, {
            timeout: 30000
        });
        
        console.log(`Order ${orderId} cancelled and refunded`);
        return true;
    } catch (error) {
        console.error(`Error cancelling order ${orderId}:`, error.message);
        return false;
    }
}

// Forward order to external API
async function forwardOrderToExternalAPI(orderId, quantity, url) {
    try {
        const response = await axios.post(EXTERNAL_API_URL, {
            api_key: EXTERNAL_API_KEY,
            service: SERVICE_ID_TO_FORWARD,
            link: url,
            quantity: quantity
        }, {
            timeout: 30000
        });
        
        console.log(`Order ${orderId} forwarded to external API`);
        return {
            success: true,
            externalOrderId: response.data.order_id || orderId,
            response: response.data
        };
    } catch (error) {
        console.error(`Error forwarding order ${orderId}:`, error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

// Process single order
async function processSingleOrder(order) {
    const orderId = order.id;
    const userId = order.user_id || order.username || 'unknown';
    const orderUrl = order.link || '';
    const quantity = order.quantity || 0;
    
    console.log(`\n=== Processing Order ${orderId} ===`);
    console.log(`User: ${userId}, URL: ${orderUrl}, Quantity: ${quantity}`);
    
    // Check if order was already processed
    const processedOrders = loadJsonFile(PROCESSED_ORDERS_FILE);
    if (processedOrders[orderId]) {
        console.log(`Order ${orderId} already processed`);
        return { status: 'skipped', reason: 'already_processed' };
    }
    
    // Step 1: Check user duplicate
    const userDuplicateCheck = checkUserDuplicate(userId);
    if (userDuplicateCheck.isDuplicate) {
        console.log(`User ${userId} has duplicate order within 30 minutes - CANCELLING`);
        await cancelAndRefundOrder(orderId);
        processedOrders[orderId] = {
            status: 'cancelled',
            reason: 'user_duplicate',
            timestamp: Date.now()
        };
        saveJsonFile(PROCESSED_ORDERS_FILE, processedOrders);
        return { status: 'cancelled', reason: 'user_duplicate' };
    }
    
    // Step 2: Check URL duplicate
    const urlDuplicateCheck = checkUrlDuplicate(orderUrl);
    if (urlDuplicateCheck.isDuplicate) {
        console.log(`URL ${orderUrl} has duplicate order within 30 minutes - CANCELLING`);
        await cancelAndRefundOrder(orderId);
        processedOrders[orderId] = {
            status: 'cancelled',
            reason: 'url_duplicate',
            timestamp: Date.now()
        };
        saveJsonFile(PROCESSED_ORDERS_FILE, processedOrders);
        return { status: 'cancelled', reason: 'url_duplicate' };
    }
    
    // Step 3: Forward to external API
    console.log(`Order ${orderId} passed all checks - forwarding to external API`);
    const forwardResult = await forwardOrderToExternalAPI(orderId, quantity, orderUrl);
    
    if (forwardResult.success) {
        // Record successful order
        recordUserOrder(userId);
        recordUrlOrder(orderUrl);
        
        processedOrders[orderId] = {
            status: 'forwarded',
            externalOrderId: forwardResult.externalOrderId,
            timestamp: Date.now()
        };
        saveJsonFile(PROCESSED_ORDERS_FILE, processedOrders);
        
        console.log(`Order ${orderId} successfully forwarded`);
        return { status: 'forwarded', externalOrderId: forwardResult.externalOrderId };
    } else {
        console.log(`Failed to forward order ${orderId}: ${forwardResult.error}`);
        return { status: 'failed', error: forwardResult.error };
    }
}

// Main processing function
async function processOrders() {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Processing started at ${new Date().toISOString()}`);
    console.log(`${'='.repeat(50)}`);
    
    try {
        const pendingOrders = await fetchPendingOrders();
        console.log(`Found ${pendingOrders.length} pending orders`);
        
        if (pendingOrders.length === 0) {
            console.log('No pending orders to process');
            return;
        }
        
        let successCount = 0;
        let cancelledCount = 0;
        let failedCount = 0;
        
        for (const order of pendingOrders) {
            const result = await processSingleOrder(order);
            
            if (result.status === 'forwarded') {
                successCount++;
            } else if (result.status === 'cancelled') {
                cancelledCount++;
            } else if (result.status === 'failed') {
                failedCount++;
            }
            
            // Add delay between requests to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.log(`\n${'='.repeat(50)}`);
        console.log(`Processing completed`);
        console.log(`✅ Forwarded: ${successCount}`);
        console.log(`❌ Cancelled: ${cancelledCount}`);
        console.log(`⚠️ Failed: ${failedCount}`);
        console.log(`${'='.repeat(50)}\n`);
        
    } catch (error) {
        console.error('Error in processOrders:', error);
    }
}

// API Endpoints
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'order-processor',
        version: '1.0.0'
    });
});

app.get('/api/stats', (req, res) => {
    const processedOrders = loadJsonFile(PROCESSED_ORDERS_FILE);
    const userOrders = loadJsonFile(USER_ORDERS_FILE);
    const urlOrders = loadJsonFile(URL_ORDERS_FILE);
    
    const stats = {
        totalProcessed: Object.keys(processedOrders).length,
        totalUsers: Object.keys(userOrders).length,
        totalUrls: Object.keys(urlOrders).length,
        processedOrders: processedOrders,
        timestamp: new Date().toISOString()
    };
    
    res.json(stats);
});

app.post('/api/process-now', async (req, res) => {
    const key = req.body.key || req.query.key;
    
    if (key !== ADMIN_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    try {
        await processOrders();
        res.json({ status: 'processing_started' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/config', (req, res) => {
    res.json({
        SERVICE_ID_TO_CHECK,
        SERVICE_ID_TO_FORWARD,
        DUPLICATE_CHECK_WINDOW: `${DUPLICATE_CHECK_WINDOW / 60000} minutes`,
        ADMIN_API_URL,
        EXTERNAL_API_URL
    });
});

// Initialize and start server
initializeFiles();

app.listen(PORT, () => {
    console.log(`Order Processor Server running on port ${PORT}`);
    console.log(`Service ID to check: ${SERVICE_ID_TO_CHECK}`);
    console.log(`Service ID to forward: ${SERVICE_ID_TO_FORWARD}`);
    console.log(`Duplicate check window: ${DUPLICATE_CHECK_WINDOW / 60000} minutes`);
});

// Process orders every 5 minutes
setInterval(processOrders, 5 * 60 * 1000);

// Process orders on startup after 10 seconds
setTimeout(processOrders, 10 * 1000);

module.exports = app;
