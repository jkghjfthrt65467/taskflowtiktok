# استخدام صورة Python الرسمية
FROM python:3.11-slim

# تعيين مجلد العمل
WORKDIR /app

# تثبيت المتطلبات النظامية
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# نسخ ملف المتطلبات
COPY requirements.txt .

# تثبيت المتطلبات
RUN pip install --no-cache-dir -r requirements.txt

# نسخ الكود
COPY order_processor.py .

# تعيين متغيرات البيئة
ENV FLASK_APP=order_processor.py
ENV PYTHONUNBUFFERED=1
ENV PORT=10001

# فتح المنفذ
EXPOSE 10001

# أمر التشغيل
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:10001", "--timeout", "120", "order_processor:app"]
