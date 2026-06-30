const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

// ========== الإعدادات ==========
const ADMIN_API_URL = 'https://kd1s.com/admin/adminapi/v2/';
const ADMIN_API_KEY = '9495qsacgcm64hj0z1sprxce7qj0nkbh71w6h6xumigan8h141koirzkxwoqg48b';
const EXTERNAL_API_URL = 'https://kd1s.com/apikd1s';
const EXTERNAL_API_KEY = 'ce5d33dc71b144c60cab2f8f977bbc21';

const SOURCE_SERVICE_ID = 17337;
const TARGET_SERVICE_ID = 17828;
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 دقائق
const USER_COOLDOWN = 30 * 60 * 1000; // 30 دقيقة
const URL_COOLDOWN = 30 * 60 * 1000; // 30 دقيقة

// PostgreSQL Connection Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/order_processor',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// ========== إنشاء جداول قاعدة البيانات ==========
async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        order_id VARCHAR(255) UNIQUE NOT NULL,
        user_id_hash VARCHAR(64) NOT NULL,
        url_hash VARCHAR(64),
        external_order_id VARCHAR(255),
        status VARCHAR(50) NOT NULL,
        reason VARCHAR(100),
        quantity INTEGER DEFAULT 1,
        original_url TEXT,
        message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // إنشاء فهارس
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_id_hash ON orders(user_id_hash, created_at DESC);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_url_hash ON orders(url_hash, created_at DESC);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_external_order_id ON orders(external_order_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_status ON orders(status);
    `);

    console.log('✅ تم إنشاء جداول قاعدة البيانات بنجاح');
    return true;
  } catch (error) {
    console.error('❌ خطأ في إنشاء جداول قاعدة البيانات:', error.message);
    return false;
  }
}

// ========== دالة تجزئة البيانات ==========
function hashData(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// ========== دالة تنظيف الرابط ==========
function normalizeUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.origin + urlObj.pathname;
  } catch {
    return url.toLowerCase().trim();
  }
}

// ========== دالة فحص الطلبات المكررة ==========
async function checkDuplicateOrder(userId, urlHash) {
  const now = Date.now();
  const cutoffTime = new Date(now - USER_COOLDOWN);

  try {
    // فحص نفس المستخدم
    const userResult = await pool.query(
      `SELECT * FROM orders 
       WHERE user_id_hash = $1 
       AND status = 'processed' 
       AND created_at > $2 
       LIMIT 1`,
      [hashData(userId), cutoffTime]
    );

    if (userResult.rows.length > 0) {
      const userOrder = userResult.rows[0];
      const timeLeft = Math.ceil((userOrder.created_at.getTime() + USER_COOLDOWN - now) / 1000);
      return {
        isDuplicate: true,
        reason: 'user_cooldown',
        timeLeft,
        message: `نفس المستخدم قام بطلب قبل ${Math.ceil(timeLeft / 60)} دقيقة`
      };
    }

    // فحص نفس الرابط
    if (urlHash) {
      const urlResult = await pool.query(
        `SELECT * FROM orders 
         WHERE url_hash = $1 
         AND status = 'processed' 
         AND created_at > $2 
         LIMIT 1`,
        [urlHash, cutoffTime]
      );

      if (urlResult.rows.length > 0) {
        const urlOrder = urlResult.rows[0];
        const timeLeft = Math.ceil((urlOrder.created_at.getTime() + URL_COOLDOWN - now) / 1000);
        return {
          isDuplicate: true,
          reason: 'url_cooldown',
          timeLeft,
          message: `نفس الرابط تم طلبه قبل ${Math.ceil(timeLeft / 60)} دقيقة`
        };
      }
    }

    return { isDuplicate: false };
  } catch (error) {
    console.error('❌ خطأ في فحص الطلبات المكررة:', error.message);
    return { isDuplicate: false };
  }
}

// ========== دالة جلب الطلبات من لوحة الإدارة ==========
async function fetchPendingOrders() {
  try {
    const response = await axios.get(`${ADMIN_API_URL}orders`, {
      params: {
        service: SOURCE_SERVICE_ID,
        status: 'Pending',
        limit: 100
      },
      headers: {
        'Authorization': `Bearer ${ADMIN_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    return response.data.orders || [];
  } catch (error) {
    console.error('❌ خطأ في جلب الطلبات:', error.message);
    return [];
  }
}

