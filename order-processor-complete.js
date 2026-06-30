const express = require('express');
const axios = require('axios');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 10001;

// Middleware
app.use(express.json());
app.use(cors());

// Configuration
const CONFIG = {
  ADMIN_API_URL: 'https://kd1s.com/admin/adminapi/v2/',
  ADMIN_API_KEY: '9495qsacgcm64hj0z1sprxce7qj0nkbh71w6h6xumigan8h141koirzkxwoqg48b',
  EXTERNAL_API_URL: 'https://kd1s.com/apikd1s',
  EXTERNAL_API_KEY: 'ce5d33dc71b144c60cab2f8f977bbc21',
  SERVICE_TO_MONITOR: 17337,
  SERVICE_TO_SEND: 17828,
  COOLDOWN_MS: 30 * 60 * 1000, // 30 minutes
  PROCESSING_INTERVAL: 5 * 60 * 1000, // 5 minutes
};

// In-memory storage for tracking
const requestCache = new Map();
const userCooldown = new Map();
const urlCooldown = new Map();

// Utility functions
function hashUrl(url) {
  return crypto.createHash('sha256').update(url).digest('hex');
}

function normalizeUrl(url) {
  try {
    const urlObj = new URL(url);
    return `${urlObj.hostname}${urlObj.pathname}`;
  } catch {
    return url;
  }
}

function getClientFingerprint(req) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const userAgent = req.get('user-agent') || 'unknown';
  return crypto.createHash('sha256').update(`${ip}${userAgent}`).digest('hex');
}

// API Endpoints
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'Server is running',
    timestamp: new Date().toISOString(),
    service: 'Order Processor',
    version: '2.0.0'
  });
});

app.get('/api/stats', (req, res) => {
  res.json({
    success: true,
    stats: {
      totalRequests: requestCache.size,
      activeUsers: userCooldown.size,
      trackedUrls: urlCooldown.size,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    }
  });
});

app.get('/api/config', (req, res) => {
  res.json({
    success: true,
    config: {
      serviceToMonitor: CONFIG.SERVICE_TO_MONITOR,
      serviceToSend: CONFIG.SERVICE_TO_SEND,
      cooldownMinutes: CONFIG.COOLDOWN_MS / 60000,
      processingIntervalMinutes: CONFIG.PROCESSING_INTERVAL / 60000
    }
  });
});

