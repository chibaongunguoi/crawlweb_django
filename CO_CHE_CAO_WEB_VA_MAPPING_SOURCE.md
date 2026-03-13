# Co Che Cao Web Va Mapping Source

Tai lieu nay mo ta co che crawl cua project va cach xac dinh truong `source` cho moi job.

## 1) Luong xu ly tong quan

Project gom 2 phan backend chinh:
- Django API (`server/crawlweb`) quan ly upload URL, theo doi tien do, luu ket qua vao MongoDB.
- Scraper service FastAPI (`server/scraper`) thuc hien crawl/scrape thuc te.

Luong xu ly:
1. Frontend/Admin goi `POST /api/scrape/upload/` voi danh sach URL.
2. Django tao ban ghi `ScrapeJob` (status=`processing`).
3. Django goi scraper service tai `http://localhost:37001/api/scrape` va truyen:
   - `urls`
   - `callback_url` -> `/api/scrape/result/`
   - `progress_callback_url` -> `/api/scrape/progress/`
   - `metadata.jobId`
4. Scraper crawl theo strategy phu hop (TopCV/DevWork) roi callback ve Django.
5. Django nhan callback ket qua trong `scrape_result` va `update_or_create` vao `JobDetail` theo `url`.

## 2) Noi luu du lieu

- `ScrapeJob`: theo doi job crawl (progress, totalUrls, processedUrls, status, errorMessage...).
- `JobDetail`: luu tung cong viec crawl duoc, gom:
  - `url`, `job_title`, `company_name`, `province`, `salary`, `skills`, ...
  - `source` (nguon website cua job)

## 3) Co che xac dinh `source`

File xu ly: `server/crawlweb/api/scrape_views.py`

Ham `extract_source(url)`:
1. Parse hostname tu `url` bang `urlparse`.
2. Chuan hoa host (lowercase, bo `www.` de so sanh).
3. Uu tien map chinh xac qua `SOURCE_HOST_MAPPING`.
4. Neu khong khop exact map thi dung fallback theo ho domain:
   - host co chu `devwork` -> `devwork`
   - host co chu `topcv` -> `topcv`
5. Neu van khong khop thi lay label dau tien cua domain.
6. Loi parse/URL khong hop le -> `unknown`.

## 4) Map DevWork da cap nhat

Da map day du hon cho DevWork:
- `devwork.vn` -> `devwork`
- `www.devwork.vn` -> `devwork`
- `devwork.com` -> `devwork`
- `www.devwork.com` -> `devwork`
- `jobs.devwork.com` -> `devwork`
- `jobs.devwork.vn` -> `devwork`

Vi vay URL nhu `https://devwork.vn/...` se ra `source = devwork`.

## 5) Vi sao van co ban ghi `unknown`?

Thuong do la du lieu cu da luu truoc khi sua mapping.

Luu y:
- Logic map moi chi ap dung khi co callback moi tu scraper.
- Ban ghi cu can crawl lai hoac backfill de cap nhat `source`.

## 6) Cach cap nhat du lieu cu dang `unknown`

Cach 1 (khuyen nghi): crawl lai URL cu de `update_or_create` cap nhat ban ghi.

Cach 2: backfill bang script shell Django:

```powershell
Set-Location d:\Code\crawlweb_django\server\crawlweb
python manage.py shell
```

Trong shell:

```python
from api.models import JobDetail
from api.scrape_views import extract_source

updated = 0
for job in JobDetail.objects.all():
    if not job.source or job.source == 'unknown':
        new_source = extract_source(job.url)
        if new_source and new_source != job.source:
            job.source = new_source
            job.save()
            updated += 1

print('updated:', updated)
```

## 7) Test nhanh

1. Upload URL DevWork qua `/api/scrape/upload/`.
2. Doi job hoan tat.
3. Goi `GET /api/jobs/` hoac `GET /api/jobDetail/`.
4. Kiem tra object job co:

```json
{
  "url": "https://devwork.vn/...",
  "source": "devwork"
}
```

## 8) Ghi chu van hanh

- `scripts/mongo.sh` dang truyen duong dan mongod theo Git Bash (`/c/Program Files/...`).
- Tren Windows PowerShell, uu tien chay MongoDB bang service hoac duong dan Windows format.
- Neu scraper fail, kiem tra port `37001` va log trong terminal scraper.
