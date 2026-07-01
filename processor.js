const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const url = require('url');
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
const userServiceOrders = new Map(); // تتبع آخر طلب لكل مستخدم على الخدمة
const urlOrders = new Map(); // تتبع آخر طلب لكل رابط
let totalProcessed = 0;
let totalCreated = 0;
let totalFailed = 0;

// التحقق من أن الرابط هو ريلز انستقرام
function isInstagramReel(urlString) {
  try {
    const urlObj = new URL(urlString);
    const hostname = urlObj.hostname.toLowerCase();
    const pathname = urlObj.pathname.toLowerCase();
    
    // يجب أن يكون من instagram.com
    if (!hostname.includes('instagram.com')) {
      return false;
    }
    
    // يجب أن يحتوي على /reel/
    if (!pathname.includes('/reel/')) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

// تنظيف الرابط من الشوائب
function cleanUrl(urlString) {
  try {
    const urlObj = new URL(urlString);
    // إزالة المعاملات الإضافية، الاحتفاظ فقط بـ protocol, hostname, pathname
    return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
  } catch {
    return urlString;
  }
}

// حساب hash للرابط
function hashUrl(urlString) {
  const cleanedUrl = cleanUrl(urlString).toLowerCase();
  return crypto.createHash('sha256').update(cleanedUrl).digest('hex');
}

// فحص إذا كان لدى المستخدم طلب على نفس الخدمة خلال 30 دقيقة
function hasUserRecentOrderOnService(userId) {
  const now = Date.now();
  const userKey = `user_${userId}_service_${SERVICE_ID_TO_CHECK}`;
  
  if (userServiceOrders.has(userKey)) {
    const lastTime = userServiceOrders.get(userKey);
    if (now - lastTime < DUPLICATE_CHECK_WINDOW) {
      return true;
    }
  }
  
  return false;
}

// فحص إذا كان هناك طلب على نفس الرابط خلال 30 دقيقة
function hasRecentOrderOnUrl(urlString) {
  const now = Date.now();
  const urlHash = hashUrl(urlString);
  const urlKey = `url_${urlHash}`;
  
  if (urlOrders.has(urlKey)) {
    const lastTime = urlOrders.get(urlKey);
    if (now - lastTime < DUPLICATE_CHECK_WINDOW) {
      return true;
    }
  }
  
  return false;
}

// تسجيل الطلب
function recordOrder(userId, urlString) {
  const now = Date.now();
  
  // تسجيل آخر طلب للمستخدم على الخدمة
  const userKey = `user_${userId}_service_${SERVICE_ID_TO_CHECK}`;
  userServiceOrders.set(userKey, now);
  
  // تسجيل آخر طلب للرابط
  const urlHash = hashUrl(urlString);
  const urlKey = `url_${urlHash}`;
  urlOrders.set(urlKey, now);
}

// تنظيف البيانات القديمة
function cleanupOldData() {
  const now = Date.now();
  
  for (const [key, time] of userServiceOrders.entries()) {
    if (now - time > DUPLICATE_CHECK_WINDOW) {
      userServiceOrders.delete(key);
    }
  }
  
  for (const [key, time] of urlOrders.entries()) {
    if (now - time > DUPLICATE_CHECK_WINDOW) {
      urlOrders.delete(key);
    }
  }
}

// معالجة الطلبات
async function processOrders() {
  try {
    console.log(`\n[${new Date().toISOString()}] 🔄 جاري فحص الطلبات...`);

    // جلب الطلبات من لوحة الإدارة
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
    console.log(`📊 وجدت ${orders.length} طلب معلق`);

    for (const order of orders) {
      try {
        const { id, user, link, quantity, service_name } = order;

        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`📋 معالجة الطلب: ${id}`);
        console.log(`👤 المستخدم: ${user}`);
        console.log(`🔗 الرابط: ${link}`);
        console.log(`📈 الكمية: ${quantity}`);
        console.log(`🎯 الخدمة: ${service_name}`);

        // ============================================
        // الفحص 1️⃣: هل لديه طلب على نفس الخدمة خلال 30 دقيقة؟
        // ============================================
        if (hasUserRecentOrderOnService(user)) {
          console.log(`⚠️ المستخدم لديه طلب سابق على نفس الخدمة خلال 30 دقيقة - إلغاء الطلب`);
          
          try {
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
            console.log(`✅ تم إلغاء الطلب وإرجاع المبلغ`);
          } catch (cancelError) {
            console.log(`⚠️ فشل إلغاء الطلب: ${cancelError.message}`);
          }
          
          totalFailed++;
          console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          continue;
        }

        console.log(`✅ لا يوجد طلب سابق للمستخدم على هذه الخدمة`);

        // ============================================
        // الفحص 2️⃣: هل هناك طلب على نفس الرابط خلال 30 دقيقة؟
        // ============================================
        if (hasRecentOrderOnUrl(link)) {
          console.log(`⚠️ هناك طلب سابق على نفس الرابط خلال 30 دقيقة - إلغاء الطلب`);
          
          try {
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
            console.log(`✅ تم إلغاء الطلب وإرجاع المبلغ`);
          } catch (cancelError) {
            console.log(`⚠️ فشل إلغاء الطلب: ${cancelError.message}`);
          }
          
          totalFailed++;
          console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          continue;
        }

        console.log(`✅ لا يوجد طلب سابق على هذا الرابط`);

        // ============================================
        // الفحص 3️⃣: هل الرابط هو ريلز انستقرام؟
        // ============================================
        if (!isInstagramReel(link)) {
          console.log(`❌ الرابط ليس ريلز انستقرام - إلغاء الطلب`);
          
          try {
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
            console.log(`✅ تم إلغاء الطلب وإرجاع المبلغ`);
          } catch (cancelError) {
            console.log(`⚠️ فشل إلغاء الطلب: ${cancelError.message}`);
          }
          
          totalFailed++;
          console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          continue;
        }

        console.log(`✅ الرابط هو ريلز انستقرام`);

        // ============================================
        // تنظيف الرابط من الشوائب
        // ============================================
        const cleanedUrl = cleanUrl(link);
        console.log(`🧹 تنظيف الرابط: ${cleanedUrl}`);

        // ============================================
        // الفحص 4️⃣: إنشاء طلب جديد
        // ============================================
        console.log(`📤 إنشاء طلب جديد في External API...`);
        
        const params = new URLSearchParams();
        params.append('key', EXTERNAL_API_KEY);
        params.append('action', 'add');
        params.append('service', SERVICE_ID_TO_SEND.toString());
        params.append('link', cleanedUrl);
        params.append('quantity', quantity.toString());

        const createResponse = await axios.post(
          EXTERNAL_API_URL,
          params,
          {
            headers: { 
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 10000
          }
        );

        const newOrderId = createResponse.data?.order;
        
        if (newOrderId) {
          console.log(`✅ تم إنشاء طلب جديد: ${newOrderId}`);

          // ============================================
          // تحديث حالة الطلب الأصلي إلى "مكتمل"
          // ============================================
          console.log(`🔄 تحديث حالة الطلب إلى مكتمل...`);
          
          try {
            const updateResponse = await axios.post(
              `${ADMIN_API_URL}/orders/change-status`,
              { 
                ids: id.toString(),
                status: 'completed'
              },
              { 
                headers: { 
                  'X-Api-Key': ADMIN_API_KEY,
                  'Content-Type': 'application/json'
                },
                timeout: 10000
              }
            );

            if (updateResponse.status === 200) {
              // تسجيل الطلب
              recordOrder(user, link);
              totalProcessed++;
              totalCreated++;
              
              console.log(`✅ تم معالجة الطلب بنجاح`);
            } else {
              console.log(`⚠️ فشل تحديث الحالة`);
              totalFailed++;
            }
          } catch (updateError) {
            console.log(`⚠️ خطأ في تحديث الحالة: ${updateError.message}`);
            totalFailed++;
          }
          
          console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        } else {
          console.log(`❌ فشل إنشاء الطلب الجديد`);
          totalFailed++;
          console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        }

      } catch (error) {
        console.error(`❌ خطأ في معالجة الطلب ${order.id}:`, error.message);
        totalFailed++;
      }
    }

    // تنظيف البيانات القديمة
    cleanupOldData();

    // طباعة الإحصائيات
    console.log(`\n📊 الإحصائيات:`);
    console.log(`   ✅ معالجة: ${totalProcessed}`);
    console.log(`   ✅ مكتمل: ${totalCreated}`);
    console.log(`   ❌ فشل: ${totalFailed}`);
    console.log(`   📍 مستخدمين مسجلين: ${userServiceOrders.size}`);
    console.log(`   🔗 روابط مسجلة: ${urlOrders.size}`);

  } catch (error) {
    console.error(`\n❌ خطأ في جلب الطلبات:`, error.message);
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
      totalProcessed: totalProcessed,
      totalCreated: totalCreated,
      totalFailed: totalFailed,
      trackedUsers: userServiceOrders.size,
      trackedUrls: urlOrders.size,
      timestamp: new Date().toISOString()
    }
  });
});

// بدء الخادم
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 Processor running on port ${PORT}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`📡 Admin API: ${ADMIN_API_URL}`);
  console.log(`📤 External API: ${EXTERNAL_API_URL}`);
  console.log(`📊 Service to check: ${SERVICE_ID_TO_CHECK}`);
  console.log(`📤 Service to send: ${SERVICE_ID_TO_SEND}`);
  console.log(`⏱️ Check interval: ${CHECK_INTERVAL / 1000} seconds`);
  console.log(`🔍 Duplicate check window: ${DUPLICATE_CHECK_WINDOW / 60000} minutes`);
  console.log(`${'='.repeat(60)}\n`);
});
