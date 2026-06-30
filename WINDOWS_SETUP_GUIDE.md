# 🪟 Windows Setup Guide - Order Processor

دليل شامل لتثبيت وتشغيل Order Processor على Windows مع Visual Studio Code.

---

## 📋 المتطلبات

### 1. Python 3.11+
- **تحميل:** https://www.python.org/downloads/
- **اختر:** Python 3.11 أو أحدث
- **مهم:** ✅ اختر "Add Python to PATH"

### 2. PostgreSQL 15+
- **تحميل:** https://www.postgresql.org/download/windows/
- **تثبيت:** اتبع الخطوات الافتراضية
- **تذكر:** كلمة مرور المسؤول

### 3. Visual Studio Code (اختياري)
- **تحميل:** https://code.visualstudio.com/
- **امتدادات مقترحة:**
  - Python (ms-python.python)
  - Pylance (ms-python.vscode-pylance)

### 4. Git (اختياري)
- **تحميل:** https://git-scm.com/download/win

---

## 🚀 التثبيت السريع (الطريقة الموصى بها)

### الخطوة 1: تحضير المشروع

```bash
# 1. انسخ المشروع إلى مجلد
# مثلاً: C:\Users\YourName\Documents\order-processor

# 2. افتح PowerShell أو Command Prompt
# انقر بزر الفأرة الأيمن على المجلد واختر "Open PowerShell here"
```

### الخطوة 2: تشغيل برنامج التثبيت

```bash
# شغّل برنامج التثبيت
setup_windows.bat
```

**ماذا يفعل البرنامج:**
- ✅ التحقق من Python
- ✅ إنشاء بيئة افتراضية
- ✅ تثبيت المتطلبات
- ✅ إنشاء ملف .env

### الخطوة 3: تعديل الإعدادات

```bash
# افتح ملف .env بأي محرر نصوص
# مثلاً: Notepad أو VS Code

# عدّل البيانات التالية:
DATABASE_URL=postgresql://order_user:order_password@localhost:5432/order_processor_db
ADMIN_API_KEY=your_key_here
EXTERNAL_API_KEY=your_key_here
```

### الخطوة 4: تشغيل التطبيق

```bash
# شغّل برنامج التشغيل
run_windows.bat
```

**النتيجة:**
```
🌐 Server will be available at: http://localhost:10001
📊 API Health: http://localhost:10001/api/health
```

---

## 📖 التثبيت اليدوي (خطوة بخطوة)

### الخطوة 1: إنشاء بيئة افتراضية

```bash
# افتح PowerShell في مجلد المشروع
cd C:\path\to\order-processor

# أنشئ بيئة افتراضية
python -m venv venv

# تفعيل البيئة
venv\Scripts\activate
```

**ستلاحظ:**
```
(venv) C:\path\to\order-processor>
```

### الخطوة 2: تثبيت المتطلبات

```bash
# تحديث pip
python -m pip install --upgrade pip

# تثبيت المتطلبات
pip install -r requirements.txt
```

### الخطوة 3: إنشاء ملف .env

```bash
# انسخ الملف النموذجي
copy .env.example .env

# افتح .env وعدّل البيانات
# استخدم Notepad أو VS Code
notepad .env
```

### الخطوة 4: تشغيل التطبيق

```bash
# تأكد من تفعيل البيئة الافتراضية
venv\Scripts\activate

# شغّل التطبيق
python order_processor.py
```

---

## 🎯 استخدام Visual Studio Code

### الخطوة 1: فتح المشروع

1. افتح VS Code
2. اختر `File > Open Folder`
3. اختر مجلد `order-processor`

### الخطوة 2: تثبيت الامتدادات

1. اضغط `Ctrl+Shift+X` (Extensions)
2. ابحث عن "Python"
3. ثبّت `Python` من Microsoft
4. ثبّت `Pylance`

### الخطوة 3: اختيار Python Interpreter

1. اضغط `Ctrl+Shift+P` (Command Palette)
2. اكتب "Python: Select Interpreter"
3. اختر `./venv/Scripts/python.exe`

### الخطوة 4: تشغيل التطبيق

**الطريقة 1: استخدام الزر Run**
1. افتح `order_processor.py`
2. اضغط الزر ▶️ في الزاوية العلوية اليمنى

**الطريقة 2: استخدام F5**
1. اضغط `F5`
2. اختر `Python: Flask`

