@echo off
cd /d D:\Code\crawlweb_django\server\crawlweb
python manage.py shell < backfill.py
pause