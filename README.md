# crawlweb_django

Dự án gồm:

- **Backend**: Django + Django REST Framework, dùng MongoDB thông qua `django-mongodb-backend`
- **Frontend**: React app tại `client/app`
- **Database**: MongoDB local, database mặc định `pbl4_db`

## 1. Yêu cầu môi trường

Cài đặt trước:

- Python 3.11+ hoặc phiên bản tương thích với Django trong `server/requirements.txt`
- Node.js 18+ và npm
- MongoDB đang chạy local tại `mongodb://localhost:27017`
- Git Bash/WSL nếu chạy các script `.sh` trên Windows

## 2. Cấu trúc thư mục chính

```text
crawlweb_django/
├── client/app/              # React frontend
├── server/crawlweb/         # Django project, chứa manage.py
├── server/requirements.txt  # Dependency backend
├── database/seed/           # Dữ liệu seed MongoDB nếu có
├── scripts/                 # Script hỗ trợ chạy local
└── var/                     # Cấu hình/phụ trợ local
```

## 3. Chạy development

### 3.1. Chuẩn bị MongoDB

Đảm bảo MongoDB đang chạy local.

Backend hiện cấu hình database tại:

```text
mongodb://localhost:27017/pbl4_db
```

Nếu dùng script có sẵn để chạy/restore MongoDB:

```bash
bash scripts/setup.sh
```

Script này sẽ:

- Kích hoạt môi trường Python theo cấu hình hiện tại trong script
- Cài dependency backend
- Chạy `scripts/mongo.sh`
- Restore dữ liệu từ `database/seed/pbl4_db` vào database `pbl4_db` nếu có MongoDB Tools

> Lưu ý: trên Windows cần Git Bash/WSL và MongoDB Tools nếu muốn dùng `mongorestore`.

### 3.2. Cài dependency backend

Từ thư mục root project:

```bash
cd server
python -m venv myworld
```

Kích hoạt virtual environment:

Windows PowerShell:

```powershell
.\myworld\Scripts\Activate.ps1
```

Windows Git Bash:

```bash
source myworld/Scripts/activate
```

Linux/macOS:

```bash
source myworld/bin/activate
```

Cài package Python:

```bash
pip install -r requirements.txt
```

### 3.3. Chạy migration backend

```bash
cd server/crawlweb
python manage.py makemigrations
python manage.py migrate
python manage.py check
```

Nếu `makemigrations` báo `No changes detected` thì có thể bỏ qua.

### 3.4. Chạy Django backend

```bash
cd server/crawlweb
python manage.py runserver
```

Backend mặc định chạy tại:

```text
http://localhost:8000
```

Nếu muốn bind ra toàn bộ network interface:

```bash
python manage.py runserver 0.0.0.0:8000
```

### 3.5. Cài dependency frontend

Mở terminal khác từ root project:

```bash
cd client/app
npm install
```

### 3.6. Lưu ý proxy trong `package.json`

Trong file `client/app/package.json` cần có cấu hình proxy:

```json
"proxy": "http://localhost:8000"
```

Cấu hình này giúp React development server proxy các API request tương đối sang Django backend tại `http://localhost:8000`.

Ví dụ:

```js
fetch("/api/jobs/")
```

Khi chạy `npm start`, request trên sẽ được chuyển tới:

```text
http://localhost:8000/api/jobs/
```

### 3.7. Chạy React frontend

```bash
cd client/app
npm start
```

Frontend mặc định chạy tại:

```text
http://localhost:3000
```

Có thể dùng script có sẵn:

```bash
bash scripts/react.sh
```

## 4. Kiểm tra nhanh sau khi chạy development

