# Bật HTTPS cho CrawlWeb trên Ubuntu EC2

Tài liệu này hướng dẫn chuyển site CrawlWeb từ HTTP sang HTTPS bằng Let's Encrypt/Certbot, Nginx, Gunicorn và systemd services hiện có.

Các file liên quan:

- `deploy/enable_https.sh`: script chính tự động cấp SSL, ghi Nginx HTTPS config, restart/reload services và kiểm tra.
- `deploy/check_https.sh`: script kiểm tra HTTPS, certificate, security headers và renew dry-run.
- `/etc/nginx/sites-available/crawlweb`: Nginx site config được script backup rồi ghi đè.
- `/var/log/crawlweb/enable_https.log`: log chạy script.

> Script không ghi `SECRET_KEY` hoặc bí mật nào vào code. Các thay đổi Django HTTPS/cookie chỉ được liệt kê để chỉnh thủ công.

---

## 1. Mục đích

Sau khi chạy `enable_https.sh`, hệ thống sẽ:

1. Cài `certbot` và `python3-certbot-nginx` nếu chưa có.
2. Cấp hoặc kiểm tra/gia hạn certificate Let's Encrypt cho domain.
3. Backup Nginx config hiện tại trước khi ghi đè.
4. Ghi Nginx config mới:
   - HTTP port `80` redirect toàn bộ sang HTTPS.
   - HTTPS port `443` dùng certificate tại `/etc/letsencrypt/live/<DOMAIN>/`.
   - Bật HTTP/2.
   - Bật OCSP stapling nếu môi trường hỗ trợ.
   - Thêm security headers:
     - `Strict-Transport-Security`
     - `X-Frame-Options`
     - `X-Content-Type-Options`
     - `Referrer-Policy`
     - `Content-Security-Policy` cơ bản
   - Serve React build tại `/opt/crawlweb/client/app/build`.
   - Proxy `/api/` và `/admin/` về Gunicorn/Django `127.0.0.1:8000`.
   - Giữ alias static/media:
     - `/static/` → React static build
     - `/backend-static/` → Django collected static
     - `/media/` → Django media uploads
5. Restart/reload:
   - `nginx`
   - `crawlweb-backend`
   - `crawlweb-scraper`
6. Thiết lập auto-renew qua systemd timer.
7. Kiểm tra HTTPS endpoint và header HSTS.

---

## 2. Điều kiện tiên quyết

Trước khi chạy script, cần đảm bảo:

### 2.1. Domain đã trỏ về EC2

Domain phải resolve về public IP của EC2.

Kiểm tra:

```bash
curl http://checkip.amazonaws.com
nslookup YOUR_DOMAIN
```

Nếu dùng No-IP/DDNS, cập nhật IP trước khi chạy Certbot.

### 2.2. AWS Security Group mở port 80/443

Inbound rules tối thiểu:

| Type | Protocol | Port | Source |
|------|----------|------|--------|
| SSH | TCP | 22 | IP của bạn hoặc cấu hình phù hợp |
| HTTP | TCP | 80 | `0.0.0.0/0` |
| HTTPS | TCP | 443 | `0.0.0.0/0` |

Không mở public các port internal:

- `8000` Django/Gunicorn
- `37001` scraper
- `27017` MongoDB

### 2.3. Đã deploy HTTP trước đó

Script giả định server đã được deploy bởi `deploy/deploy.sh` và có:

- `/opt/crawlweb`
- `/etc/nginx/sites-available/crawlweb`
- `crawlweb-backend.service`
- `crawlweb-scraper.service`
- `nginx.service`

Kiểm tra:

```bash
ls -la /opt/crawlweb
sudo systemctl status nginx
sudo systemctl status crawlweb-backend
sudo systemctl status crawlweb-scraper
```

### 2.4. Có quyền sudo/root

Script chính phải chạy bằng root:

```bash
sudo ./deploy/enable_https.sh
```

---

## 3. Biến cần set trước khi chạy