app.post('/api/order', async (req, res) => {
  try {
    const { service_id, url, quantity } = req.body;

    if (!service_id || !url || !quantity) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: service_id, url, quantity'
      });
    }

    const fingerprint = getClientFingerprint(req);
    const normalizedUrl = normalizeUrl(url);
    const urlHash = hashUrl(normalizedUrl);

    // Check user cooldown
    if (userCooldown.has(fingerprint)) {
      const cooldownEnd = userCooldown.get(fingerprint);
      const remainingTime = Math.max(0, cooldownEnd - Date.now());
      if (remainingTime > 0) {
        return res.status(429).json({
          success: false,
          error: 'Too many requests. Please wait.',
          remainingSeconds: Math.ceil(remainingTime / 1000)
        });
      }
    }

    // Check URL cooldown
    if (urlCooldown.has(urlHash)) {
      const cooldownEnd = urlCooldown.get(urlHash);
      const remainingTime = Math.max(0, cooldownEnd - Date.now());
      if (remainingTime > 0) {
        return res.status(429).json({
          success: false,
          error: 'This URL was recently used. Please wait.',
          remainingSeconds: Math.ceil(remainingTime / 1000)
        });
      }
    }

    // Create order
    const orderId = crypto.randomBytes(8).toString('hex').toUpperCase();
    const order = {
      id: orderId,
      service_id,
      url,
      quantity,
      status: 'pending',
      created_at: new Date().toISOString(),
      fingerprint,
      urlHash
    };

    requestCache.set(orderId, order);

    // Set cooldowns
    userCooldown.set(fingerprint, Date.now() + CONFIG.COOLDOWN_MS);
    urlCooldown.set(urlHash, Date.now() + CONFIG.COOLDOWN_MS);

    res.json({
      success: true,
      order: {
        id: orderId,
        status: 'created',
        message: 'Order created successfully',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Order processing function
async function processOrders() {
  try {
    console.log('[' + new Date().toISOString() + '] Starting order processing...');

    // Fetch pending orders from admin API
    const response = await axios.get(
      `${CONFIG.ADMIN_API_URL}?key=${CONFIG.ADMIN_API_KEY}&action=get_orders&service=${CONFIG.SERVICE_TO_MONITOR}&status=pending`,
      { timeout: 10000 }
    );

    if (!response.data || !Array.isArray(response.data)) {
      console.log('No orders found or invalid response');
      return;
    }

    console.log(`Found ${response.data.length} pending orders`);

    for (const order of response.data) {
      try {
        // Check for duplicate user
        const userOrders = Array.from(requestCache.values()).filter(
          o => o.fingerprint === order.user_id && o.created_at > new Date(Date.now() - CONFIG.COOLDOWN_MS).toISOString()
        );

        if (userOrders.length > 1) {
          console.log(`[${order.id}] Duplicate user detected. Cancelling...`);
          await cancelAndRefund(order.id);
          continue;
        }

        // Check for duplicate URL
        const normalizedUrl = normalizeUrl(order.url);
        const urlHash = hashUrl(normalizedUrl);
        const urlOrders = Array.from(requestCache.values()).filter(
          o => o.urlHash === urlHash && o.created_at > new Date(Date.now() - CONFIG.COOLDOWN_MS).toISOString()
        );

        if (urlOrders.length > 1) {
          console.log(`[${order.id}] Duplicate URL detected. Cancelling...`);
          await cancelAndRefund(order.id);
          continue;
        }

        // Forward to external API
        console.log(`[${order.id}] Processing order...`);
        await forwardOrder(order);

      } catch (error) {
        console.error(`Error processing order ${order.id}:`, error.message);
      }
    }

  } catch (error) {
    console.error('Error in processOrders:', error.message);
  }
}

async function cancelAndRefund(orderId) {
  try {
    const response = await axios.post(
      `${CONFIG.ADMIN_API_URL}?key=${CONFIG.ADMIN_API_KEY}&action=cancel_order&order_id=${orderId}`,
      {},
      { timeout: 10000 }
    );
    console.log(`Order ${orderId} cancelled and refunded`);
  } catch (error) {
    console.error(`Error cancelling order ${orderId}:`, error.message);
  }
}

async function forwardOrder(order) {
  try {
    const response = await axios.post(
      `${CONFIG.EXTERNAL_API_URL}?key=${CONFIG.EXTERNAL_API_KEY}`,
      {
        service: CONFIG.SERVICE_TO_SEND,
        url: order.url,
        quantity: order.quantity
      },
      { timeout: 10000 }
    );

    console.log(`Order ${order.id} forwarded successfully`);
    return response.data;
  } catch (error) {
    console.error(`Error forwarding order ${order.id}:`, error.message);
    throw error;
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`✅ Order Processor Server running on port ${PORT}`);
  console.log(`📊 Service to monitor: ${CONFIG.SERVICE_TO_MONITOR}`);
  console.log(`📤 Service to send: ${CONFIG.SERVICE_TO_SEND}`);
  console.log(`⏱️  Cooldown: ${CONFIG.COOLDOWN_MS / 60000} minutes`);
  console.log(`🔄 Processing interval: ${CONFIG.PROCESSING_INTERVAL / 60000} minutes`);
});

// Start processing orders every 5 minutes
setInterval(processOrders, CONFIG.PROCESSING_INTERVAL);

// Process orders immediately on startup
processOrders();

module.exports = app;
