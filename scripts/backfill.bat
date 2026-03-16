@echo off
setlocal
cd /d D:\Code\crawlweb_django\server\crawlweb

if "%~1"=="" (
	set BACKFILL_MODE=all
) else (
	set BACKFILL_MODE=%~1
)

echo Running backfill mode: %BACKFILL_MODE%
python manage.py shell -c "exec(open('backfill.py', encoding='utf-8').read())"
pause