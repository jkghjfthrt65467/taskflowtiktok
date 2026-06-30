# 🐳 Docker Guide - Order Processor

دليل شامل لتشغيل التطبيق مع Docker و Docker Compose.

---

## 📋 المتطلبات

- **Docker** 20.10+
- **Docker Compose** 1.29+

---

## 🚀 التشغيل السريع

### 1. تشغيل مع Docker Compose (الأسهل)

```bash
# الذهاب إلى مجلد التطبيق
cd /path/to/order-processor

# بدء التطبيق والقاعدة
docker-compose up -d

# التحقق من الحالة
docker-compose ps

# عرض السجلات
docker-compose logs -f order-processor
```

### 2. إيقاف التطبيق

```bash
docker-compose down
```

### 3. إعادة تشغيل

```bash
docker-compose restart
```

---

## 🔨 البناء اليدوي

### بناء الصورة

```bash
docker build -t order-processor:latest .
```

### تشغيل الحاوية

```bash
docker run -d \
  --name order-processor \
  -p 10001:10001 \
  -e DATABASE_URL="postgresql://user:password@postgres:5432/db" \
  order-processor:latest
```

---

## 📊 الأوامر المفيدة

### عرض الحاويات

```bash
# الحاويات قيد التشغيل
docker ps

# جميع الحاويات
docker ps -a
```

### عرض السجلات

```bash
# سجلات التطبيق
docker-compose logs order-processor

# سجلات قاعدة البيانات
docker-compose logs postgres

# متابعة السجلات مباشرة
docker-compose logs -f
```

### الدخول إلى الحاوية

```bash
# الدخول إلى حاوية التطبيق
docker-compose exec order-processor bash

# الدخول إلى قاعدة البيانات
docker-compose exec postgres psql -U order_user -d order_processor_db
```

### إعادة بناء الصورة

```bash
docker-compose build --no-cache
```

---

## 🔧 متغيرات البيئة

### ملف `.env`

```bash
# قاعدة البيانات
DATABASE_URL=postgresql://order_user:order_password@postgres:5432/order_processor_db

# الخادم
PORT=10001
FLASK_ENV=production

# APIs
ADMIN_API_KEY=9495qsacgcm64hj0z1sprxce7qj0nkbh71w6h6xumigan8h141koirzkxwoqg48b
EXTERNAL_API_KEY=ce5d33dc71b144c60cab2f8f977bbc21
```

### تطبيق المتغيرات

```bash
# في docker-compose.yml
env_file: .env
```

---

## 📦 هيكل الملفات

```
order-processor/
├── Dockerfile              # تعريف الصورة
├── docker-compose.yml      # تعريف الخدمات
├── .dockerignore          # الملفات المستثناة
├── order_processor.py     # الكود الرئيسي
├── requirements.txt       # المتطلبات
├── PYTHON_README.md       # دليل Python
└── DOCKER_GUIDE.md        # هذا الملف
```

---

## 🧪 الاختبار

### فحص صحة الخادم

```bash
curl http://localhost:10001/api/health
```

### الإحصائيات

```bash
curl http://localhost:10001/api/stats
```

### الإعدادات

```bash
curl http://localhost:10001/api/config
```

---

## 🔒 الأمان

### تغيير كلمات المرور

في `docker-compose.yml`:

```yaml
environment:
  - POSTGRES_PASSWORD=your_strong_password
```

### استخدام متغيرات البيئة

```bash
export DB_PASSWORD=your_strong_password
docker-compose up -d
```

---

## 📈 الأداء

### تحسين الأداء

```yaml
# في docker-compose.yml
services:
  order-processor:
    environment:
      - WORKERS=8  # عدد العمليات
      - THREADS=4  # عدد الخيوط
```

### المراقبة

```bash
# استهلاك الموارد
docker stats

# معلومات الحاوية
docker inspect order-processor
```

---

## 🐛 استكشاف الأخطاء

### الخطأ: `Connection refused`

```bash
# تحقق من أن PostgreSQL يعمل
docker-compose logs postgres

# أعد تشغيل الخدمة
docker-compose restart postgres
```

### الخطأ: `Database does not exist`

```bash
# أعد بناء الصور
docker-compose down -v
docker-compose up -d
```

### الخطأ: `Port already in use`

```bash
# غير المنفذ في docker-compose.yml
ports:
  - "10002:10001"  # استخدم 10002 بدلاً من 10001
```

---

## 📝 الملاحظات

- جميع البيانات محفوظة في `postgres_data` volume
- الحاويات تعيد التشغيل تلقائياً عند الفشل
- يتم فحص صحة الخادم كل 30 ثانية

---

## 🚀 النشر على الإنتاج

### استخدام Docker Hub

```bash
# بناء الصورة
docker build -t your-username/order-processor:1.0 .

# رفع الصورة
docker push your-username/order-processor:1.0

# تشغيل من Docker Hub
docker run -d \
  -p 10001:10001 \
  -e DATABASE_URL="..." \
  your-username/order-processor:1.0
```

### استخدام Docker Registry الخاص

```bash
# بناء الصورة
docker build -t registry.example.com/order-processor:1.0 .

# رفع الصورة
docker push registry.example.com/order-processor:1.0
```

---

## 📞 الدعم

للمزيد من المعلومات:
- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Flask in Docker](https://flask.palletsprojects.com/en/latest/deploying/docker/)
