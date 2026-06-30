# إعداد أداة معالجة الطلبات مع PostgreSQL

## 1️⃣ خيارات قاعدة البيانات المجانية

### الخيار 1: Render PostgreSQL (الأسهل والأسرع) ⭐

1. اذهب إلى: https://render.com/
2. اضغط "Sign up" وسجل دخول عبر GitHub
3. اختر "PostgreSQL" من القائمة
4. اختر الخطة المجانية
5. انسخ Connection String

### الخيار 2: Railway PostgreSQL

1. اذهب إلى: https://railway.app/
2. اضغط "Start a New Project"
3. اختر "PostgreSQL"
4. انسخ Database URL

### الخيار 3: Neon (الأفضل للأداء)

1. اذهب إلى: https://neon.tech/
2. اضغط "Sign up"
3. اختر الخطة المجانية
4. انسخ Connection String

## 2️⃣ إعداد متغيرات البيئة

### على Vercel:

1. اذهب إلى: https://vercel.com/jkghjfthrt65467s-projects/taskflowtiktok/settings/environment-variables
2. أضف متغير جديد:
   - **Name**: `DATABASE_URL`
   - **Value**: Connection String من PostgreSQL
3. مثال:
   ```
   postgresql://user:password@host:5432/database_name
   ```
4. اضغط "Save"

### محلياً:

أنشئ ملف `.env`:
```
DATABASE_URL=postgresql://user:password@localhost:5432/order_processor
```

## 3️⃣ التثبيت والتشغيل

```bash
# تثبيت المتطلبات
npm install

# تشغيل الخادم
npm start
```

## 4️⃣ التحقق من الاتصال

```bash
# فحص صحة الخادم
curl http://localhost:10001/api/health

# الإحصائيات
curl http://localhost:10001/api/stats

# الإعدادات
curl http://localhost:10001/api/config
```

## 📊 هيكل قاعدة البيانات

### جدول `orders`:

| العمود | النوع | الوصف |
|-------|-------|-------|
| id | SERIAL | معرّف فريد |
| order_id | VARCHAR | معرّف الطلب من الإدارة |
| user_id_hash | VARCHAR | تجزئة معرّف المستخدم |
| url_hash | VARCHAR | تجزئة الرابط |
| external_order_id | VARCHAR | معرّف الطلب الخارجي |
| status | VARCHAR | حالة الطلب (processed/cancelled) |
| reason | VARCHAR | سبب الإلغاء |
| quantity | INTEGER | الكمية المطلوبة |
| original_url | TEXT | الرابط الأصلي |
| message | TEXT | رسالة إضافية |
| created_at | TIMESTAMP | وقت الإنشاء |
| updated_at | TIMESTAMP | وقت التحديث |

## 🔧 الفهارس (Indexes)

- `idx_user_id_hash`: لتسريع البحث عن المستخدم
- `idx_url_hash`: لتسريع البحث عن الرابط
- `idx_external_order_id`: لتسريع البحث عن الطلب الخارجي
- `idx_status`: لتسريع البحث حسب الحالة

## ⚠️ ملاحظات مهمة

1. **الخطة المجانية تشمل:**
   - قاعدة بيانات واحدة
   - تخزين محدود (5-10 GB)
   - نسخ احتياطية يومية

2. **لا تشارك Connection String** مع أحد

3. **استخدم متغيرات البيئة** دائماً

4. **الخادم سيفحص الطلبات تلقائياً** كل 5 دقائق

## 🔍 استكشاف الأخطاء

### خطأ: "Connection refused"
- تأكد من Connection String صحيح
- تأكد من أن قاعدة البيانات تعمل
- تأكد من IP Whitelist (إذا كانت مطلوبة)

### خطأ: "ECONNREFUSED"
- تحقق من اسم المضيف (host)
- تحقق من رقم المنفذ (port)
- تحقق من كلمة المرور

### خطأ: "relation does not exist"
- الخادم سينشئ الجداول تلقائياً عند البدء
- إذا لم يحدث، تأكد من صلاحيات قاعدة البيانات

## 📞 الدعم

للمزيد من المعلومات:
- PostgreSQL Docs: https://www.postgresql.org/docs/
- Render Docs: https://render.com/docs
- Railway Docs: https://docs.railway.app/
- Neon Docs: https://neon.tech/docs/

## 🚀 نصائح الأداء

1. **استخدم Connection Pooling** (مدمج في الكود)
2. **استخدم الفهارس** (مدمجة في الكود)
3. **نظّف البيانات القديمة** دورياً:
   ```sql
   DELETE FROM orders WHERE created_at < NOW() - INTERVAL '90 days';
   ```

## 📈 مراقبة الأداء

```sql
-- عدد الطلبات المعالجة اليوم
SELECT COUNT(*) FROM orders 
WHERE status = 'processed' 
AND created_at > NOW() - INTERVAL '1 day';

-- الطلبات المكررة
SELECT COUNT(*) FROM orders 
WHERE status = 'cancelled' 
AND reason IN ('user_cooldown', 'url_cooldown');

-- متوسط وقت المعالجة
SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_seconds
FROM orders WHERE status = 'processed';
```
