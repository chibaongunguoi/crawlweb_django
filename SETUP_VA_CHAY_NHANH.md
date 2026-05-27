# SETUP VA CHAY NHANH (WINDOWS)

Tai lieu nay huong dan setup va chay project `crawlweb_django` sau khi da them truong `source` cho `JobDetail`.

## 1) Co can chay migration khong?

Co, nen chay.

- Ban da sua model `JobDetail` (them truong `source`), vi vay can cap nhat migration state cua Django.
- Du an dung MongoDB (schema linh hoat), nhung migration van can de dong bo metadata model va tranh sai lech sau nay.

## 2) Chay migration

Mo PowerShell tai root project:

```powershell
Set-Location d:\Code\crawlweb_django\server\crawlweb
python manage.py makemigrations
python manage.py migrate
python manage.py check
```

Neu `makemigrations` bao khong co thay doi (`No changes detected`) thi co the migration da duoc tao truoc do.

## 3) Chay backend Django

```powershell
Set-Location d:\Code\crawlweb_django\server\crawlweb
# Neu can, kich hoat venv:
# ..\myworld\Scripts\Activate.ps1
python manage.py runserver
```

Backend mac dinh: `http://localhost:8000`

## 4) Chay scraper service

```powershell
Set-Location d:\Code\crawlweb_django
scripts\scraper.bat
```

Scraper mac dinh: `http://localhost:37001`

## 5) Chay frontend React

```powershell
Set-Location d:\Code\crawlweb_django\client\app
npm install
npm start
```

Frontend mac dinh: `http://localhost:3000`

## 6) Kiem tra nhanh feature `source` + deadline

1. Goi API scrape upload:

```http
POST /api/scrape/upload/
{
  "urls": ["https://devworks.example/jobs/123"]
}
```

2. Sau khi scraper callback xong, kiem tra:
- `GET /api/jobs/`
- `GET /api/jobDetail/`

Mong doi: job co field `source`, vi du `"source": "devworks"`.

Neu URL co deadline, response se co them:
- `deadline` (yyyy-mm-dd)
- `isExpired` (true/false/null)
- `daysLeft` (so ngay con lai)

## 7) Search + pagination API moi

Endpoint moi:
- `GET /api/jobs/search/?q=python&city=ha%20noi&page=1&pageSize=24`

Response:
```json
{
  "items": [],
  "page": 1,
  "pageSize": 24,
  "total": 0,
  "totalPages": 0
}
```

Job detail theo id:
- `GET /api/jobs/{id}`

## 8) Scraper queue / retry / schedule

Backend se xep hang crawl job va retry neu scraper down.

Env (PowerShell):
```powershell
$env:SCRAPE_MAX_RETRIES=3
$env:SCRAPE_RETRY_DELAY=30
$env:SCRAPE_CONCURRENCY=2
$env:SCRAPER_CALLBACK_BASE_URL="http://localhost:8000"
```

API schedule:
- `POST /api/scrape/schedules/` tao lich
- `POST /api/scrape/schedules/{id}/toggle/` bat/tat lich
- `POST /api/scrape/jobs/{id}/retry/` retry thu cong

## 9) Luu y mapping nguon

Logic hien tai:
- Uu tien map hostname dac biet (vd: `devworks.example` -> `devworks`)
- Neu khong map duoc: lay phan dau hostname (vd: `itviec.com` -> `itviec`)
- Loi parse URL: `source = "unknown"`

Neu can bo sung danh sach map cho nhieu site, sua trong file:
- `server/crawlweb/api/scrape_views.py` (`SOURCE_HOST_MAPPING`)
