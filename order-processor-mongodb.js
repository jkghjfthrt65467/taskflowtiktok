const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');

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

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://user:password@cluster.mongodb.net/order_processor';
let db = null;

// ========== دالة الاتصال بـ MongoDB ==========
async function connectMongoDB() {
  try {
    const client = new MongoClient(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    await client.connect();
    db = client.db('order_processor');
    
    // إنشاء الفهارس
    await db.collection('orders').createIndex({ userId: 1, timestamp: -1 });
    await db.collection('orders').createIndex({ urlHash: 1, timestamp: -1 });
    await db.collection('orders').createIndex({ externalOrderId: 1 });
    
    console.log('✅ متصل بـ MongoDB بنجاح');
    return true;
  } catch (error) {
    console.error('❌ خطأ في الاتصال بـ MongoDB:', error.message);
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
    // إزالة المعاملات والشظايا
    return urlObj.origin + urlObj.pathname;
  } catch {
    return url.toLowerCase().trim();
  }
}

// ========== دالة فحص الطلبات المكررة ==========
async function checkDuplicateOrder(userId, urlHash) {
  const now = Date.now();
  const cutoffTime = now - USER_COOLDOWN;

  // فحص نفس المستخدم
  const userOrder = await db.collection('orders').findOne({
    userId: hashData(userId),
    timestamp: { $gte: cutoffTime },
    status: 'processed'
  });

  if (userOrder) {
    const timeLeft = Math.ceil((userOrder.timestamp + USER_COOLDOWN - now) / 1000);
    return {
      isDuplicate: true,
      reason: 'user_cooldown',
      timeLeft,
      message: `نفس المستخدم قام بطلب قبل ${Math.ceil(timeLeft / 60)} دقيقة`
    };
  }

  // فحص نفس الرابط
  const urlOrder = await db.collection('orders').findOne({
    urlHash: urlHash,
    timestamp: { $gte: cutoffTime },
    status: 'processed'
  });

  if (urlOrder) {
    const timeLeft = Math.ceil((urlOrder.timestamp + URL_COOLDOWN - now) / 1000);
    return {
      isDuplicate: true,
      reason: 'url_cooldown',
      timeLeft,
      message: `نفس الرابط تم طلبه قبل ${Math.ceil(timeLeft / 60)} دقيقة`
    };
  }

  return { isDuplicate: false };
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
      await db.collection('orders').insertOne({
        orderId,
        userId: userHash,
        urlHash,
        status: 'cancelled',
        reason: duplicateCheck.reason,
        timestamp: Date.now(),
        message: duplicateCheck.message
      });
      
      return { success: false, reason: duplicateCheck.reason };
    }

    // إرسال الطلب للمرحلة الثانية
    const forwardResponse = await forwardOrder(orderUrl, quantity);
    
    if (forwardResponse.success) {
      // حفظ الطلب الناجح
      await db.collection('orders').insertOne({
        orderId,
        userId: userHash,
        urlHash,
        externalOrderId: forwardResponse.externalOrderId,
        status: 'processed',
        quantity,
        timestamp: Date.now(),
        originalUrl: orderUrl
      });

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
  if (!db) {
    console.log('⏳ قاعدة البيانات غير متصلة...');
    return;
  }

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
app.get('/api/health', (req, res) => {
  res.json({
    status: db ? 'healthy' : 'unhealthy',
    database: db ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// الإحصائيات
app.get('/api/stats', async (req, res) => {
  try {
    const total = await db.collection('orders').countDocuments();
    const processed = await db.collection('orders').countDocuments({ status: 'processed' });
    const cancelled = await db.collection('orders').countDocuments({ status: 'cancelled' });

    res.json({
      total,
      processed,
      cancelled,
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
  // الاتصال بـ MongoDB
  const connected = await connectMongoDB();
  
  if (!connected) {
    console.error('❌ فشل الاتصال بـ MongoDB. تأكد من متغير البيئة MONGODB_URI');
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
