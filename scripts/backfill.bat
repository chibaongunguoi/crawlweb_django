@echo off
setlocal enabledelayedexpansion

REM Get the directory of this script
set SCRIPT_DIR=%~dp0
REM Get parent directory
set PARENT_DIR=!SCRIPT_DIR!..
REM Navigate to the server/crawlweb directory
cd /d "!PARENT_DIR!\server\crawlweb"

REM Set PYTHONPATH to include the server directory for module imports
set PYTHONPATH=!PARENT_DIR!\server;!PYTHONPATH!

REM Check if MongoDB is running
tasklist | findstr /I mongod >nul 2>&1
if errorlevel 1 (
    echo MongoDB is not running. Starting MongoDB...
    REM Start MongoDB in a separate window
    start "MongoDB" "C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe" --config "!PARENT_DIR!\var\mongod.cfg"
    REM Wait for MongoDB to start
    timeout /t 3 /nobreak
)

if "%~1"=="" (
	set BACKFILL_MODE=all
) else (
	set BACKFILL_MODE=%~1
)

echo Running backfill mode: %BACKFILL_MODE%
echo Current directory: %CD%
python manage.py shell -c "exec(open('backfill.py', encoding='utf-8').read())"

echo.
echo Backfill completed successfully!
pause