| Biến | Bắt buộc | Mặc định | Mô tả |
|------|----------|----------|-------|
| `DOMAIN` | Có | Không có | Domain chính cần cấp SSL, ví dụ `itjobs.ddns.net` |
| `EMAIL` | Có | Không có | Email quản trị dùng cho Let's Encrypt |
| `PROJECT_DIR` | Không | `/opt/crawlweb` | Thư mục project trên EC2 |
| `DJANGO_PORT` | Không | `8000` | Port Gunicorn/Django internal |
| `SCRAPER_PORT` | Không | `37001` | Port scraper internal |

Nếu không truyền `DOMAIN` hoặc `EMAIL`, script sẽ hỏi tương tác.

---

## 4. Cách chạy script

### 4.1. Clone/pull code mới trên EC2

```bash
cd /opt/crawlweb
git pull origin linux
```

Nếu đang ở thư mục clone khác, copy/sync file deploy vào `/opt/crawlweb` trước khi chạy.

### 4.2. Cấp quyền execute

```bash
cd /opt/crawlweb
chmod +x deploy/enable_https.sh deploy/check_https.sh
```

### 4.3. Chạy với biến môi trường

```bash
sudo DOMAIN=itjobs.ddns.net EMAIL=admin@example.com PROJECT_DIR=/opt/crawlweb ./deploy/enable_https.sh
```

Hoặc dùng flag:

```bash
sudo ./deploy/enable_https.sh --domain itjobs.ddns.net --email admin@example.com --project /opt/crawlweb
```

Hoặc để script hỏi:

```bash
sudo ./deploy/enable_https.sh
```

### 4.4. Xem log

```bash
sudo tail -f /var/log/crawlweb/enable_https.log
```

Các log khác:

```bash
sudo tail -f /var/log/nginx/error.log
sudo journalctl -u crawlweb-backend -f --no-pager
sudo journalctl -u crawlweb-scraper -f --no-pager
```

---

## 5. Script sẽ thay đổi gì?

### 5.1. Backup Nginx config

Trước khi ghi đè, script copy:

```text
/etc/nginx/sites-available/crawlweb
```

sang:

```text
/etc/nginx/backup/crawlweb_YYYYMMDD_HHMMSS.conf
```

Script giữ 10 backup mới nhất.

### 5.2. Ghi Nginx HTTPS config

Tóm tắt diff-like:

```diff
+ server {
+     listen 80;
+     listen [::]:80;
+     server_name DOMAIN;
+
+     location /.well-known/acme-challenge/ {
+         root /var/www/html;
+     }
+
+     location / {
+         return 301 https://$host$request_uri;
+     }
+ }

+ server {
+     listen 443 ssl http2;
+     listen [::]:443 ssl http2;
+     server_name DOMAIN;
+
+     ssl_certificate     /etc/letsencrypt/live/DOMAIN/fullchain.pem;
+     ssl_certificate_key /etc/letsencrypt/live/DOMAIN/privkey.pem;
+
+     add_header Strict-Transport-Security "...";
+     add_header X-Frame-Options "SAMEORIGIN";
+     add_header X-Content-Type-Options "nosniff";
+     add_header Referrer-Policy "strict-origin-when-cross-origin";
+     add_header Content-Security-Policy "default-src 'self'; ...";
+
+     root PROJECT_DIR/client/app/build;
+
+     location /api/ {
+         proxy_pass http://127.0.0.1:8000;
+         proxy_set_header X-Forwarded-Proto $scheme;
+     }
+
+     location /admin/ {
+         proxy_pass http://127.0.0.1:8000;
+     }
+
+     location /static/ {
+         alias PROJECT_DIR/client/app/build/static/;
+     }
+
+     location /backend-static/ {
+         alias PROJECT_DIR/server/crawlweb/staticfiles/;
+     }
+
+     location /media/ {
+         alias PROJECT_DIR/server/crawlweb/media/;
+     }
+
+     location / {
+         try_files $uri $uri/ /index.html;
+     }
+ }
```

### 5.3. Certificate paths

Sau khi Certbot cấp thành công:

