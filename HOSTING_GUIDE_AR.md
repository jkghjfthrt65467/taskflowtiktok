# 🚀 دليل استضافة الـ API مجاناً على Render

هذا الدليل يشرح كيف ترفع الـ API الخاص بك على استضافة Render المجانية خلال 5 دقائق.

## 📦 محتويات المشروع
المشروع عبارة عن تطبيق Node.js بسيط ومجهز للاستضافة فوراً:
1. `server.js` (كود الخادم)
2. `package.json` (الإعدادات)

---

## 🛠️ الخطوة 1: رفع الكود على GitHub

1. قم بإنشاء حساب في [GitHub](https://github.com/) إذا لم يكن لديك.
2. أنشئ مستودع (Repository) جديد.
3. ارفع الملفين (`server.js` و `package.json`) إلى المستودع.

---

## ☁️ الخطوة 2: الاستضافة على Render

1. اذهب إلى [Render.com](https://render.com/) وسجل دخول باستخدام حساب GitHub.
2. من لوحة التحكم، اضغط على زر **New +** واختر **Web Service**.
3. اختر **Build and deploy from a Git repository**.
4. اربط حساب GitHub الخاص بك واختر المستودع الذي أنشأته.
5. املأ الإعدادات كالتالي:
   - **Name:** `tiktok-api` (أو أي اسم)
   - **Region:** اختر الأقرب لك (مثلاً Frankfurt)
   - **Branch:** `main`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
6. اختر الخطة المجانية (**Free**).
7. اضغط على زر **Create Web Service**.

---

## 🔐 الخطوة 3: إضافة مفتاح API السري

للحفاظ على أمان مفتاحك، سنضيفه كمتغير بيئة (Environment Variable):

1. في صفحة الخدمة على Render، اذهب إلى قائمة **Environment** من اليسار.
2. اضغط على **Add Environment Variable**.
3. أضف التالي:
   - **Key:** `API_KEY`
   - **Value:** `1a26d1859e5b8060b4b46806651bfe9a` (مفتاحك)
4. اضغط **Save Changes**.

---

## 🔗 الخطوة 4: الحصول على الرابط وربطه بالصفحة

1. بعد اكتمال الرفع (يستغرق دقيقتين)، ستجد رابط الـ API في أعلى الصفحة (مثلاً: `https://tiktok-api-xyz.onrender.com`).
2. انسخ هذا الرابط.
3. افتح ملف الصفحة `tiktok-views-page-updated.html`.
4. ابحث عن السطر رقم 270 تقريباً:
   ```javascript
   const API_URL = 'https://your-api-url.com/api/order';
   ```
5. استبدله بالرابط الجديد الخاص بك:
   ```javascript
   const API_URL = 'https://tiktok-api-xyz.onrender.com/api/order';
   ```
6. احفظ الصفحة وارفعها إلى استضافتك الخاصة!

---

## ✅ اختبار الـ API

للتأكد من أن الـ API يعمل:
افتح متصفحك واذهب إلى رابط الـ API الخاص بك مضافاً إليه `/api/health`
مثال: `https://tiktok-api-xyz.onrender.com/api/health`

يجب أن ترى هذه النتيجة:
```json
{"status":"ok","message":"Server is running normally"}
```

🎉 **مبروك! الـ API الخاص بك يعمل الآن بأمان والصفحة متصلة به.**