**الطريقة 3: استخدام Terminal**
1. اضغط `` Ctrl+` `` (فتح Terminal)
2. اكتب:
```bash
python order_processor.py
```

---

## 🗄️ إعداد قاعدة البيانات

### الخطوة 1: تشغيل PostgreSQL

```bash
# PostgreSQL يعمل تلقائياً بعد التثبيت
# تحقق من الخدمة:
# Settings > Services > PostgreSQL
```

### الخطوة 2: إنشاء قاعدة بيانات

```bash
# افتح pgAdmin (يأتي مع PostgreSQL)
# أو استخدم psql:

psql -U postgres

# أنشئ مستخدم جديد
CREATE USER order_user WITH PASSWORD 'order_password';

# أنشئ قاعدة بيانات
CREATE DATABASE order_processor_db OWNER order_user;

# أعط الصلاحيات
GRANT ALL PRIVILEGES ON DATABASE order_processor_db TO order_user;

# اخرج
\q
```

### الخطوة 3: تحديث .env

```env
DATABASE_URL=postgresql://order_user:order_password@localhost:5432/order_processor_db
```

---

## 🧪 الاختبار

### فحص الخادم

```bash
# في PowerShell أو Command Prompt
curl http://localhost:10001/api/health

# أو في المتصفح
http://localhost:10001/api/health
```

### الإحصائيات

```bash
curl http://localhost:10001/api/stats
```

---

## 🐛 استكشاف الأخطاء الشائعة

### ❌ "Python is not installed"

**الحل:**
1. تحميل Python من https://www.python.org/
2. ✅ اختر "Add Python to PATH"
3. أعد تشغيل PowerShell

### ❌ "ModuleNotFoundError: No module named 'flask'"

**الحل:**
```bash
# تأكد من تفعيل البيئة الافتراضية
venv\Scripts\activate

# أعد تثبيت المتطلبات
pip install -r requirements.txt
```

### ❌ "Port 10001 already in use"

**الحل:**
```bash
# غيّر المنفذ في .env
PORT=10002

# أو أوقف التطبيق الذي يستخدم المنفذ
netstat -ano | findstr :10001
taskkill /PID <PID> /F
```

### ❌ "Database connection failed"

**الحل:**
```bash
# تحقق من DATABASE_URL في .env
# تأكد من أن PostgreSQL يعمل
# جرب الاتصال:
psql -U order_user -h localhost -d order_processor_db
```

### ❌ "Permission denied"

**الحل:**
```bash
# شغّل PowerShell كمسؤول
# ثم حاول مرة أخرى
```

---

## 📁 هيكل المشروع

```
order-processor/
├── order_processor.py          # الملف الرئيسي
├── requirements.txt            # المتطلبات
├── .env                        # متغيرات البيئة (لا تنشره)
├── .env.example               # مثال المتغيرات
│
├── setup_windows.bat          # برنامج التثبيت
├── run_windows.bat            # برنامج التشغيل
│
├── .vscode/
│   ├── settings.json          # إعدادات VS Code
│   ├── launch.json            # إعدادات التشغيل
│   └── extensions.json        # الامتدادات الموصى بها
│
├── Dockerfile                 # لـ Docker
├── docker-compose.yml         # لـ Docker Compose
│
└── README.md                  # الدليل الرئيسي
```

---

## 🔄 سير العمل اليومي

### تشغيل التطبيق

```bash
# الطريقة 1: استخدام البرنامج النصي
run_windows.bat

# الطريقة 2: يدويًا
venv\Scripts\activate
python order_processor.py
```

### إيقاف التطبيق

```bash
# اضغط Ctrl+C في Terminal
```

### إعادة تشغيل

```bash
# اضغط Ctrl+C ثم شغّل مرة أخرى
```

---

## 📚 موارد إضافية

- [Python Documentation](https://docs.python.org/3/)
- [Flask Documentation](https://flask.palletsprojects.com/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [VS Code Python Guide](https://code.visualstudio.com/docs/languages/python)

---

## ✅ قائمة التحقق

- [ ] Python 3.11+ مثبت
- [ ] PostgreSQL 15+ مثبت
- [ ] المشروع منسوخ
- [ ] `setup_windows.bat` شُغّل بنجاح
- [ ] ملف `.env` معدّل
- [ ] الخادم يعمل على `http://localhost:10001`
- [ ] `/api/health` يعود `ok`

---

## 🎉 تم!

الآن أنت جاهز لاستخدام Order Processor على Windows!

للمزيد من المساعدة، راجع:
- [README.md](README.md) - الدليل الرئيسي
- [PYTHON_README.md](PYTHON_README.md) - دليل Python
- [DOCKER_GUIDE.md](DOCKER_GUIDE.md) - دليل Docker
