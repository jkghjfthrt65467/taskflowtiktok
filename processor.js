const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const app = express();

app.use(express.json());

// الإعدادات
const ADMIN_API_URL = 'https://kd1s.com/adminapi/v2';
const ADMIN_API_KEY = '3k2xjqkj78jg38wwo8jeq6j6yylnoqcut7bptwbqdajbr261015825gt4wf7pg30';
const EXTERNAL_API_URL = 'https://kd1s.com/api/v2';
const EXTERNAL_API_KEY = 'ce5d33dc71b144c60cab2f8f977bbc21';
const SERVICE_ID_TO_CHECK = 17337;
const SERVICE_ID_TO_SEND = 17828;
const CHECK_INTERVAL = 1000; // 1 ثانية
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

    // جلب الطلبات من لوحة الإدارة باستخدام المسار الصحيح
    const response = await axios.post(
      `${ADMIN_API_URL}/orders/pull`,
      {
        service_ids: SERVICE_ID_TO_CHECK.toString(),
        limit: 100
      },
      {
        headers: {
          'X-Api-Key': ADMIN_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    const orders = response.data.data?.list || [];
    console.log(`وجدت ${orders.length} طلب معلق`);

    for (const order of orders) {
      try {
        const { id, user, link, quantity } = order;

        // فحص التكرار
        if (isDuplicate(user, link)) {
          console.log(`[تكرار] الطلب ${id} - إلغاء مع استرجاع المبلغ`);
          
          // إلغاء الطلب مع استرجاع المبلغ
          await axios.post(
            `${ADMIN_API_URL}/orders/cancel`,
            { order_ids: [id] },
            { 
              headers: { 
                'X-Api-Key': ADMIN_API_KEY,
                'Content-Type': 'application/json'
              },
              timeout: 10000
            }
          );
          continue;
        }

        // إرسال الطلب للمرحلة الثانية باستخدام Form Data
        console.log(`[إرسال] الطلب ${id} للمرحلة الثانية`);
        
        const params = new URLSearchParams();
        params.append('key', EXTERNAL_API_KEY);
        params.append('action', 'add');
        params.append('service', SERVICE_ID_TO_SEND.toString());
        params.append('link', link);
        params.append('quantity', quantity.toString());

        await axios.post(
          EXTERNAL_API_URL,
          params,
          {
            headers: { 
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 10000
          }
        );

        // تسجيل الطلب
        recordOrder(user, link);
        
        console.log(`✅ تم معالجة الطلب ${id} بنجاح`);

      } catch (error) {
        console.error(`❌ خطأ في معالجة الطلب:`, error.message);
      }
    }

    // تنظيف البيانات القديمة
    cleanupOldData();

  } catch (error) {
    console.error(`❌ خطأ في جلب الطلبات:`, error.message);
    if (error.response) {
      console.error(`   رمز الحالة: ${error.response.status}`);
      console.error(`   البيانات: ${JSON.stringify(error.response.data)}`);
    }
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
      serviceToSend: SERVICE_ID_TO_SEND,
      adminApiUrl: ADMIN_API_URL,
      externalApiUrl: EXTERNAL_API_URL
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
  console.log(`📡 Admin API: ${ADMIN_API_URL}`);
  console.log(`📤 External API: ${EXTERNAL_API_URL}`);
  console.log(`📊 Service to check: ${SERVICE_ID_TO_CHECK}`);
  console.log(`📤 Service to send: ${SERVICE_ID_TO_SEND}`);
  console.log(`⏱️ Check interval: ${CHECK_INTERVAL / 1000} seconds`);
  console.log(`🔍 Duplicate check window: ${DUPLICATE_CHECK_WINDOW / 60000} minutes\n`);
});
