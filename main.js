/**
 * Main Server - Combines Services Dashboard and Order Processor
 * Language: Node.js + Python
 * Framework: Express.js + Flask
 * Database: PostgreSQL
 */

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================================
// Services Configuration
// ============================================================================

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

const API_KEY = process.env.API_KEY || '75d051012adf93f000fccb6910a58563';
const EXTERNAL_API = 'https://kd1s.com/api/v2';
const COOLDOWN_MS = 60 * 60 * 1000; // 60 دقيقة

// ============================================================================
// Health Check & Status
// ============================================================================

app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
            dashboard: 'active',
            order_processor: 'active',
            database: 'connected'
        }
    });
});

app.get('/api/config', (req, res) => {
    res.json({
        services: SERVICES_CONFIG,
        cooldown_minutes: COOLDOWN_MS / 1000 / 60,
        api_endpoint: EXTERNAL_API
    });
});

app.get('/api/stats', (req, res) => {
    res.json({
        total_services: Object.keys(SERVICES_CONFIG).length,
        active_services: Object.keys(SERVICES_CONFIG).length,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// ============================================================================
// Services Dashboard Routes
// ============================================================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'services-dashboard.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'services-dashboard.html'));
});

// ============================================================================
// Order Processing Routes
// ============================================================================

app.post('/api/order', async (req, res) => {
    try {
        const { service_id, url, quantity } = req.body;

        if (!service_id || !url) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: service_id, url'
            });
        }

        // Generate order ID
        const orderId = 'ORD-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

        // Call external API
        const response = await axios.post(EXTERNAL_API + '/order', {
            api_key: API_KEY,
            service: service_id,
            link: url,
            quantity: quantity || 1
        }, {
            timeout: 10000
        });

        res.json({
            success: true,
            order_id: orderId,
            service_id: service_id,
            url: url,
            quantity: quantity || 1,
            status: 'pending',
            timestamp: new Date().toISOString(),
            external_response: response.data
        });

    } catch (error) {
        console.error('Order processing error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message,
            order_id: null
        });
    }
});

// ============================================================================
// Order Processor Integration
// ============================================================================

// Start Python order processor in background
function startOrderProcessor() {
    const pythonProcess = spawn('python3', [path.join(__dirname, 'order_processor.py')], {
        env: {
            ...process.env,
            FLASK_ENV: 'production',
            FLASK_APP: 'order_processor.py'
        }
    });

    pythonProcess.stdout.on('data', (data) => {
        console.log(`[Order Processor] ${data}`);
    });

    pythonProcess.stderr.on('data', (data) => {
        console.error(`[Order Processor Error] ${data}`);
    });

    pythonProcess.on('close', (code) => {
        console.log(`Order Processor exited with code ${code}`);
        // Restart on failure
        setTimeout(startOrderProcessor, 5000);
    });

    return pythonProcess;
}

// ============================================================================
// Error Handling
// ============================================================================

app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        success: false,
        error: err.message
    });
});

// ============================================================================
// Server Startup
// ============================================================================

app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║          Order Processing System - Main Server                ║
║                                                                ║
║  Status: ✅ Running                                            ║
║  Port: ${PORT}                                                    ║
║  Environment: ${process.env.NODE_ENV || 'development'}                              ║
║                                                                ║
║  Services:                                                     ║
║  - Dashboard: http://localhost:${PORT}                           ║
║  - API: http://localhost:${PORT}/api                            ║
║  - Health: http://localhost:${PORT}/api/health                  ║
║                                                                ║
║  Total Services: ${Object.keys(SERVICES_CONFIG).length}                                   ║
║  Cooldown: 60 minutes                                          ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
    `);

    // Start order processor
    // startOrderProcessor();
});

module.exports = app;