```text
/etc/letsencrypt/live/DOMAIN/fullchain.pem
/etc/letsencrypt/live/DOMAIN/privkey.pem
```

Kiểm tra:

```bash
sudo certbot certificates
```

### 5.4. Auto-renew

Ưu tiên dùng systemd timer có sẵn của Certbot:

```bash
systemctl list-timers | grep cert
```

Nếu không có timer mặc định, script tạo fallback:

```text
/etc/systemd/system/crawlweb-certbot-renew.service
/etc/systemd/system/crawlweb-certbot-renew.timer
```

Timer chạy 2 lần/ngày, có random delay.

---

## 6. Verify sau khi chạy

### 6.1. Chạy script verify

```bash
cd /opt/crawlweb
sudo DOMAIN=itjobs.ddns.net ./deploy/check_https.sh
```

Hoặc:

```bash
sudo ./deploy/check_https.sh --domain itjobs.ddns.net
```

Nếu chỉ muốn kiểm tra nhanh, bỏ renew dry-run:

```bash
DOMAIN=itjobs.ddns.net ./deploy/check_https.sh --no-renew-dry-run
```

### 6.2. Verify bằng curl

```bash
# HTTPS trả 200/301/302
curl -I https://itjobs.ddns.net

# HTTP phải redirect sang HTTPS
curl -I http://itjobs.ddns.net

# Kiểm tra HSTS
curl -I https://itjobs.ddns.net | grep -i strict-transport-security

# Kiểm tra API qua Nginx HTTPS
curl -I https://itjobs.ddns.net/api/

# Kiểm tra Django admin
curl -I https://itjobs.ddns.net/admin/
```

### 6.3. Verify certificate

```bash
openssl s_client -servername itjobs.ddns.net -connect itjobs.ddns.net:443 </dev/null 2>/dev/null | openssl x509 -noout -subject -issuer -dates
```

Hoặc:

```bash
sudo certbot certificates
```

### 6.4. Verify services

```bash
sudo systemctl status nginx
sudo systemctl status crawlweb-backend
sudo systemctl status crawlweb-scraper
sudo systemctl status mongod
```

### 6.5. Verify auto-renew

```bash
sudo certbot renew --dry-run
systemctl list-timers | grep -E 'certbot|crawlweb-certbot-renew'
```

### 6.6. Verify bằng browser

Mở:

```text
https://itjobs.ddns.net
```

Kiểm tra:

- Browser hiển thị ổ khóa HTTPS.
- Không có mixed content trong DevTools Console.
- Network tab gọi API qua `https://DOMAIN/api/...`.

---

## 7. Rollback

Nếu HTTPS config làm Nginx lỗi hoặc site không truy cập được, rollback Nginx config từ backup.

### 7.1. Xem danh sách backup

```bash
sudo ls -lt /etc/nginx/backup/crawlweb_*.conf
```

### 7.2. Restore backup

Thay `<BACKUP_FILE>` bằng file muốn phục hồi:

```bash
sudo cp /etc/nginx/backup/<BACKUP_FILE> /etc/nginx/sites-available/crawlweb
sudo nginx -t
sudo systemctl reload nginx
```

Ví dụ:

```bash
sudo cp /etc/nginx/backup/crawlweb_20260527_140000.conf /etc/nginx/sites-available/crawlweb
sudo nginx -t
sudo systemctl reload nginx
```

### 7.3. Restart services nếu cần

```bash
sudo systemctl restart crawlweb-backend
sudo systemctl restart crawlweb-scraper
sudo systemctl reload nginx
```

### 7.4. Tạm tắt HSTS khi rollback về HTTP

Nếu người dùng đã truy cập site HTTPS và browser nhận HSTS, browser có thể tiếp tục ép HTTPS trong thời gian `max-age`.

Để rollback mềm, nên giữ HTTPS hoạt động hoặc giảm HSTS trước khi rollback:

```nginx
add_header Strict-Transport-Security "max-age=300" always;
```