// ========== دالة معالجة الطلب ==========
async function processOrder(order) {
  try {
    const userId = order.user_id || order.userId;
    const orderUrl = order.link || order.url;
    const quantity = order.quantity || 1;
    const orderId = order.id || order._id;

    // تجزئة البيانات
    const userHash = hashData(userId);
    const normalizedUrl = normalizeUrl(orderUrl);
    const urlHash = hashData(normalizedUrl);

    // فحص الطلبات المكررة
    const duplicateCheck = await checkDuplicateOrder(userHash, urlHash);
    
    if (duplicateCheck.isDuplicate) {
      console.log(`⚠️ طلب مكرر: ${duplicateCheck.message}`);
      
      // إلغاء الطلب واسترجاع المبلغ
      await cancelAndRefund(orderId, duplicateCheck.reason);
      
      // حفظ في قاعدة البيانات
      await pool.query(
        `INSERT INTO orders (order_id, user_id_hash, url_hash, status, reason, message)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (order_id) DO NOTHING`,
        [orderId, userHash, urlHash, 'cancelled', duplicateCheck.reason, duplicateCheck.message]
      );
      
      return { success: false, reason: duplicateCheck.reason };
    }

    // إرسال الطلب للمرحلة الثانية
    const forwardResponse = await forwardOrder(orderUrl, quantity);
    
    if (forwardResponse.success) {
      // حفظ الطلب الناجح
      await pool.query(
        `INSERT INTO orders (order_id, user_id_hash, url_hash, external_order_id, status, quantity, original_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (order_id) DO NOTHING`,
        [orderId, userHash, urlHash, forwardResponse.externalOrderId, 'processed', quantity, orderUrl]
      );

      console.log(`✅ تم معالجة الطلب: ${orderId}`);
      return { success: true, externalOrderId: forwardResponse.externalOrderId };
    } else {
      console.log(`❌ فشل إرسال الطلب: ${orderId}`);
      return { success: false, reason: 'forward_failed' };
    }
  } catch (error) {
    console.error('❌ خطأ في معالجة الطلب:', error.message);
    return { success: false, reason: 'processing_error' };
  }
}

// ========== دالة إلغاء الطلب واسترجاع المبلغ ==========
async function cancelAndRefund(orderId, reason) {
  try {
    await axios.post(`${ADMIN_API_URL}orders/${orderId}/cancel`, {
      reason: reason,
      refund: true
    }, {
      headers: {
        'Authorization': `Bearer ${ADMIN_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    console.log(`🔄 تم إلغاء الطلب واسترجاع المبلغ: ${orderId}`);
  } catch (error) {
    console.error('❌ خطأ في إلغاء الطلب:', error.message);
  }
}

// ========== دالة إرسال الطلب للمرحلة الثانية ==========
async function forwardOrder(url, quantity) {
  try {
    const response = await axios.post(`${EXTERNAL_API_URL}/order`, {
      service: TARGET_SERVICE_ID,
      link: url,
      quantity: quantity
    }, {
      headers: {
        'Authorization': `Bearer ${EXTERNAL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    return {
      success: true,
      externalOrderId: response.data.order_id || response.data.id
    };
  } catch (error) {
    console.error('❌ خطأ في إرسال الطلب للمرحلة الثانية:', error.message);
    return { success: false };
  }
}

// ========== دالة المعالجة الرئيسية ==========
async function processAllOrders() {
  console.log(`\n📋 بدء فحص الطلبات في ${new Date().toLocaleTimeString('ar-SA')}`);
  
  const orders = await fetchPendingOrders();
  console.log(`📥 تم جلب ${orders.length} طلب معلق`);

  let processed = 0;
  let cancelled = 0;

  for (const order of orders) {
    const result = await processOrder(order);
    
    if (result.success) {
      processed++;
    } else {
      cancelled++;
    }

    // تأخير صغير بين الطلبات
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`✅ تم معالجة ${processed} طلب بنجاح`);
  console.log(`❌ تم إلغاء ${cancelled} طلب مكرر`);
}

// ========== API Endpoints ==========

// فحص صحة الخادم
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT NOW()');
    res.json({
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message
    });
  }
});

// الإحصائيات
app.get('/api/stats', async (req, res) => {
  try {
    const totalResult = await pool.query('SELECT COUNT(*) as count FROM orders');
    const processedResult = await pool.query('SELECT COUNT(*) as count FROM orders WHERE status = \'processed\'');
    const cancelledResult = await pool.query('SELECT COUNT(*) as count FROM orders WHERE status = \'cancelled\'');

    res.json({
      total: parseInt(totalResult.rows[0].count),
      processed: parseInt(processedResult.rows[0].count),
      cancelled: parseInt(cancelledResult.rows[0].count),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// الإعدادات
app.get('/api/config', (req, res) => {
  res.json({
    sourceService: SOURCE_SERVICE_ID,
    targetService: TARGET_SERVICE_ID,
    checkInterval: `${CHECK_INTERVAL / 60000} دقائق`,
    userCooldown: `${USER_COOLDOWN / 60000} دقيقة`,
    urlCooldown: `${URL_COOLDOWN / 60000} دقيقة`
  });
});

// ========== بدء الخادم ==========
const PORT = process.env.PORT || 10001;

async function start() {
  // الاتصال بـ PostgreSQL
  const connected = await initializeDatabase();
  
  if (!connected) {
    console.error('❌ فشل الاتصال بـ PostgreSQL. تأكد من متغير البيئة DATABASE_URL');
    process.exit(1);
  }

  // بدء الخادم
  app.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
    console.log(`📊 Service: ${SOURCE_SERVICE_ID} → ${TARGET_SERVICE_ID}`);
  });

  // بدء معالجة الطلبات تلقائياً
  console.log(`⏰ سيتم فحص الطلبات كل ${CHECK_INTERVAL / 60000} دقائق`);
  
  // المعالجة الأولى فوراً
  await processAllOrders();
  
  // المعالجة المتكررة
  setInterval(processAllOrders, CHECK_INTERVAL);
}

start().catch(error => {
  console.error('❌ خطأ في بدء الخادم:', error);
  process.exit(1);
});

module.exports = app;
