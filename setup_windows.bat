@echo off
REM ============================================================================
REM Order Processor - Windows Setup Script
REM ============================================================================

echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║   Order Processor - Windows Setup                              ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python is not installed or not in PATH
    echo Please install Python 3.11+ from https://www.python.org/
    pause
    exit /b 1
)

echo ✅ Python found
python --version

REM Create virtual environment
echo.
echo 📦 Creating virtual environment...
if exist venv (
    echo ⚠️  Virtual environment already exists
) else (
    python -m venv venv
    echo ✅ Virtual environment created
)

REM Activate virtual environment
echo.
echo 🔄 Activating virtual environment...
call venv\Scripts\activate.bat

REM Upgrade pip
echo.
echo 📦 Upgrading pip...
python -m pip install --upgrade pip

REM Install requirements
echo.
echo 📦 Installing dependencies...
pip install -r requirements.txt

REM Create .env file
echo.
echo 📝 Creating .env file...
if exist .env (
    echo ⚠️  .env file already exists
) else (
    copy .env.example .env
    echo ✅ .env file created
    echo ⚠️  Please edit .env with your configuration
)

REM Create directories
echo.
echo 📁 Creating directories...
if not exist logs mkdir logs
if not exist data mkdir data

echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║   ✅ Setup Complete!                                           ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.
echo 📝 Next steps:
echo    1. Edit .env file with your configuration
echo    2. Run: run_windows.bat
echo.
pause
