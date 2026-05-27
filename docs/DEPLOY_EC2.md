# 🚀 Hướng dẫn Deploy CrawlWeb lên AWS EC2 (Production)

## Mục lục

1. [Tổng quan kiến trúc](#1-tổng-quan-kiến-trúc)
2. [Chuẩn bị EC2 Instance](#2-chuẩn-bị-ec2-instance)
3. [Cấu hình Security Group](#3-cấu-hình-security-group)
4. [SSH vào Server](#4-ssh-vào-server)
5. [Chạy script Deploy](#5-chạy-script-deploy)
6. [Kiểm tra Services](#6-kiểm-tra-services)
7. [Cấu hình MongoDB](#7-cấu-hình-mongodb)
8. [Frontend - Xử lý API URL](#8-frontend---xử-lý-api-url)
9. [Lệnh debug thường dùng](#9-lệnh-debug-thường-dùng)
10. [Update code khi có commit mới](#10-update-code-khi-có-commit-mới)
11. [Rollback về commit cũ](#11-rollback-về-commit-cũ)
12. [Các lỗi thường gặp](#12-các-lỗi-thường-gặp)
13. [Bật HTTPS (tương lai)](#13-bật-https-tương-lai)

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

### Domain:

- **Production domain**: `itjobs.ddns.net` (No-IP Dynamic DNS)
- **Trỏ về EC2 IP**: Update DNS record trên No-IP khi IP thay đổi

### Lưu lượng request:

```
Browser → Nginx:80 (itjobs.ddns.net)
  ├── /api/*      → proxy_pass → Gunicorn:8000 (Django)
  ├── /admin/*    → proxy_pass → Gunicorn:8000 (Django Admin)
  ├── /static/*   → serve React build/static/
  ├── /backend-static/* → serve Django staticfiles/ (nếu cần)
  ├── /media/*    → serve file từ media/
  └── /*          → serve React build/index.html (SPA)

Django:8000 → Scraper:37001 (gửi lệnh crawl)
Scraper:37001 → Django:8000 (callback kết quả)
Django:8000 → MongoDB:27017 (lưu trữ dữ liệu)
```

### Cấu hình production:

Project không sử dụng file `.env`. Tất cả cấu hình được hardcode trong `server/crawlweb/crawlweb/settings.py`. Script deploy sẽ tự động sửa `settings.py` cho production:

- `DEBUG = False`
- `ALLOWED_HOSTS = ['itjobs.ddns.net', 'localhost', '127.0.0.1']`
- `SECRET_KEY` được sinh ngẫu nhiên
- `CORS_ALLOWED_ORIGINS` cập nhật domain
- `STATIC_ROOT` thêm vào cho collectstatic

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

### 2.5. Cấu hình Dynamic DNS (No-IP)

Domain `itjobs.ddns.net` trỏ về EC2 IP. Cần đảm bảo:

1. Đăng ký tài khoản No-IP: https://www.noip.com/
2. Tạo hostname `itjobs.ddns.net` trỏ về **Elastic IP** của EC2
3. **Quan trọng**: Gắn **Elastic IP** cho EC2 để IP không thay đổi khi restart
4. Cài No-IP dynamic DNS client trên EC2 (nếu dùng IP động):
   ```bash
   sudo apt install -y noip2
   # Hoặc dùng crontab cập nhật IP định kỳ
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

---

## 4. SSH vào Server

### 4.1. Kết nối SSH

```bash
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
git clone https://github.com/chibaongunguoi/crawlweb_django.git
cd crawlweb_django
```

### 5.2. Chạy deploy script

```bash
chmod +x deploy/deploy.sh deploy/update.sh
sudo ./deploy/deploy.sh
```

### Script sẽ tự động thực hiện:

| Bước | Mô tả |
|------|-------|
| 1 | Cài system packages (Python, Node.js, Nginx, MongoDB) |
| 2 | Cài MongoDB 8.0 |
| 3 | Cài Node.js 20 LTS |
| 4 | Clone/update project vào `/opt/crawlweb` |
| 5 | **Patch `settings.py` cho production** (DEBUG=False, ALLOWED_HOSTS, SECRET_KEY, CORS) |
| 6 | Tạo Python venv, cài dependencies, collectstatic |
| 7 | Build React frontend (`npm run build`) |
| 8 | Cấu hình systemd services + Nginx + firewall |

### 5.3. Thời gian chạy

Script có thể mất **10-20 phút** tùy tốc độ mạng, bao gồm:
- Cài MongoDB: ~3 phút
- Cài Node.js + npm install + build: ~5-8 phút
- Cài Python packages: ~3-5 phút
- Phần còn lại: ~2-3 phút

### 5.4. Sau khi deploy thành công

Truy cập: **http://itjobs.ddns.net**

---

## 6. Kiểm tra Services

### 6.1. Kiểm tra trạng thái services

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

### 6.2. Kiểm tra kết nối

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

### 6.3. Kiểm tra từ browser

Mở trình duyệt, truy cập:

```
http://itjobs.ddns.net
```

Bạn sẽ thấy trang chủ của CrawlWeb.

---

## 7. Cấu hình MongoDB

### 7.1. MongoDB đã được cài tự động bởi script

MongoDB 8.0 sẽ chạy trên port `27017` (localhost only).

### 7.2. Tạo database user (recommended cho production)

```bash
mongosh

use pbl4_db

# Xem collections
show collections

# Đếm documents
db.api_jobdetail.countDocuments()

# Tạo user (optional nhưng recommended)
db.createUser({
  user: "crawlweb",
  pwd: "your_mongo_password",
  roles: [{ role: "readWrite", db: "pbl4_db" }]
})

exit
```

Nếu tạo user, cần sửa `settings.py`:
```bash
sudo nano /opt/crawlweb/server/crawlweb/crawlweb/settings.py
```
Cập nhật `HOST`:
```python
DATABASES = {
    "default": {
        "ENGINE": "django_mongodb_backend",
        "HOST": "mongodb://crawlweb:your_mongo_password@localhost:27017/pbl4_db?authSource=pbl4_db",
        "NAME": "pbl4_db",
    },
}
```

Sau đó restart backend:
```bash
sudo systemctl restart crawlweb-backend
```

### 7.3. Backup MongoDB

```bash
# Backup
mongodump --db=pbl4_db --out=/opt/crawlweb/backups/$(date +%Y%m%d_%H%M%S)

# Restore
mongorestore --db=pbl4_db /path/to/backup/pbl4_db
```

### 7.4. Load dữ liệu mẫu (nếu database trống)

```bash
cd /opt/crawlweb/server/crawlweb
source ../myworld/bin/activate
python manage.py shell < load_test_data.py
deactivate
```

---

## 8. Frontend - Xử lý API URL

### Vấn đề

Một số file frontend có thể hardcode `http://localhost:8000`. Script deploy đã cấu hình Nginx proxy `/api/*` → `127.0.0.1:8000`.

### Nếu có lỗi CORS hoặc API không kết nối

```bash
# Thay thế localhost URLs thành relative path trước khi build
cd /opt/crawlweb/client/app/src
find . -name "*.jsx" -exec sed -i 's|http://localhost:8000||g' {} +

# Rebuild
cd /opt/crawlweb/client/app
npm run build

# Restart Nginx
sudo systemctl restart nginx
```

### Giải pháp dài hạn (Recommended)

Tạo file `client/app/src/config.js`:

```javascript
const API_BASE_URL = process.env.REACT_APP_API_URL || '';
export default API_BASE_URL;
```

Sau đó thay tất cả `http://localhost:8000` thành `API_BASE_URL` trong các file `.jsx`.

---

## 9. Lệnh debug thường dùng

### 9.1. Xem logs

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

### 9.2. Restart services

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

### 9.3. Kiểm tra port đang lắng nghe

```bash
# Xem tất cả ports
sudo ss -tlnp

# Kiểm tra port cụ thể
sudo ss -tlnp | grep :80     # Nginx
sudo ss -tlnp | grep :8000   # Django
sudo ss -tlnp | grep :37001  # Scraper
sudo ss -tlnp | grep :27017  # MongoDB
```

### 9.4. Kiểm tra process

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

### 9.5. Chạy Django management commands

```bash
cd /opt/crawlweb/server/crawlweb
source ../myworld/bin/activate

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

### 9.6. Kiểm tra Nginx config

```bash
# Test config syntax
sudo nginx -t

# Xem config đang dùng
sudo nginx -T

# Reload config
sudo systemctl reload nginx
```

### 9.7. Xem file settings.py hiện tại

```bash
cat /opt/crawlweb/server/crawlweb/crawlweb/settings.py
```

---

## 10. Update code khi có commit mới

### Cách nhanh (dùng script):

```bash
sudo ./deploy/update.sh
```

### Cách thủ công:

```bash
cd /opt/crawlweb

# Pull code mới
git pull origin linux

# Backend
cd /opt/crawlweb/server
source myworld/bin/activate
pip install -r requirements.txt
deactivate

# Backend - Django commands (manage.py ở trong server/crawlweb/)
cd /opt/crawlweb/server/crawlweb
source ../myworld/bin/activate
python manage.py collectstatic --noinput
deactivate

# Scraper
cd /opt/crawlweb/server/scraper
source venv/bin/activate
pip install -r requirements.txt
deactivate

# Frontend
cd /opt/crawlweb/client/app
npm install
# Thay thế localhost URLs nếu cần
find src -name "*.jsx" -exec sed -i 's|http://localhost:8000||g' {} +
npm run build

# Restart services
sudo systemctl restart crawlweb-backend
sudo systemctl restart crawlweb-scraper
sudo systemctl reload nginx
```

### Nếu có thay đổi MongoDB schema (migration):

```bash
cd /opt/crawlweb/server/crawlweb
source ../myworld/bin/activate
# django_mongodb_backend không dùng migration như SQL
# Nếu cần migrate:
python manage.py migrate
deactivate
sudo systemctl restart crawlweb-backend
```

---

## 11. Rollback về commit cũ

### Cách nhanh (dùng script):

```bash
# Xem commit trước đó
cat /tmp/crawlweb_last_commit

# Rollback về commit đó
cd /opt/crawlweb
git checkout $(cat /tmp/crawlweb_last_commit)

# Rebuild
cd /opt/crawlweb/server && source myworld/bin/activate && pip install -r requirements.txt && deactivate
cd /opt/crawlweb/server/scraper && source venv/bin/activate && pip install -r requirements.txt && deactivate
cd /opt/crawlweb/client/app && npm install && npm run build

# Restart
sudo systemctl restart crawlweb-backend crawlweb-scraper nginx

# Quay về linux khi đã sẵn sàng
cd /opt/crawlweb && git checkout linux
```

### Cách thủ công:

```bash
cd /opt/crawlweb

# Xem lịch sử git
git log --oneline -10

# Rollback về commit cụ thể
git checkout abc123def456

# Rebuild backend
cd /opt/crawlweb/server
source myworld/bin/activate
pip install -r requirements.txt
deactivate

# Rebuild scraper
cd /opt/crawlweb/server/scraper
source venv/bin/activate
pip install -r requirements.txt
deactivate

# Rebuild frontend
cd /opt/crawlweb/client/app
npm install
npm run build

# Restart
sudo systemctl restart crawlweb-backend
sudo systemctl restart crawlweb-scraper
sudo systemctl reload nginx

# Quay về branch linux khi đã sẵn sàng
cd /opt/crawlweb
git checkout linux
```

---

## 12. Các lỗi thường gặp

### 12.1. Frontend trắng (blank page)

**Nguyên nhân**: API calls trả về lỗi CORS hoặc kết nối sai.

**Cách sửa**:
```bash
# 1. Kiểm tra backend đang chạy
sudo systemctl status crawlweb-backend

# 2. Kiểm tra API trực tiếp
curl -v http://localhost:8000/api/jobs/search/

# 3. Kiểm tra Nginx proxy
curl -v http://localhost/api/jobs/search/

# 4. Kiểm tra CORS trong settings.py
grep CORS /opt/crawlweb/server/crawlweb/crawlweb/settings.py

# 5. Kiểm tra browser console (F12) để xem lỗi cụ thể
```

### 12.2. Gunicorn không start được

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

### 12.3. MongoDB không kết nối được

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

### 12.4. Lỗi cài MongoDB trên Ubuntu 24.04: "Unable to locate package mongodb-org"

**Nguyên nhân**: MongoDB 8.0 chưa có package cho Ubuntu 24.04 (`noble`). Script deploy đã tự sửa lỗi này bằng cách dùng `jammy` (Ubuntu 22.04) làm repo codename.

**Nếu chạy script cũ hoặc cài thủ công bị lỗi**:
```bash
# Xóa source list cũ bị lỗi
sudo rm -f /etc/apt/sources.list.d/mongodb-org-*.list

# Thêm lại với codename "jammy" (không phải "noble")
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/8.0 multiverse" | \
    sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list

# Nếu có lỗi "multimedya" từ source cũ
sudo rm -f /etc/apt/sources.list.d/<file-with-typo>.list

# Update và cài lại
sudo apt update
sudo apt install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod
```

### 12.5. Scraper không hoạt động

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

### 12.5. Nginx 502 Bad Gateway

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

### 12.6. Permission denied

**Cách sửa**:
```bash
# Cấp quyền đúng cho project directory
sudo chown -R root:root /opt/crawlweb
sudo chmod -R 755 /opt/crawlweb

# Nếu cần write vào media folder
sudo chmod -R 777 /opt/crawlweb/server/media
```

### 12.7. Out of memory (OOM)

**Nguyên nhân**: Instance quá nhỏ cho cả 3 services.

**Cách sửa**:
```bash
# Kiểm tra memory
free -h

# Giảm Gunicorn workers (trong service file)
sudo nano /etc/systemd/system/crawlweb-backend.service
# Đổi --workers 3 thành --workers 2

# Reload và restart
sudo systemctl daemon-reload
sudo systemctl restart crawlweb-backend crawlweb-scraper
```

### 12.8. npm build lỗi

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

### 12.9. Django ALLOWED_HOSTS error

**Nguyên nhân**: Domain không có trong `ALLOWED_HOSTS`.

**Cách sửa**:
```bash
sudo nano /opt/crawlweb/server/crawlweb/crawlweb/settings.py

# Đảm bảo có:
# ALLOWED_HOSTS = ['itjobs.ddns.net', 'localhost', '127.0.0.1']

sudo systemctl restart crawlweb-backend
```

### 12.10. Disk đầy

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

### 12.11. Domain không resolve về EC2

**Nguyên nhân**: No-IP DNS chưa cập nhật IP mới của EC2.

**Cách sửa**:
```bash
# Kiểm tra IP hiện tại của EC2
curl http://checkip.amazonaws.com

# Kiểm tra domain resolve
nslookup itjobs.ddns.net

# Nếu IP khác nhau → cập nhật DNS trên No-IP dashboard
# https://www.noip.com/members/dns/

# Nếu dùng No-IP client trên EC2
sudo noip2 -S  # Xem status
sudo noip2 -U 5  # Force update (mỗi 5 phút)
```

---

## 13. Bật HTTPS (tương lai)

Khi sẵn sàng bật HTTPS:

```bash
# 1. Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# 2. Chạy Certbot (domain đã trỏ về EC2 IP)
sudo certbot --nginx -d itjobs.ddns.net

# 3. Certbot sẽ tự động:
#    - Cài SSL certificate
#    - Cập nhật Nginx config
#    - Tạo cron job auto-renew

# 4. Kiểm tra auto-renew
sudo certbot renew --dry-run

# 5. Cập nhật CORS trong settings.py
sudo nano /opt/crawlweb/server/crawlweb/crawlweb/settings.py
# CORS_ALLOWED_ORIGINS = [
#     "https://itjobs.ddns.net",
#     "http://localhost:3000",
# ]

# 6. Restart
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
| Edit settings | `nano /opt/crawlweb/server/crawlweb/crawlweb/settings.py` |
| Django shell | `cd /opt/crawlweb/server/crawlweb && source ../myworld/bin/activate && python manage.py shell` |
| MongoDB shell | `mongosh` |
| Kiểm tra disk | `df -h` |
| Kiểm tra RAM | `free -h` |

---

## Cấu trúc thư mục trên server

```
/opt/crawlweb/                          # Project root
├── deploy/
│   ├── deploy.sh                       # Script deploy lần đầu
│   └── update.sh                       # Script update/rollback
├── client/
│   └── app/
│       └── build/                      # React production build (static)
├── server/
│   ├── myworld/                        # Python venv cho backend
│   ├── requirements.txt
│   └── crawlweb/                       # ⚡ Django project root (manage.py ở đây)
│       ├── manage.py
│       ├── load_test_data.py
│       ├── staticfiles/                # Django collected static files
│       ├── media/                      # User uploads (CV files)
│       ├── crawlweb/
│       │   ├── settings.py             # ⚡ Production config đã patch
│       │   ├── wsgi.py
│       │   └── urls.py
│       └── api/
│           ├── models.py
│           ├── views.py
│           └── ...
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
