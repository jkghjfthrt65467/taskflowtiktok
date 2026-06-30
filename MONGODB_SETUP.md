# إعداد أداة معالجة الطلبات مع MongoDB

## 1️⃣ إنشاء حساب MongoDB مجاني

1. اذهب إلى: https://www.mongodb.com/cloud/atlas
2. اضغط "Sign Up" وأنشئ حساب مجاني
3. اختر خطة **M0 Sandbox** (مجانية)
4. اختر المنطقة الأقرب لك

## 2️⃣ إنشاء قاعدة بيانات

1. في لوحة التحكم، اضغط "Create Deployment"
2. اختر "M0 Free" (مجاني)
3. انتظر إنشاء القاعدة (دقيقة واحدة)

## 3️⃣ الحصول على Connection String

1. اضغط "Connect" على الـ Cluster
2. اختر "Drivers"
3. انسخ Connection String (يبدو مثل):
   ```
   mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

## 4️⃣ إعداد متغيرات البيئة

### على Vercel:

1. اذهب إلى: https://vercel.com/jkghjfthrt65467s-projects/taskflowtiktok/settings/environment-variables
2. أضف متغير جديد:
   - **Name**: `MONGODB_URI`
   - **Value**: Connection String من MongoDB
3. اضغط "Save"

### محلياً:

أنشئ ملف `.env`:
```
MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

## 5️⃣ التثبيت والتشغيل

```bash
# تثبيت المتطلبات
npm install

# تشغيل الخادم
npm start
```

## 6️⃣ التحقق من الاتصال

```bash
# فحص صحة الخادم
curl http://localhost:10001/api/health

# الإحصائيات
curl http://localhost:10001/api/stats

# الإعدادات
curl http://localhost:10001/api/config
```

## 📊 الإحصائيات

- **الطلبات المعالجة**: تُحفظ في `orders` collection
- **الطلبات المكررة**: تُحفظ مع سبب الإلغاء
- **تتبع المستخدمين**: باستخدام تجزئة آمنة (hash)
- **تتبع الروابط**: باستخدام تجزئة آمنة

## ⚠️ ملاحظات مهمة

1. **الخطة المجانية تشمل:**
   - 512 MB من التخزين
   - 3 نسخ احتياطية
   - مراقبة أساسية

2. **لا تشارك Connection String** مع أحد

3. **استخدم متغيرات البيئة** دائماً

4. **الخادم سيفحص الطلبات تلقائياً** كل 5 دقائق

## 🔧 استكشاف الأخطاء

### خطأ: "EROFS: read-only file system"
✅ تم الحل بـ MongoDB - لا مزيد من الملفات

### خطأ: "Connection refused"
- تأكد من Connection String صحيح
- تأكد من IP Whitelist على MongoDB

### خطأ: "Authentication failed"
- تحقق من اسم المستخدم وكلمة المرور
- أعد إنشاء المستخدم إذا لزم الأمر

## 📞 الدعم

للمزيد من المعلومات:
- MongoDB Docs: https://docs.mongodb.com/
- Vercel Environment Variables: https://vercel.com/docs/environment-variables