Sau đó reload Nginx và chờ cache HSTS hết hạn. Không nên rollback về HTTP lâu dài sau khi đã bật HSTS preload.

---

## 8. Cấu hình Django cần chỉnh thủ công

Script không tự sửa `settings.py` để tránh ghi nhầm secret hoặc phá config. Sau khi HTTPS chạy ổn, chỉnh:

```bash
sudo nano /opt/crawlweb/server/crawlweb/crawlweb/settings.py
```

Thêm hoặc cập nhật:

```python
SECURE_SSL_REDIRECT = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# Nếu dùng CSRF trusted origins:
CSRF_TRUSTED_ORIGINS = [
    "https://itjobs.ddns.net",
]

# Cập nhật CORS sang HTTPS:
CORS_ALLOWED_ORIGINS = [
    "https://itjobs.ddns.net",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
```

Đảm bảo `ALLOWED_HOSTS` có domain:

```python
ALLOWED_HOSTS = ["itjobs.ddns.net", "localhost", "127.0.0.1"]
```

Restart backend sau khi chỉnh:

```bash
sudo systemctl restart crawlweb-backend
```

Kiểm tra:

```bash
curl -I https://itjobs.ddns.net/api/
sudo journalctl -u crawlweb-backend -n 50 --no-pager
```

---

## 9. Đảm bảo backend/scraper vẫn hoạt động

Sau khi bật HTTPS:

### 9.1. Gunicorn/Django

```bash
sudo systemctl status crawlweb-backend
curl -I http://127.0.0.1:8000/api/
curl -I https://itjobs.ddns.net/api/
```

Nếu Nginx trả `502 Bad Gateway`, xem log:

```bash
sudo journalctl -u crawlweb-backend -n 100 --no-pager
sudo tail -n 100 /var/log/nginx/error.log
```

### 9.2. Scraper

```bash
sudo systemctl status crawlweb-scraper
curl http://127.0.0.1:37001/docs
sudo journalctl -u crawlweb-scraper -n 100 --no-pager
```

### 9.3. MongoDB

```bash
sudo systemctl status mongod
mongosh --eval "db.runCommand({ping:1})"
```

---

## 10. Xử lý lỗi phổ biến

### 10.1. `nginx -t` fail

Xem lỗi chi tiết:

```bash
sudo nginx -t
sudo tail -n 100 /var/log/nginx/error.log
```

Rollback:

```bash
sudo ls -lt /etc/nginx/backup/crawlweb_*.conf
sudo cp /etc/nginx/backup/<BACKUP_FILE> /etc/nginx/sites-available/crawlweb
sudo nginx -t
sudo systemctl reload nginx
```

Nguyên nhân thường gặp:

- Sai path certificate.
- Certbot chưa cấp certificate.
- Nginx version cũ không hỗ trợ syntax hiện tại.
- Copy config thủ công bị lỗi dấu `;` hoặc `{}`.

### 10.2. Certbot fail vì domain/DNS

Kiểm tra:

```bash
curl http://checkip.amazonaws.com
nslookup itjobs.ddns.net
```

Domain phải trỏ về đúng public IP EC2. Nếu dùng No-IP/DDNS, cập nhật record rồi chờ DNS propagate.

### 10.3. Firewall hoặc Security Group chặn port

Kiểm tra UFW:

```bash
sudo ufw status
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

Kiểm tra AWS Security Group: phải mở inbound `80` và `443`.

### 10.4. Certbot rate limit

Let's Encrypt có giới hạn số lần cấp cert cho cùng domain.

Kiểm tra log:

```bash
sudo tail -n 100 /var/log/letsencrypt/letsencrypt.log
```

Khuyến nghị:

- Dùng `sudo certbot renew --dry-run` để test staging renew.
- Không xóa/cấp lại cert liên tục.
- Nếu bị rate limit, phải chờ theo thông báo của Let's Encrypt.

### 10.5. Mixed content trên browser

Nếu frontend gọi API bằng `http://...`, browser sẽ block khi page chạy HTTPS.

Tìm hardcode HTTP trong frontend:

