@echo off
REM ============================================================================
REM Order Processor - Windows Run Script
REM ============================================================================

echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║   Order Processor - Starting Application                       ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.

REM Check if virtual environment exists
if not exist venv (
    echo ❌ Virtual environment not found
    echo Please run setup_windows.bat first
    pause
    exit /b 1
)

REM Activate virtual environment
call venv\Scripts\activate.bat

REM Check if .env file exists
if not exist .env (
    echo ❌ .env file not found
    echo Please create .env file from .env.example
    pause
    exit /b 1
)

REM Start the application
echo ✅ Starting Order Processor...
echo.
echo 🌐 Server will be available at: http://localhost:10001
echo 📊 API Health: http://localhost:10001/api/health
echo 📈 Statistics: http://localhost:10001/api/stats
echo.
echo Press Ctrl+C to stop the server
echo.

python order_processor.py

pause
