# 🚀 Hướng dẫn Deploy CrawlWeb lên AWS EC2 (Production)

## Mục lục

1. [Tổng quan kiến trúc](#1-tổng-quan-kiến-trúc)
2. [Chuẩn bị EC2 Instance](#2-chuẩn-bị-ec2-instance)
3. [Cấu hình Security Group](#3-cấu-hình-security-group)
4. [SSH vào Server](#4-ssh-vào-server)
5. [Chạy script Deploy](#5-chạy-script-deploy)
6. [Cấu hình .env chi tiết](#6-cấu-hình-env-chi-tiết)
7. [Kiểm tra Services](#7-kiểm-tra-services)
8. [Cấu hình MongoDB](#8-cấu-hình-mongodb)
9. [Frontend - Xử lý API URL](#9-frontend---xử-lý-api-url)
10. [Lệnh debug thường dùng](#10-lệnh-debug-thường-dùng)
11. [Update code khi có commit mới](#11-update-code-khi-có-commit-mới)
12. [Rollback về commit cũ](#12-rollback-về-commit-cũ)
13. [Các lỗi thường gặp](#13-các-lỗi-thường-gặp)
14. [Bật HTTPS (tương lai)](#14-bật-https-tương-lai)

---

## 1. Tổng quan kiến trúc

```
┌─────────────────────────────────────────────────────────────┐
│                    AWS EC2 (Ubuntu 22.04/24.04)              │
│                                                              │
│   ┌─────────┐     ┌──────────────────┐     ┌────────────┐  │
│   │  Client  │────▶│   Nginx (:80)    │────▶│ React SPA  │  │
│   │ Browser  │     │  Reverse Proxy   │     │ (static)   │  │
│   └─────────┘     └───────┬──────────┘     └────────────┘  │
│                           │                                  │
│                     /api/ │ /admin/                          │
│                           ▼                                  │
│              ┌────────────────────┐                          │
│              │ Gunicorn (:8000)   │ ◀── Django Backend       │
│              │ 3 workers          │                          │
│              └────────┬───────────┘                          │
│                       │                                      │
│              ┌────────▼───────────┐     ┌─────────────────┐  │
│              │  MongoDB (:27017)  │     │ Uvicorn (:37001)│  │
│              │  Database          │     │ Scraper Service  │  │
│              └────────────────────┘     └─────────────────┘  │
│                                                              │
│   ┌──────────────────────────────────────────────────────┐  │
│   │                 Systemd Services                      │  │
│   │  • crawlweb-backend.service  (Django + Gunicorn)      │  │
│   │  • crawlweb-scraper.service  (FastAPI + Uvicorn)      │  │
│   │  • mongod.service            (MongoDB 8.0)            │  │
│   │  • nginx.service             (Reverse Proxy)          │  │
│   └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Các thành phần:

| Service | Framework | Port | Chạy bởi |
|---------|-----------|------|----------|
| **Backend** | Django 6.0.1 + DRF | 8000 (internal) | Gunicorn + systemd |
| **Frontend** | React 19 (CRA) | 80 (via Nginx) | Static build |
| **Scraper** | FastAPI + Uvicorn | 37001 (internal) | systemd |
| **Database** | MongoDB 8.0 | 27017 (internal) | mongod |
| **Proxy** | Nginx | 80 (public) | nginx |

### Lưu lượng request:

```
Browser → Nginx:80
  ├── /api/*      → proxy_pass → Gunicorn:8000 (Django)
  ├── /admin/*    → proxy_pass → Gunicorn:8000 (Django Admin)
  ├── /static/*   → serve file từ staticfiles/
  ├── /media/*    → serve file từ media/
  └── /*          → serve React build/index.html (SPA)

Django:8000 → Scraper:37001 (gửi lệnh crawl)
Scraper:37001 → Django:8000 (callback kết quả)
Django:8000 → MongoDB:27017 (lưu trữ dữ liệu)
```

---

## 2. Chuẩn bị EC2 Instance

### 2.1. Chọn AMI

- **Ubuntu 22.04 LTS** hoặc **Ubuntu 24.04 LTS** (recommended)
- Architecture: x86_64 (amd64)

### 2.2. Chọn Instance Type

| Instance | vCPU | RAM | Phù hợp |
|----------|------|-----|---------|
| **t3.small** | 2 | 2GB | Tối thiểu cho production nhẹ |
| **t3.medium** | 2 | 4GB | **Recommended** - đủ cho cả 3 services |
| t3.large | 2 | 8GB | Nếu traffic cao |

### 2.3. Storage

- **20 GB gp3** là đủ cho project + MongoDB + logs
- Nếu dự kiến nhiều dữ liệu crawl, chọn 30-50 GB

### 2.4. Key Pair

- Tạo hoặc chọn SSH key pair **trước khi** launch instance
- Lưu file `.pem` vào máy local, chạy:
  ```bash
  chmod 400 your-key.pem
  ```

---

## 3. Cấu hình Security Group

Tạo Security Group với các rules sau:

### Inbound Rules:

| Type | Protocol | Port | Source | Mô tả |
|------|----------|------|--------|-------|
| SSH | TCP | 22 | `YOUR_IP/32` hoặc `0.0.0.0/0` | SSH access |
| HTTP | TCP | 80 | `0.0.0.0/0` | Web traffic |
| HTTPS | TCP | 443 | `0.0.0.0/0` | SSL (tương lai) |

### Outbound Rules:

| Type | Protocol | Port | Destination |
|------|----------|------|-------------|
| All traffic | All | All | `0.0.0.0/0` |

> ⚠️ **KHÔNG** mở port 8000, 37001, 27017 ra ngoài. Các service này chỉ listen trên `127.0.0.1`.

### Tạo Security Group trên AWS Console:

1. Vào **EC2** → **Security Groups** → **Create security group**
2. Tên: `crawlweb-sg`
3. VPC: Chọn VPC của bạn
4. Thêm Inbound/Outbound rules như trên
5. Nhấn **Create security group**

---

## 4. SSH vào Server

### 4.1. Kết nối SSH

```bash
# Thay YOUR_KEY.pem và YOUR_EC2_IP cho đúng
ssh -i ~/your-key.pem ubuntu@YOUR_EC2_IP
```

> Ghi chú: User mặc định trên Ubuntu AMI là `ubuntu` (không phải `root`).

### 4.2. Cập nhật hệ thống (optional, script sẽ tự làm)

```bash
sudo apt update && sudo apt upgrade -y
```

---

## 5. Chạy script Deploy

### 5.1. Clone repository

```bash
# Clone project
git clone https://github.com/chibaongunguoi/crawlweb_django.git
cd crawlweb_django
```

### 5.2. Chạy deploy script

```bash
# Cấp quyền thực thi
chmod +x deploy/deploy.sh deploy/update.sh

# Chạy deploy (cần root)
sudo ./deploy/deploy.sh
```

> Script sẽ tự động:
> 1. Cài system packages (Python, Node.js, Nginx, MongoDB)
> 2. Clone project vào `/opt/crawlweb`
> 3. Tạo `.env` từ `.env.example` (tự sinh SECRET_KEY)
> 4. Cài Python dependencies (backend + scraper)
> 5. Build React frontend
> 6. Cấu hình systemd services
> 7. Cấu hình Nginx reverse proxy
> 8. Mở firewall ports
> 9. Start tất cả services

### 5.3. Thời gian chạy

Script có thể mất **10-20 phút** tùy tốc độ mạng, bao gồm:
- Cài MongoDB: ~3 phút
- Cài Node.js + npm install + build: ~5-8 phút
- Cài Python packages: ~3-5 phút
- Phần còn lại: ~2-3 phút

---

## 6. Cấu hình .env chi tiết

Sau khi chạy script, file `.env` sẽ được tạo tại `/opt/crawlweb/.env`. Kiểm tra và chỉnh sửa:

```bash
sudo nano /opt/crawlweb/.env
```

### Các biến quan trọng:

```bash
# Django - PHẢI đổi SECRET_KEY nếu chưa auto-generate
DJANGO_SECRET_KEY=your-random-secret-key-here
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,YOUR_EC2_PUBLIC_IP

# MongoDB - URL kết nối
MONGO_URI=mongodb://localhost:27017/pbl4_db
MONGO_DB_NAME=pbl4_db

# Scraper - địa chỉ scraper service
SCRAPER_HOST=127.0.0.1
SCRAPER_PORT=37001

# Callback URL - Django dùng để scraper gọi ngược lại
SCRAPER_CALLBACK_BASE_URL=http://127.0.0.1:8000

# CORS - danh sách origin được phép gọi API
CORS_ALLOWED_ORIGINS=http://YOUR_EC2_PUBLIC_IP,http://localhost:3000
```

> ⚠️ Thay `YOUR_EC2_PUBLIC_IP` bằng IP thực của EC2 instance (ví dụ: `54.123.45.67`).

### Lấy IP public của EC2:

```bash
# Chạy trên EC2:
curl http://checkip.amazonaws.com
```

---

## 7. Kiểm tra Services

### 7.1. Kiểm tra trạng thái services

```bash
# Backend (Django + Gunicorn)
sudo systemctl status crawlweb-backend

# Scraper (FastAPI + Uvicorn)
sudo systemctl status crawlweb-scraper

# MongoDB
sudo systemctl status mongod

# Nginx
sudo systemctl status nginx
```

### 7.2. Kiểm tra kết nối

```bash
# Frontend (qua Nginx)
curl -I http://localhost

# Backend API
curl http://localhost/api/jobs/search/

# Django Admin
curl -I http://localhost/admin/

# Scraper (internal)
curl http://127.0.0.1:37001/docs

# MongoDB
mongosh --eval "db.runCommand({ping:1})"
```

### 7.3. Kiểm tra từ browser

Mở trình duyệt, truy cập:

```
http://YOUR_EC2_PUBLIC_IP
```

Bạn sẽ thấy trang chủ của CrawlWeb.

---

## 8. Cấu hình MongoDB

### 8.1. MongoDB đã được cài tự động bởi script

MongoDB 8.0 sẽ chạy trên port `27017` (localhost only).

### 8.2. Tạo database và user (nếu cần)

```bash
# Kết nối MongoDB shell
mongosh

# Switch to database
use pbl4_db

# Kiểm tra collections
show collections

# Đếm số documents trong JobDetail
db.api_jobdetail.countDocuments()

# Tạo user cho database (recommended cho production)
db.createUser({
  user: "crawlweb",
  pwd: "your_mongo_password",
  roles: [{ role: "readWrite", db: "pbl4_db" }]
})

# Thoát
exit
```

Nếu tạo user, cập nhật `MONGO_URI` trong `.env`:
```bash
MONGO_URI=mongodb://crawlweb:your_mongo_password@localhost:27017/pbl4_db?authSource=pbl4_db
```

Sau đó restart backend:
```bash
sudo systemctl restart crawlweb-backend
```

### 8.3. Backup MongoDB

```bash
# Backup
mongodump --db=pbl4_db --out=/opt/crawlweb/backups/$(date +%Y%m%d_%H%M%S)

# Restore
mongorestore --db=pbl4_db /path/to/backup/pbl4_db
```

### 8.4. Load dữ liệu mẫu (nếu database trống)

```bash
cd /opt/crawlweb/server
source myworld/bin/activate
python manage.py shell < load_test_data.py
deactivate
```

---

## 9. Frontend - Xử lý API URL

### Vấn đề

Frontend React hiện tại hardcode `http://localhost:8000` trong các file `.jsx`. Khi deploy production, cần đảm bảo:

### Giải pháp hiện tại (Nginx Proxy)

Script deploy đã cấu hình Nginx proxy `/api/*` → `127.0.0.1:8000`. Các file React dùng relative URL (`/api/...`) sẽ hoạt động đúng qua Nginx.

**Tuy nhiên**, nhiều file frontend đang hardcode `http://localhost:8000`. Cần thay đổi các file này trước khi build:

```bash
# Chạy trên EC2 sau khi clone, trước khi npm run build
cd /opt/crawlweb/client/app/src

# Thay thế tất cả http://localhost:8000 thành relative path
find . -name "*.jsx" -exec sed -i 's|http://localhost:8000||g' {} +

# Sau đó build
cd /opt/crawlweb/client/app
npm run build
```

> **Lưu ý**: Script `deploy.sh` cần được cập nhật để chạy bước này. Hoặc bạn có thể commit thay đổi vào source code (recommended).

### Giải pháp dài hạn (Recommended)

Tạo file `client/app/src/config.js`:

```javascript
const API_BASE_URL = process.env.REACT_APP_API_URL || '';
export default API_BASE_URL;
```

Sau đó thay tất cả `http://localhost:8000` thành `API_BASE_URL` trong các file `.jsx`.

---

## 10. Lệnh debug thường dùng

### 10.1. Xem logs

```bash
# Backend logs (Gunicorn access log)
sudo tail -f /var/log/crawlweb-backend-access.log

# Backend error log
sudo tail -f /var/log/crawlweb-backend-error.log

# Scraper logs (qua journalctl)
sudo journalctl -u crawlweb-scraper -f --no-pager

# Backend logs (qua journalctl)
sudo journalctl -u crawlweb-backend -f --no-pager

# Nginx access log
sudo tail -f /var/log/nginx/access.log

# Nginx error log
sudo tail -f /var/log/nginx/error.log

# MongoDB log
sudo tail -f /var/log/mongodb/mongod.log
```

### 10.2. Restart services

```bash
# Restart backend
sudo systemctl restart crawlweb-backend

# Restart scraper
sudo systemctl restart crawlweb-scraper

# Restart MongoDB
sudo systemctl restart mongod

# Reload Nginx (không downtime)
sudo systemctl reload nginx

# Restart Nginx (có downtime ngắn)
sudo systemctl restart nginx

# Restart tất cả
sudo systemctl restart crawlweb-backend crawlweb-scraper nginx mongod
```

### 10.3. Kiểm tra port đang lắng nghe

```bash
# Xem tất cả ports
sudo ss -tlnp

# Kiểm tra port cụ thể
sudo ss -tlnp | grep :80     # Nginx
sudo ss -tlnp | grep :8000   # Django
sudo ss -tlnp | grep :37001  # Scraper
sudo ss -tlnp | grep :27017  # MongoDB
```

### 10.4. Kiểm tra process

```bash
# Xem processes của backend
ps aux | grep gunicorn

# Xem processes của scraper
ps aux | grep uvicorn

# Xem memory usage
free -h

# Xem disk usage
df -h

# Xem CPU/Memory theo process
top -o %MEM
```

### 10.5. Chạy Django management commands

```bash
cd /opt/crawlweb/server
source myworld/bin/activate

# Django shell
python manage.py shell

# Check database connection
python manage.py dbshell

# Tạo superuser (admin)
python manage.py createsuperuser

# Collectstatic lại
python manage.py collectstatic --noinput

deactivate
```

### 10.6. Kiểm tra Nginx config

```bash
# Test config syntax
sudo nginx -t

# Xem config đang dùng
sudo nginx -T

# Reload config
sudo systemctl reload nginx
```

---

## 11. Update code khi có commit mới

### Cách nhanh (dùng script):

```bash
sudo ./deploy/update.sh
```

### Cách thủ công:

```bash
cd /opt/crawlweb

# Pull code mới
git pull origin main

# Backend
cd server
source myworld/bin/activate
pip install -r requirements.txt
python manage.py collectstatic --noinput
deactivate

# Scraper
cd scraper
source venv/bin/activate
pip install -r requirements.txt
deactivate

# Frontend
cd ../../client/app
npm install
# Thay thế localhost URLs nếu cần
find src -name "*.jsx" -exec sed -i 's|http://localhost:8000||g' {} +
npm run build

# Restart services
sudo systemctl restart crawlweb-backend
sudo systemctl restart crawlweb-scraper
sudo systemctl reload nginx
```

### Nếu có thay đổi .env:

```bash
sudo nano /opt/crawlweb/.env
# Chỉnh sửa xong, restart backend
sudo systemctl restart crawlweb-backend
```

### Nếu có thay đổi MongoDB schema (migration):

```bash
cd /opt/crawlweb/server
source myworld/bin/activate
# django_mongodb_backend không dùng migration như SQL
# Nếu cần migrate:
python manage.py migrate
deactivate
sudo systemctl restart crawlweb-backend
```

---

## 12. Rollback về commit cũ

### Cách nhanh (dùng script):

```bash
# Xem commit trước đó
cat /tmp/crawlweb_last_commit

# Rollback
sudo ./deploy/update.sh abc123def456
```

### Cách thủ công:

```bash
cd /opt/crawlweb

# Xem lịch sử git
git log --oneline -10

# Rollback về commit cụ thể
git checkout abc123def456

# Rebuild backend
cd server
source myworld/bin/activate
pip install -r requirements.txt
deactivate

# Rebuild scraper
cd scraper
source venv/bin/activate
pip install -r requirements.txt
deactivate

# Rebuild frontend
cd ../../client/app
npm install
npm run build

# Restart
sudo systemctl restart crawlweb-backend
sudo systemctl restart crawlweb-scraper
sudo systemctl reload nginx

# Quay về branch chính khi đã sẵn sàng
cd /opt/crawlweb
git checkout main
```

---

## 13. Các lỗi thường gặp

### 13.1. Frontend trắng (blank page)

**Nguyên nhân**: API calls trả về lỗi CORS hoặc kết nối sai.

**Cách sửa**:
```bash
# 1. Kiểm tra backend đang chạy
sudo systemctl status crawlweb-backend

# 2. Kiểm tra API trực tiếp
curl -v http://localhost:8000/api/jobs/search/

# 3. Kiểm tra Nginx proxy
curl -v http://localhost/api/jobs/search/

# 4. Kiểm tra CORS_ALLOWED_ORIGINS trong .env
cat /opt/crawlweb/.env | grep CORS

# 5. Kiểm tra browser console (F12) để xem lỗi cụ thể
```

### 13.2. Gunicorn không start được

**Nguyên nhân**: Module import error hoặc port đã bị chiếm.

**Cách sửa**:
```bash
# Xem chi tiết lỗi
sudo journalctl -u crawlweb-backend -n 50 --no-pager

# Kiểm tra port 8000 có bị chiếm không
sudo ss -tlnp | grep :8000

# Kill process đang chiếm port (nếu có)
sudo fuser -k 8000/tcp

# Restart
sudo systemctl restart crawlweb-backend
```

### 13.3. MongoDB không kết nối được

**Cách sửa**:
```bash
# Kiểm tra MongoDB status
sudo systemctl status mongod

# Restart MongoDB
sudo systemctl restart mongod

# Kiểm tra MongoDB port
sudo ss -tlnp | grep 27017

# Kiểm tra MongoDB log
sudo tail -20 /var/log/mongodb/mongod.log

# Test kết nối
mongosh --eval "db.runCommand({ping:1})"
```

### 13.4. Scraper không hoạt động

**Cách sửa**:
```bash
# Xem scraper logs
sudo journalctl -u crawlweb-scraper -n 50 --no-pager

# Kiểm tra port 37001
sudo ss -tlnp | grep :37001

# Test scraper trực tiếp
curl http://127.0.0.1:37001/docs

# Restart scraper
sudo systemctl restart crawlweb-scraper
```

### 13.5. Nginx 502 Bad Gateway

**Nguyên nhân**: Backend (Gunicorn) không chạy hoặc crashed.

**Cách sửa**:
```bash
# Kiểm tra backend
sudo systemctl status crawlweb-backend

# Xem error log
sudo journalctl -u crawlweb-backend -n 30

# Restart backend
sudo systemctl restart crawlweb-backend

# Kiểm tra Nginx error log
sudo tail -20 /var/log/nginx/error.log
```

### 13.6. Permission denied

**Cách sửa**:
```bash
# Cấp quyền đúng cho project directory
sudo chown -R root:root /opt/crawlweb
sudo chmod -R 755 /opt/crawlweb

# Nếu cần write vào media folder
sudo chmod -R 777 /opt/crawlweb/server/media
```

### 13.7. Out of memory (OOM)

**Nguyên nhân**: Instance quá nhỏ cho cả 3 services.

**Cách sửa**:
```bash
# Kiểm tra memory
free -h

# Giảm Gunicorn workers (trong service file)
sudo nano /etc/systemd/system/crawlweb-backend.service
# Đổi --workers 3 thành --workers 2

# Giảm SCRAPE_CONCURRENCY trong .env
sudo nano /opt/crawlweb/.env
# SCRAPE_CONCURRENCY=1

# Restart
sudo systemctl daemon-reload
sudo systemctl restart crawlweb-backend crawlweb-scraper
```

### 13.8. npm build lỗi

**Cách sửa**:
```bash
cd /opt/crawlweb/client/app

# Xóa node_modules và build cache
rm -rf node_modules build

# Reinstall
npm install

# Build lại
npm run build

# Nếu lỗi "JavaScript heap out of memory"
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

### 13.9. Django SECRET_KEY không hợp lệ

**Cách sửa**:
```bash
# Tạo secret key mới
python3 -c "import secrets; print(secrets.token_urlsafe(50))"

# Cập nhật vào .env
sudo nano /opt/crawlweb/.env
# DJANGO_SECRET_KEY=<key_mới>

# Restart
sudo systemctl restart crawlweb-backend
```

### 13.10. Disk đầy

```bash
# Kiểm tra disk usage
df -h

# Xóa logs cũ
sudo find /var/log -name "*.gz" -delete
sudo truncate -s 0 /var/log/crawlweb-backend-access.log

# Xóa npm cache
npm cache clean --force

# Xóa pip cache
pip cache purge

# Xóa old kernels
sudo apt autoremove -y
```

---

## 14. Bật HTTPS (tương lai)

Khi sẵn sàng bật HTTPS:

```bash
# 1. Cần có domain name trỏ về EC2 IP (A record)

# 2. Cập nhật server_name trong Nginx
sudo nano /etc/nginx/sites-available/crawlweb
# server_name your-domain.com www.your-domain.com;

# 3. Chạy Certbot
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# 4. Certbot sẽ tự động:
#    - Cài SSL certificate
#    - Cập nhật Nginx config
#    - Tạo cron job auto-renew

# 5. Kiểm tra auto-renew
sudo certbot renew --dry-run

# 6. Cập nhật .env
sudo nano /opt/crawlweb/.env
# DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,your-domain.com,www.your-domain.com
# CORS_ALLOWED_ORIGINS=https://your-domain.com,http://localhost:3000

# 7. Restart
sudo systemctl restart crawlweb-backend
sudo systemctl reload nginx
```

---

## Bảng tóm tắt nhanh

| Mục | Lệnh |
|-----|-------|
| Deploy lần đầu | `sudo ./deploy/deploy.sh` |
| Update code | `sudo ./deploy/update.sh` |
| Xem backend log | `journalctl -u crawlweb-backend -f` |
| Xem scraper log | `journalctl -u crawlweb-scraper -f` |
| Restart backend | `systemctl restart crawlweb-backend` |
| Restart scraper | `systemctl restart crawlweb-scraper` |
| Reload nginx | `systemctl reload nginx` |
| Kiểm tra ports | `ss -tlnp` |
| Test API | `curl http://localhost/api/jobs/search/` |
| Edit .env | `nano /opt/crawlweb/.env` |
| Django shell | `cd /opt/crawlweb/server && source myworld/bin/activate && python manage.py shell` |
| MongoDB shell | `mongosh` |
| Kiểm tra disk | `df -h` |
| Kiểm tra RAM | `free -h` |
| Rollback | `sudo ./deploy/update.sh <commit_hash>` |

---

## Cấu trúc thư mục trên server

```
/opt/crawlweb/                          # Project root
├── .env                                # Environment variables
├── deploy/
│   ├── deploy.sh                       # Script deploy lần đầu
│   └── update.sh                       # Script update/rollback
├── client/
│   └── app/
│       └── build/                      # React production build (static)
├── server/
│   ├── myworld/                        # Python venv cho backend
│   ├── requirements.txt
│   ├── manage.py
│   ├── load_test_data.py
│   ├── staticfiles/                    # Django collected static files
│   ├── media/                          # User uploads (CV files)
│   ├── crawlweb/
│   │   ├── settings.py
│   │   ├── wsgi.py
│   │   └── urls.py
│   ├── api/
│   │   ├── models.py
│   │   ├── views.py
│   │   └── ...
│   └── scraper/
│       ├── venv/                       # Python venv cho scraper
│       ├── requirements.txt
│       └── src/
│           └── main.py                 # Scraper entry point
└── database/
    └── seed/                           # Seed data files

/etc/systemd/system/
├── crawlweb-backend.service            # Django backend service
└── crawlweb-scraper.service            # Scraper service

/etc/nginx/sites-available/
└── crawlweb                            # Nginx config

/var/log/
├── crawlweb-backend-access.log         # Backend access log
├── crawlweb-backend-error.log          # Backend error log
└── nginx/
    ├── access.log
    └── error.log