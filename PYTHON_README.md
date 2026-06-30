# 🐍 Order Processor - Python Version

Advanced order processing system with duplicate detection and filtering.

**Language:** Python 3.11+  
**Framework:** Flask  
**Database:** PostgreSQL  

---

## 📋 المميزات

✅ **جلب الطلبات** من لوحة الإدارة (Service: 17337)  
✅ **فحص الطلبات** المعلقة فقط  
✅ **فلترة الطلبات** المكررة (نفس المستخدم أو نفس الرابط خلال 30 دقيقة)  
✅ **إلغاء الطلبات** المريبة مع استرجاع المبلغ  
✅ **إرسال الطلبات** الصحيحة للمرحلة الثانية (Service: 17828)  
✅ **قاعدة بيانات** PostgreSQL لحفظ البيانات  

---

## 🚀 التثبيت والتشغيل

### 1. تثبيت المتطلبات

```bash
pip install -r requirements.txt
```

### 2. إعداد متغيرات البيئة

```bash
export DATABASE_URL="postgresql://user:password@localhost/order_processor_db"
export PORT=10001
```

### 3. تشغيل الخادم

```bash
python order_processor.py
```

أو مع Gunicorn:

```bash
gunicorn -w 4 -b 0.0.0.0:10001 order_processor:app
```

---

## 📊 API Endpoints

### فحص صحة الخادم

```
GET /api/health
```

**الرد:**
```json
{
  "status": "ok",
  "timestamp": "2026-06-30T18:00:00",
  "database": "connected",
  "service": "order-processor"
}
```

### الإحصائيات

```
GET /api/stats
```

**الرد:**
```json
{
  "total_requests": 100,
  "successful_requests": 95,
  "failed_requests": 5,
  "timestamp": "2026-06-30T18:00:00"
}
```

### الإعدادات

```
GET /api/config
```

**الرد:**
```json
{
  "source_service": 17337,
  "target_service": 17828,
  "user_check_window": 1800,
  "global_cooldown": 3600,
  "timestamp": "2026-06-30T18:00:00"
}
```

---

## 🔧 الإعدادات

| المتغير | القيمة | الوصف |
|--------|--------|-------|
| `DATABASE_URL` | postgresql://... | رابط قاعدة البيانات |
| `PORT` | 10001 | منفذ الخادم |
| `SOURCE_SERVICE_ID` | 17337 | خدمة جلب الطلبات |
| `TARGET_SERVICE_ID` | 17828 | خدمة إرسال الطلبات |
| `USER_CHECK_WINDOW` | 1800 | نافذة فحص المستخدم (ثانية) |
| `GLOBAL_COOLDOWN` | 3600 | فترة الانتظار العامة (ثانية) |

---

## 🔒 نظام الأمان

### 1. فحص المستخدم
- يتم فحص هوية المستخدم بناءً على معرف الطلب
- إذا قام المستخدم بطلب آخر خلال 30 دقيقة، يتم إلغاء الطلب

### 2. فحص الرابط
- يتم تطبيع الرابط (إزالة المعاملات، البروتوكول، إلخ)
- إذا تم طلب نفس الرابط خلال 30 دقيقة، يتم إلغاء الطلب

### 3. إلغاء الطلبات
- الطلبات المكررة يتم إلغاؤها مع استرجاع المبلغ تلقائياً

---

## 📦 هيكل قاعدة البيانات

### جدول `processed_requests`

```sql
CREATE TABLE processed_requests (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(255) UNIQUE NOT NULL,
    user_hash VARCHAR(255) NOT NULL,
    url_hash VARCHAR(255) NOT NULL,
    original_url TEXT NOT NULL,
    service_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    error_message TEXT
);
```

---

## 🧪 الاختبار

### اختبار الخادم محلياً

```bash
# بدء الخادم
python order_processor.py

# في نافذة أخرى
curl http://localhost:10001/api/health
```

---

## 📝 ملاحظات

- الخادم يعمل تلقائياً كل 5 دقائق لفحص ومعالجة الطلبات
- جميع الطلبات يتم حفظها في قاعدة البيانات
- الأخطاء يتم تسجيلها مع رسالة الخطأ

---

## 🐛 استكشاف الأخطاء

### خطأ: `EROFS: read-only file system`
- هذا الخطأ لا يحدث مع Python/Flask لأنه لا يحاول الكتابة على الملفات
- يستخدم PostgreSQL بدلاً من ذلك

### خطأ: `Database connection failed`
- تحقق من `DATABASE_URL`
- تأكد من أن PostgreSQL يعمل
- تحقق من بيانات الاتصال

---

## 📞 الدعم

للمزيد من المعلومات، راجع التوثيق الرسمية:
- [Flask Documentation](https://flask.palletsprojects.com/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Psycopg2 Documentation](https://www.psycopg.org/)