```bash
cd /opt/crawlweb/client/app
grep -R "http://" -n src
```

Ưu tiên dùng relative URL:

```text
/api/...
```

Sau khi sửa:

```bash
npm run build
sudo systemctl reload nginx
```

### 10.6. Django redirect loop

Nếu bật `SECURE_SSL_REDIRECT = True` nhưng thiếu:

```python
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
```

Django có thể redirect loop phía sau Nginx reverse proxy.

Cách sửa: thêm `SECURE_PROXY_SSL_HEADER`, restart backend.

### 10.7. API bị CORS sau khi chuyển HTTPS

Cập nhật:

```python
CORS_ALLOWED_ORIGINS = [
    "https://itjobs.ddns.net",
]
```

Nếu dùng CSRF cho request từ frontend:

```python
CSRF_TRUSTED_ORIGINS = [
    "https://itjobs.ddns.net",
]
```

Restart:

```bash
sudo systemctl restart crawlweb-backend
```

---

## 11. HTTP/2 và OCSP stapling

Script bật:

```nginx
listen 443 ssl http2;
ssl_stapling on;
ssl_stapling_verify on;
```

### HTTP/2

Ưu điểm:

- Tốt hơn cho nhiều static assets.
- Giảm overhead nhiều request nhỏ.
- Không cần thay đổi app.

### OCSP stapling

Ưu điểm:

- Browser kiểm tra trạng thái certificate nhanh hơn.
- Giảm request trực tiếp từ client tới CA.

Nếu Nginx cảnh báo OCSP trong log nhưng site vẫn chạy, thường là do resolver/network tạm thời. Kiểm tra:

```bash
sudo tail -n 100 /var/log/nginx/error.log
```

---

## 12. Systemd timer vs cron cho renew

Script ưu tiên systemd timer.

### Systemd timer

Ưu điểm:

- Theo dõi bằng `systemctl`.
- Có `Persistent=true` để chạy bù sau downtime.
- Log qua journald.
- Dễ kiểm tra bằng `systemctl list-timers`.

Lệnh kiểm tra:

```bash
systemctl list-timers | grep -E 'certbot|crawlweb-certbot-renew'
sudo journalctl -u certbot --no-pager
sudo journalctl -u crawlweb-certbot-renew --no-pager
```

### Cron

Ưu điểm:

- Đơn giản, quen thuộc.
- Hoạt động ở môi trường không dùng systemd.

Nhược điểm:

- Ít metadata/trạng thái hơn.
- Dễ bị trùng nếu package Certbot đã tạo timer sẵn.

Nếu muốn dùng cron thủ công:

```bash
sudo crontab -e
```

Thêm:

```cron
0 3,15 * * * certbot renew --quiet --deploy-hook "systemctl reload nginx"
```

Không cần cron nếu systemd timer đã hoạt động.

---

## 13. Lệnh nhanh

```bash
# Chạy bật HTTPS
cd /opt/crawlweb
chmod +x deploy/enable_https.sh deploy/check_https.sh
sudo DOMAIN=itjobs.ddns.net EMAIL=admin@example.com PROJECT_DIR=/opt/crawlweb ./deploy/enable_https.sh

# Xem log
sudo tail -f /var/log/crawlweb/enable_https.log

# Verify đầy đủ
sudo DOMAIN=itjobs.ddns.net ./deploy/check_https.sh

# Verify nhanh
curl -I https://itjobs.ddns.net
curl -I http://itjobs.ddns.net
curl -I https://itjobs.ddns.net | grep -i strict-transport-security

# Kiểm tra cert
sudo certbot certificates
sudo certbot renew --dry-run

# Kiểm tra services
sudo systemctl status nginx crawlweb-backend crawlweb-scraper

# Rollback Nginx config
sudo ls -lt /etc/nginx/backup/crawlweb_*.conf
sudo cp /etc/nginx/backup/<BACKUP_FILE> /etc/nginx/sites-available/crawlweb
sudo nginx -t
sudo systemctl reload nginx