const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// إعدادات Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// الثوابت
const API_KEY = process.env.API_KEY || "1a26d1859e5b8060b4b46806651bfe9a";
const API_URL = "https://kd1s.com/api/v2";
const SERVICE_ID = 13372;
const QUANTITY = 100;
const HOUR_IN_MS = 60 * 60 * 1000; // ساعة واحدة بالميلي ثانية

// مسار ملف قاعدة البيانات
const DB_FILE = path.join(__dirname, 'requests.json');

// دالة قراءة قاعدة البيانات
function readDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf-8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('خطأ في قراءة قاعدة البيانات:', error.message);
    }
    return { requests: [] };
}

// دالة كتابة قاعدة البيانات
function writeDatabase(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
        console.error('خطأ في كتابة قاعدة البيانات:', error.message);
    }
}

// دالة تنظيف الرابط
function normalizeUrl(url) {
    // إزالة المسافات
    url = url.trim();
    
    // إزالة الكلمات الإضافية في النهاية (بعد ؟ أو #)
    const urlObj = new URL(url);
    
    // الحفاظ على البروتوكول والدومين والمسار الأساسي فقط
    const normalizedUrl = `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
    
    return normalizedUrl;
}

// دالة التحقق من الرابط المكرر
function checkDuplicateUrl(url) {
    const db = readDatabase();
    const normalizedUrl = normalizeUrl(url);
    const now = Date.now();
    
    // البحث عن الرابط في قاعدة البيانات
    for (let request of db.requests) {
        if (request.url === normalizedUrl) {
            const timeDifference = now - request.timestamp;
            
            // إذا كان الطلب خلال ساعة
            if (timeDifference < HOUR_IN_MS) {
                const remainingTime = Math.ceil((HOUR_IN_MS - timeDifference) / 1000 / 60); // بالدقائق
                return {
                    isDuplicate: true,
                    message: `هذا الرابط تم طلبه قبل قليل، حاول بعد ساعة`,
                    remainingMinutes: remainingTime
                };
            }
        }
    }
    
    return { isDuplicate: false };
}

// دالة إضافة الرابط إلى قاعدة البيانات
function addUrlToDatabase(url, status) {
    const db = readDatabase();
    const normalizedUrl = normalizeUrl(url);
    
    // إزالة الطلب القديم للرابط نفسه إن وجد
    db.requests = db.requests.filter(r => r.url !== normalizedUrl);
    
    // إضافة الطلب الجديد
    db.requests.push({
        url: normalizedUrl,
        timestamp: Date.now(),
        status: status,
        originalUrl: url
    });
    
    // الاحتفاظ بآخر 1000 طلب فقط
    if (db.requests.length > 1000) {
        db.requests = db.requests.slice(-1000);
    }
    
    writeDatabase(db);
}

// فحص حالة الخادم
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running normally' });
});

// مسار معالجة الطلبات
app.post('/api/order', async (req, res) => {
    try {
        const { link } = req.body;

        if (!link) {
            return res.status(400).json({ 
                success: false,
                error: "الرابط مطلوب" 
            });
        }

        console.log(`📨 طلب جديد للرابط: ${link}`);

        // التحقق من الرابط المكرر
        const duplicateCheck = checkDuplicateUrl(link);
        if (duplicateCheck.isDuplicate) {
            console.log(`⚠️ رابط مكرر: ${link}`);
            addUrlToDatabase(link, 'rejected');
            return res.status(429).json({ 
                success: false,
                error: duplicateCheck.message,
                remainingMinutes: duplicateCheck.remainingMinutes
            });
        }

        // إرسال الطلب إلى API الخارجي
        const response = await axios.post(API_URL, {
            key: API_KEY,
            action: 'add',
            service: SERVICE_ID,
            link: link,
            quantity: QUANTITY
        }, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        console.log('✅ تم إرسال الطلب بنجاح:', response.data);
        
        // إضافة الرابط إلى قاعدة البيانات
        addUrlToDatabase(link, 'success');
        
        res.json({ success: true, data: response.data });

    } catch (error) {
        console.error('❌ خطأ في معالجة الطلب:', error.message);
        
        // إضافة الرابط إلى قاعدة البيانات مع حالة خطأ
        if (req.body.link) {
            addUrlToDatabase(req.body.link, 'error');
        }
        
        if (error.response) {
            res.status(error.response.status).json({ 
                success: false, 
                error: error.response.data.error || 'حدث خطأ في API الخارجي' 
            });
        } else {
            res.status(500).json({ 
                success: false, 
                error: 'حدث خطأ في الخادم الداخلي' 
            });
        }
    }
});

// مسار لعرض إحصائيات الطلبات (اختياري)
app.get('/api/stats', (req, res) => {
    const db = readDatabase();
    const stats = {
        totalRequests: db.requests.length,
        successRequests: db.requests.filter(r => r.status === 'success').length,
        rejectedRequests: db.requests.filter(r => r.status === 'rejected').length,
        errorRequests: db.requests.filter(r => r.status === 'error').length
    };
    res.json(stats);
});

// تشغيل الخادم
app.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
    console.log(`📊 نظام منع الطلبات المكررة: مفعّل`);
    console.log(`⏱️  الفترة الزمنية: ساعة واحدة`);
});
