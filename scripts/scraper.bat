@echo off
echo Starting Scraper Service...
cd /d "%~dp0..\server\scraper"

REM Check if virtual environment exists
if not exist "venv" (
    echo Virtual environment not found. Please run setup first.
    pause
    exit /b 1
)

REM Activate virtual environment
call venv\Scripts\activate.bat

REM Start scraper service
python main.py

pause
