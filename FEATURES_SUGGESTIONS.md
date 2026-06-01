# Gợi ý tính năng cho CrawlWeb

Tổng quan: dự án gồm backend Django (`server/crawlweb`), scraper FastAPI (`server/scraper`) và frontend React (`client/app`). Dưới đây là các tính năng gợi ý, phân loại theo độ ưu tiên và phạm vi (backend, scraper, frontend, ops, dữ liệu).

---

## Ưu tiên cao (Implement sớm)

- **API docs / OpenAPI**: thêm OpenAPI/Swagger cho Django REST API để dễ tích hợp và test nhanh.
- **Xác thực & phân quyền**: cải thiện flow đăng nhập/session (cookie secure, refresh token) và phân quyền admin vs user.
- **Search & Filtering nâng cao**: full-text / faceted search (by skill, city, company, source, deadline) — backend index hoặc thêm Elastic/Meilisearch.
- **Pagination tiêu chuẩn & sorting**: đảm bảo mọi endpoint trả về `page`, `pageSize`, `total`.
- **Retry & backoff cho scraper**: hiện có retry — chuẩn hóa backoff, circuit-breaker, alert khi quá nhiều job fail (`server/scraper` + `server/crawlweb/scrape_queue.py`).
- **Job deduplication / idempotency**: tránh lưu trùng công việc (normalize URL, canonicalization) trước khi `update_or_create`.
- **API rate limiting & abuse protection**: giới hạn request từ client và admin upload để tránh spam hàng loạt.

## Ưu tiên Trung (Value improvements)

- **User features: Saved searches & Alerts**: allow users lưu query, đăng ký thông báo email/notification khi có job mới phù hợp.
- **Ứng tuyển tự động / CV gửi nhanh**: tích hợp `Apply` từ profile người dùng (hiện có cơ bản), theo dõi trạng thái ứng tuyển.
- **Admin dashboard enhancements**: thêm drilldowns, export CSV/JSON cho biểu đồ (frontend chart export đã có, mở rộng backend stats).
- **Scheduled crawls UI**: giao diện quản lý lịch crawl (tạo/stop cron-like schedules) tích hợp `ScrapeSchedule`.
- **Export dữ liệu**: CSV/XLSX export cho `JobDetail` và `ScrapeJob` history.

## Ưu tiên thấp (Nice-to-have)

- **Progress realtime**: cải thiện realtime UI (WebSocket hoặc SSE) để cập nhật tiến trình job tức thì thay vì polling.
- **Progressive Web App (PWA)**: biến frontend thành PWA để dùng offline / push notifications.
- **Multi-tenant / Team support**: phân quyền team, workspace cho enterprise usage.
- **Language / i18n**: hỗ trợ đa ngôn ngữ (tiếng Việt/English) trên UI.

## Scraper-specific (Ổn định & scale)

- **Proxy / IP rotation & rate limit giảm detect**: tích hợp proxy pool, delay randomization, user-agent rotation (đã có cơ bản), captcha handling strategy.
- **Headless browser option**: cho các trang render heavy (Selenium / Playwright) theo cấu hình từng nguồn.
- **Scrape strategy extensibility**: document cách thêm strategy mới (`server/scraper/src/strategies`) và template để add site mới.
- **Monitoring & retry dashboard**: show failed URLs, errors, và allow re-run từng URL.

## Data & DB

- **Index / optimize MongoDB**: thêm index cho `url`, `source`, `createdAt`, các field filter để query nhanh.
- **Data validation & normalization**: chuẩn hóa `salary`, `deadline`, `province` khi ingest (job_utils functions exist).
- **Backfill tools**: script an toàn để reprocess old records (docs already mention backfill); thêm CLI command `manage.py backfill_sources`.
- **Backup & retention**: automated mongodump + retention policy.

## Ops / Deployment / Security

- **Containerization**: Dockerfile + docker-compose for local dev (separate services: backend, scraper, mongo, frontend). `deploy/deploy.sh` exists — thêm GH Actions CI/CD.
- **HTTPS & cert automation**: docs and scripts exist for certbot; ensure renew monitoring and alerts.
- **Health checks & metrics**: add `/health` endpoints and Prometheus metrics for scraper and backend.
- **Secrets & config**: move sensitive config to env / secret manager; document `.env.example` for each service.

## Frontend (UX / reliability)

- **Authentication UX**: show login modals, redirect after action; handle 401 across fetch calls centrally.
- **Error boundaries & retry UI**: graceful messages when API fails; allow retry actions on client.
- **Accessibility & responsive polishing**: ensure mobile layouts and a11y basics.
- **Unit / E2E tests**: add testing (Jest + RTL for React, Cypress for flows).

## Prioritization & Quick wins

- Quick wins (days): add API docs, standardize pagination, add index on common query fields, add `.env.example`, improve `scrape_upload` input validation.
- Mid-term (weeks): saved searches + alerts, scheduled crawl UI, robust retry/backoff and monitoring, containerize services.
- Long-term (months): full-text search infra (Elasticsearch / Meilisearch), PWA, multi-tenant support, headless-browser scraping.

## Next steps (gợi ý hành động)

1. Thực hiện checklist quick wins, lên PR từng thay đổi nhỏ.
2. Thiết kế API contract cho saved searches / alerts và triển khai backend + UI.
3. Containerize và tạo pipeline CI (build, tests, deploy staging).
4. Thiết lập monitoring + alert (Prometheus/Grafana hoặc log-based alert).

---

Tôi đã dựa trên các file chính: `server/crawlweb` (Django API), `server/scraper` (FastAPI scraper), `client/app` (React), `deploy/` và `docs/`. Nếu bạn muốn, tôi có thể: (1) chia nhỏ ra các issue/PR đề xuất, (2) tạo mẫu `docker-compose.yml`, hoặc (3) mở PR với một quick-win (ví dụ: thêm API docs hoặc `.env.example`).
