const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();

// إعدادات البيئة
const PORT = process.env.PORT || 10000;
const API_KEY = process.env.API_KEY || "75d051012adf93f000fccb6910a58563";
const KD1S_API_URL = "https://kd1s.com/api/v2";

// إعدادات CORS
app.use(cors());
app.use(express.json());

// مسار ملف قاعدة البيانات
const DB_FILE = path.join(__dirname, 'requests.json');

// دالة لقراءة قاعدة البيانات
function readDB() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({}));
    }
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

// دالة لحفظ قاعدة البيانات
function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// دالة لاستخراج IP الحقيقي
function getClientIP(req) {
    // تحقق من X-Forwarded-For أولاً (للـ Proxies مثل Render)
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    // ثم تحقق من X-Real-IP
    if (req.headers['x-real-ip']) {
        return req.headers['x-real-ip'];
    }
    // وإلا استخدم IP الاتصال المباشر
    return req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
}

// دالة لإنشاء بصمة الجهاز (IP + User Agent)
function createDeviceFingerprint(req) {
    const clientIP = getClientIP(req);
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    // دمج IP و User Agent
    const fingerprint = `${clientIP}|${userAgent}`;
    
    console.log(`🔍 Device Fingerprint: ${fingerprint.substring(0, 50)}...`);
    
    return fingerprint;
}

// تنظيف قاعدة البيانات من الطلبات القديمة (أقدم من ساعة)
function cleanOldRequests() {
    const db = readDB();
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    let changed = false;

    for (const fingerprint in db) {
        if (now - db[fingerprint].timestamp > oneHour) {
            delete db[fingerprint];
            changed = true;
        }
    }

    if (changed) {
        writeDB(db);
        console.log('🧹 تم تنظيف الطلبات القديمة');
    }
}

// تنظيف الرابط من المعاملات الإضافية
function cleanLink(link) {
    try {
        const url = new URL(link);
        return url.origin + url.pathname;
    } catch (e) {
        return link;
    }
}

// نقطة نهاية للحصول على الإعدادات (آمنة)
app.get('/api/config', (req, res) => {
    const config = {
        'instagram-reels-views': {
            serviceId: parseInt(process.env.SERVICE_ID_IG_REELS || 17337),
            quantity: parseInt(process.env.QUANTITY_IG_REELS || 100)
        },
        'instagram-likes': {
            serviceId: parseInt(process.env.SERVICE_ID_IG_LIKES || 17512),
            quantity: parseInt(process.env.QUANTITY_IG_LIKES || 10)
        },
        'instagram-followers': {
            serviceId: parseInt(process.env.SERVICE_ID_IG_FOLLOWERS || 17437),
            quantity: parseInt(process.env.QUANTITY_IG_FOLLOWERS || 10)
        },
        'tiktok-followers': {
            serviceId: parseInt(process.env.SERVICE_ID_TK_FOLLOWERS || 17629),
            quantity: parseInt(process.env.QUANTITY_TK_FOLLOWERS || 10)
        },
        'tiktok-likes': {
            serviceId: parseInt(process.env.SERVICE_ID_TK_LIKES || 17648),
            quantity: parseInt(process.env.QUANTITY_TK_LIKES || 10)
        }
    };
    
    res.json({ success: true, data: config });
});

// نقطة النهاية الرئيسية لاستقبال الطلبات مع نظام الأمان
app.post('/api/order', async (req, res) => {
    try {
        const { link, serviceId, quantity } = req.body;

        if (!link || !serviceId || !quantity) {
            return res.status(400).json({ 
                success: false, 
                error: 'الرجاء توفير الرابط ورقم الخدمة والكمية' 
            });
        }

        // إنشاء بصمة الجهاز (IP + User Agent)
        const deviceFingerprint = createDeviceFingerprint(req);

        // تنظيف الطلبات القديمة أولاً
        cleanOldRequests();

        // التحقق من الطلبات المكررة من نفس الجهاز
        const db = readDB();
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;

        if (db[deviceFingerprint]) {
            const timePassed = now - db[deviceFingerprint].timestamp;
            if (timePassed < oneHour) {
                const minutesLeft = Math.ceil((oneHour - timePassed) / 60000);
                const secondsLeft = Math.ceil(((oneHour - timePassed) % 60000) / 1000);
                
                console.log(`⛔ محاولة طلب مكررة من نفس الجهاز - الانتظار: ${minutesLeft}:${secondsLeft}`);
                
                return res.status(429).json({ 
                    success: false, 
                    error: `هذا الرابط تم طلبه قبل قليل، حاول بعد ساعة` 
                });
            }
        }

        // تنظيف الرابط
        const cleanedLink = cleanLink(link);

        // تجهيز البيانات لإرسالها لـ API الموقع
        const payload = new URLSearchParams({
            key: API_KEY,
            action: 'add',
            service: serviceId,
            link: cleanedLink,
            quantity: quantity
        });

        console.log(`📤 إرسال طلب جديد - الخدمة: ${serviceId}, الكمية: ${quantity}`);

        // إرسال الطلب لـ API الموقع
        const apiResponse = await fetch(KD1S_API_URL, {
            method: 'POST',
            body: payload,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const apiData = await apiResponse.json();

        // إذا نجح الطلب، احفظ بصمة الجهاز في قاعدة البيانات
        if (!apiData.error) {
            db[deviceFingerprint] = {
                timestamp: now,
                serviceId: serviceId,
                link: cleanedLink,
                orderId: apiData.order || null,
                ip: getClientIP(req)
            };
            writeDB(db);
            console.log(`✅ تم حفظ الطلب - الطلب رقم: ${apiData.order || 'N/A'}`);
        }

        // إرجاع النتيجة للصفحة
        res.json({
            success: !apiData.error,
            data: apiData,
            error: apiData.error ? apiData.error : null
        });

    } catch (error) {
        console.error('❌ خطأ في معالجة الطلب:', error);
        res.status(500).json({ 
            success: false, 
            error: 'حدث خطأ في الخادم أثناء معالجة الطلب' 
        });
    }
});

// نقطة نهاية للتحقق من حالة الجهاز الحالي
app.get('/api/device-status', (req, res) => {
    const deviceFingerprint = createDeviceFingerprint(req);
    const db = readDB();
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    if (db[deviceFingerprint]) {
        const timePassed = now - db[deviceFingerprint].timestamp;
        const canOrder = timePassed >= oneHour;
        const minutesLeft = Math.ceil((oneHour - timePassed) / 60000);

        res.json({
            success: true,
            canOrder: canOrder,
            minutesUntilNextOrder: canOrder ? 0 : minutesLeft,
            lastOrderTime: new Date(db[deviceFingerprint].timestamp).toISOString(),
            lastServiceId: db[deviceFingerprint].serviceId
        });
    } else {
        res.json({
            success: true,
            canOrder: true,
            minutesUntilNextOrder: 0,
            lastOrderTime: null
        });
    }
});

// نقطة نهاية للتحقق من حالة الخادم
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running normally' });
});

// نقطة نهاية لعرض إحصائيات
app.get('/api/stats', (req, res) => {
    cleanOldRequests();
    const db = readDB();
    const count = Object.keys(db).length;
    res.json({ 
        success: true, 
        active_devices_last_hour: count 
    });
});

app.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
    console.log(`🔒 نظام الأمان: IP + User Agent`);
});
