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

// تنظيف قاعدة البيانات من الطلبات القديمة (أقدم من ساعة)
function cleanOldRequests() {
    const db = readDB();
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    let changed = false;

    for (const link in db) {
        if (now - db[link].timestamp > oneHour) {
            delete db[link];
            changed = true;
        }
    }

    if (changed) writeDB(db);
}

// تنظيف الرابط من المعاملات الإضافية (مثل ?igshid=... أو ?t=...)
function cleanLink(link) {
    try {
        const url = new URL(link);
        return url.origin + url.pathname;
    } catch (e) {
        return link; // إذا لم يكن رابطاً صالحاً، أرجعه كما هو
    }
}

// نقطة نهاية للحصول على الإعدادات (آمنة)
app.get('/api/config', (req, res) => {
    // قراءة الإعدادات من متغيرات البيئة أو استخدام القيم الافتراضية
    const config = {
        'instagram-reels-views': {
            serviceId: process.env.SERVICE_ID_IG_REELS || 17337,
            quantity: process.env.QUANTITY_IG_REELS || 100
        },
        'instagram-likes': {
            serviceId: process.env.SERVICE_ID_IG_LIKES || 17512,
            quantity: process.env.QUANTITY_IG_LIKES || 10
        },
        'instagram-followers': {
            serviceId: process.env.SERVICE_ID_IG_FOLLOWERS || 17437,
            quantity: process.env.QUANTITY_IG_FOLLOWERS || 10
        },
        'tiktok-followers': {
            serviceId: process.env.SERVICE_ID_TK_FOLLOWERS || 17629,
            quantity: process.env.QUANTITY_TK_FOLLOWERS || 10
        },
        'tiktok-likes': {
            serviceId: process.env.SERVICE_ID_TK_LIKES || 17648,
            quantity: process.env.QUANTITY_TK_LIKES || 10
        }
    };
    
    res.json({ success: true, data: config });
});

// نقطة النهاية الرئيسية لاستقبال الطلبات
app.post('/api/order', async (req, res) => {
    try {
        const { link, serviceId, quantity } = req.body;

        if (!link || !serviceId || !quantity) {
            return res.status(400).json({ 
                success: false, 
                error: 'الرجاء توفير الرابط ورقم الخدمة والكمية' 
            });
        }

        // تنظيف الرابط
        const cleanedLink = cleanLink(link);

        // تنظيف الطلبات القديمة أولاً
        cleanOldRequests();

        // التحقق من الطلبات المكررة
        const db = readDB();
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;

        if (db[cleanedLink]) {
            const timePassed = now - db[cleanedLink].timestamp;
            if (timePassed < oneHour) {
                const minutesLeft = Math.ceil((oneHour - timePassed) / 60000);
                return res.status(429).json({ 
                    success: false, 
                    error: `هذا الرابط تم طلبه قبل قليل، حاول بعد ${minutesLeft} دقيقة` 
                });
            }
        }

        // تجهيز البيانات لإرسالها لـ API الموقع
        const payload = new URLSearchParams({
            key: API_KEY,
            action: 'add',
            service: serviceId,
            link: cleanedLink,
            quantity: quantity
        });

        console.log(`إرسال طلب جديد للخدمة ${serviceId} للرابط ${cleanedLink}`);

        // إرسال الطلب لـ API الموقع
        const apiResponse = await fetch(KD1S_API_URL, {
            method: 'POST',
            body: payload,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const apiData = await apiResponse.json();

        // إذا نجح الطلب، احفظ الرابط في قاعدة البيانات
        if (!apiData.error) {
            db[cleanedLink] = {
                timestamp: now,
                serviceId: serviceId,
                orderId: apiData.order || null
            };
            writeDB(db);
        }

        // إرجاع النتيجة للصفحة
        res.json({
            success: !apiData.error,
            data: apiData,
            error: apiData.error ? apiData.error : null
        });

    } catch (error) {
        console.error('Error processing order:', error);
        res.status(500).json({ 
            success: false, 
            error: 'حدث خطأ في الخادم أثناء معالجة الطلب' 
        });
    }
});

// نقطة نهاية للتحقق من حالة الخادم
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running normally' });
});

// نقطة نهاية لعرض إحصائيات بسيطة
app.get('/api/stats', (req, res) => {
    cleanOldRequests();
    const db = readDB();
    const count = Object.keys(db).length;
    res.json({ 
        success: true, 
        active_requests_last_hour: count 
    });
});

app.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
});
