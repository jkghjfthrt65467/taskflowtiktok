const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const app = express();

app.use(express.json());

// الإعدادات
const ADMIN_API_URL = 'https://kd1s.com/admin/adminapi/v2/';
const ADMIN_API_KEY = '9495qsacgcm64hj0z1sprxce7qj0nkbh71w6h6xumigan8h141koirzkxwoqg48b';
const EXTERNAL_API_URL = 'https://kd1s.com/apikd1s';
const EXTERNAL_API_KEY = 'ce5d33dc71b144c60cab2f8f977bbc21';
const SERVICE_ID_TO_CHECK = 17337;
const SERVICE_ID_TO_SEND = 17828;
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 دقائق
const DUPLICATE_CHECK_WINDOW = 30 * 60 * 1000; // 30 دقيقة

// تخزين مؤقت للطلبات المعالجة
const processedOrders = new Map();
const userLastOrder = new Map();

// تنظيف الرابط من الشوائب
function normalizeUrl(url) {
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

// حساب hash للرابط
function hashUrl(url) {
  return crypto.createHash('sha256').update(normalizeUrl(url)).digest('hex');
}

// فحص التكرار
function isDuplicate(userId, url) {
  const now = Date.now();
  const userKey = `user_${userId}`;
  const urlHash = hashUrl(url);
  const urlKey = `url_${urlHash}`;

  // فحص آخر طلب من نفس المستخدم
  if (userLastOrder.has(userKey)) {
    const lastTime = userLastOrder.get(userKey);
    if (now - lastTime < DUPLICATE_CHECK_WINDOW) {
      return true;
    }
  }

  // فحص آخر طلب لنفس الرابط
  if (processedOrders.has(urlKey)) {
    const lastTime = processedOrders.get(urlKey);
    if (now - lastTime < DUPLICATE_CHECK_WINDOW) {
      return true;
    }
  }

  return false;
}

// تسجيل الطلب
function recordOrder(userId, url) {
  const now = Date.now();
  userLastOrder.set(`user_${userId}`, now);
  processedOrders.set(`url_${hashUrl(url)}`, now);
}

// تنظيف البيانات القديمة
function cleanupOldData() {
  const now = Date.now();
  
  for (const [key, time] of userLastOrder.entries()) {
    if (now - time > DUPLICATE_CHECK_WINDOW) {
      userLastOrder.delete(key);
    }
  }
  
  for (const [key, time] of processedOrders.entries()) {
    if (now - time > DUPLICATE_CHECK_WINDOW) {
      processedOrders.delete(key);
    }
  }
}

// معالجة الطلبات
async function processOrders() {
  try {
    console.log(`[${new Date().toISOString()}] جاري فحص الطلبات...`);

    // جلب الطلبات من لوحة الإدارة
    const response = await axios.get(
      `${ADMIN_API_URL}orders?service=${SERVICE_ID_TO_CHECK}&status=Pending`,
      {
        headers: { 'Authorization': `Bearer ${ADMIN_API_KEY}` },
        timeout: 10000
      }
    );

    const orders = response.data.orders || [];
    console.log(`وجدت ${orders.length} طلب معلق`);

    for (const order of orders) {
      try {
        const { id, user_id, url, quantity } = order;

        // فحص التكرار
        if (isDuplicate(user_id, url)) {
          console.log(`[تكرار] الطلب ${id} - إلغاء مع استرجاع المبلغ`);
          
          // إلغاء الطلب مع استرجاع المبلغ
          await axios.post(
            `${ADMIN_API_URL}orders/${id}/cancel`,
            { refund: true },
            { headers: { 'Authorization': `Bearer ${ADMIN_API_KEY}` } }
          );
          continue;
        }

        // إرسال الطلب للمرحلة الثانية
        console.log(`[إرسال] الطلب ${id} للمرحلة الثانية`);
        
        await axios.post(
          `${EXTERNAL_API_URL}/orders`,
          {
            service: SERVICE_ID_TO_SEND,
            link: url,
            quantity: quantity,
            order_id: id
          },
          {
            headers: { 'Authorization': `Bearer ${EXTERNAL_API_KEY}` },
            timeout: 10000
          }
        );

        // تسجيل الطلب
        recordOrder(user_id, url);
        
        console.log(`✅ تم معالجة الطلب ${id} بنجاح`);

      } catch (error) {
        console.error(`❌ خطأ في معالجة الطلب:`, error.message);
      }
    }

    // تنظيف البيانات القديمة
    cleanupOldData();

  } catch (error) {
    console.error(`❌ خطأ في جلب الطلبات:`, error.message);
  }
}

// بدء معالجة الطلبات تلقائياً
setInterval(processOrders, CHECK_INTERVAL);

// معالجة فورية عند البدء
processOrders();

// API Endpoints
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'Processor is running',
    timestamp: new Date().toISOString(),
    config: {
      checkInterval: `${CHECK_INTERVAL / 1000} seconds`,
      duplicateCheckWindow: `${DUPLICATE_CHECK_WINDOW / 60000} minutes`,
      serviceToCheck: SERVICE_ID_TO_CHECK,
      serviceToSend: SERVICE_ID_TO_SEND
    }
  });
});

app.get('/api/stats', (req, res) => {
  res.json({
    success: true,
    stats: {
      processedOrders: processedOrders.size,
      trackedUsers: userLastOrder.size,
      timestamp: new Date().toISOString()
    }
  });
});

// بدء الخادم
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`\n🚀 Processor running on port ${PORT}`);
  console.log(`📡 Service to check: ${SERVICE_ID_TO_CHECK}`);
  console.log(`📤 Service to send: ${SERVICE_ID_TO_SEND}`);
  console.log(`⏱️ Check interval: ${CHECK_INTERVAL / 1000} seconds`);
  console.log(`🔍 Duplicate check window: ${DUPLICATE_CHECK_WINDOW / 60000} minutes\n`);
});