Sau khi backend và frontend đã chạy:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`

Kiểm tra backend:

```bash
curl http://localhost:8000/
```

Kiểm tra API theo endpoint thực tế của project, ví dụ:

```bash
curl http://localhost:8000/api/jobs/
```

## 5. Build frontend cho production

Từ thư mục frontend:

```bash
cd client/app
npm install
npm run build
```

Sau khi build xong, thư mục production static được tạo tại:

```text
client/app/build/
```

Thư mục này có thể được deploy lên Nginx, Apache, hoặc dịch vụ static hosting.

## 6. Deployment

Repo hiện tại chưa có cấu hình Docker/Nginx production hoàn chỉnh trong source. Có thể deploy theo hướng thủ công như sau.

### 6.1. Chuẩn bị server

Trên server production cần có:

- Python
- Node.js/npm
- MongoDB
- Web server/reverse proxy như Nginx
- Process manager như systemd, supervisor hoặc pm2

Mở các port cần thiết:

- `80` cho HTTP
- `443` cho HTTPS nếu dùng SSL
- `22` cho SSH

Không public trực tiếp MongoDB ra internet.

### 6.2. Clone source

```bash
git clone <repository-url>
cd crawlweb_django
```

### 6.3. Cài backend trên server

```bash
cd server
python -m venv myworld
source myworld/bin/activate
pip install -r requirements.txt
```

Chạy migration:

```bash
cd crawlweb
python manage.py migrate
python manage.py check
```

### 6.4. Cấu hình Django cho production

Trước khi public production, cần chỉnh trong `server/crawlweb/crawlweb/settings.py`:

```python
DEBUG = False
ALLOWED_HOSTS = ["your-domain.com", "www.your-domain.com", "your-server-ip"]
```

Cập nhật CORS nếu frontend chạy trên domain production:

```python
CORS_ALLOWED_ORIGINS = [
    "https://your-domain.com",
    "https://www.your-domain.com",
]
```

Khuyến nghị đưa các giá trị nhạy cảm ra biến môi trường:

- `SECRET_KEY`
- `DEBUG`
- `ALLOWED_HOSTS`
- MongoDB URI/password nếu có authentication

### 6.5. Chạy backend production

Để chạy nhanh có thể dùng:

```bash
python manage.py runserver 0.0.0.0:8000
```

Tuy nhiên production nên dùng WSGI server như Gunicorn/uWSGI và process manager.

Ví dụ cài Gunicorn:

```bash
pip install gunicorn
```

Chạy thử:

```bash
cd server/crawlweb
gunicorn crawlweb.wsgi:application --bind 0.0.0.0:8000
```

Nên cấu hình systemd/supervisor để backend tự khởi động lại khi server reboot hoặc process lỗi.

### 6.6. Deploy frontend production

Build frontend:

```bash
cd client/app
npm install
npm run build
```

Copy nội dung trong:

```text
client/app/build/
```

vào thư mục static web của Nginx, ví dụ:

```text
/var/www/crawlweb
```

### 6.7. Cấu hình Nginx gợi ý

Ví dụ reverse proxy:

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    root /var/www/crawlweb;
    index index.html;

    location / {
        try_files $uri /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /media/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
    }
}
```

Sau khi tạo file cấu hình Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 6.8. HTTPS

Khuyến nghị dùng Let's Encrypt/Certbot:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

Kiểm tra tự động gia hạn:

```bash
sudo certbot renew --dry-run
```

## 7. Lưu ý quan trọng

- Không commit secret/password thật lên Git.
- Đổi `SECRET_KEY` trước khi deploy production.
- Tắt `DEBUG` khi public.
- Cấu hình `ALLOWED_HOSTS` và `CORS_ALLOWED_ORIGINS` đúng domain production.
- Backup MongoDB định kỳ.
- Không expose MongoDB trực tiếp ra internet.
- Trong development, đảm bảo frontend có proxy trong `client/app/package.json`:

```json
"proxy": "http://localhost:8000"
```

## 8. Lệnh thường dùng

Backend:

```bash
cd server/crawlweb
python manage.py runserver
python manage.py makemigrations
python manage.py migrate
python manage.py check
```

Frontend:

```bash
cd client/app
npm install
npm start
npm run build
```

MongoDB restore dữ liệu seed nếu có:

```bash
mongorestore --uri=mongodb://localhost:27017/pbl4_db --db=pbl4_db --drop ./database/seed/pbl4_db
```
