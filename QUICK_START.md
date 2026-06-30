# ⚡ Quick Start - Order Processor

**ابدأ في 5 دقائق فقط!**

---

## 🪟 على Windows

### 1️⃣ التثبيت (دقيقة واحدة)

```bash
# 1. فك ضغط الملف
# 2. افتح PowerShell في المجلد
# 3. شغّل:
setup_windows.bat
```

### 2️⃣ التعديل (دقيقة واحدة)

```bash
# افتح .env وعدّل:
DATABASE_URL=postgresql://order_user:order_password@localhost:5432/order_processor_db
```

### 3️⃣ التشغيل (دقيقة واحدة)

```bash
run_windows.bat
```

✅ **تم! الخادم يعمل على:** http://localhost:10001

---

## 🍎 على macOS / Linux

### 1️⃣ التثبيت

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2️⃣ التعديل

```bash
cp .env.example .env
# عدّل .env بمحرر نصوص
```

### 3️⃣ التشغيل

```bash
python order_processor.py
```

---

## 🧪 الاختبار

```bash
# في PowerShell أو Terminal جديد
curl http://localhost:10001/api/health
```

**النتيجة المتوقعة:**
```json
{
  "status": "ok",
  "database": "connected",
  "service": "order-processor"
}
```

---

## 🐳 مع Docker

```bash
docker-compose up -d
```

---

## 📚 المزيد من المعلومات

- [WINDOWS_SETUP_GUIDE.md](WINDOWS_SETUP_GUIDE.md) - دليل Windows الشامل
- [PYTHON_README.md](PYTHON_README.md) - دليل Python
- [DOCKER_GUIDE.md](DOCKER_GUIDE.md) - دليل Docker

---

## ❓ مشاكل شائعة

### "Python is not installed"
→ حمّل من https://www.python.org/ (✅ اختر Add to PATH)

### "Port already in use"
→ غيّر PORT في .env إلى 10002

### "Database connection failed"
→ تأكد من PostgreSQL يعمل وبيانات .env صحيحة

---

**تم! الآن أنت جاهز لاستخدام Order Processor! 🎉**
