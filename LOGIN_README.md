# Hướng dẫn chạy chức năng đăng nhập

## Đã chuyển từ Next.js sang React-Django

Chức năng đăng nhập đã được chuyển từ dự án Next.js sang dự án React-Django với các thành phần sau:

### Backend (Django)

1. **Model User** - [server/crawlweb/api/models.py](server/crawlweb/api/models.py)
   - Bảng User với các trường: username, password (hashed), role

2. **API Endpoints** - [server/crawlweb/api/views.py](server/crawlweb/api/views.py)
   - `POST /api/auth/login/` - Đăng nhập
   - `GET /api/auth/user/` - Lấy thông tin user hiện tại
   - `POST /api/auth/logout/` - Đăng xuất

3. **Authentication**
   - Sử dụng bcrypt để hash và verify password
   - Sử dụng JWT token lưu trong httpOnly cookie
   - Token có thời hạn 10 giờ

### Frontend (React)

1. **Component Login** - [client/app/src/Login.jsx](client/app/src/Login.jsx)
   - Giao diện đăng nhập với validation
   - Hiển thị lỗi khi đăng nhập sai
   - Loading state khi đang xử lý

2. **Routing** - [client/app/src/AppRouter.jsx](client/app/src/AppRouter.jsx)
   - Route `/login` cho trang đăng nhập
   - Tích hợp với Header và Footer

3. **Header** - [client/app/src/ui/layout/header.jsx](client/app/src/ui/layout/header.jsx)
   - Hiển thị trạng thái đăng nhập/đăng xuất
   - Menu người dùng với dropdown
   - Auto-refresh khi login/logout

## Cách chạy

### 1. Cài đặt và setup

```bash
# Chạy script setup để cài đặt dependencies và import dữ liệu
scripts/setup.sh
```

Script này sẽ:
- Cài đặt Python packages (bcrypt, PyJWT, django, etc.)
- Chạy migrations cho database
- Khởi động MongoDB server
- Import dữ liệu seed vào MongoDB

### 2. Chạy MongoDB (nếu chưa chạy)

```bash
# Terminal 1: MongoDB server
scripts/mongo.sh
```

### 3. Chạy Django server

```bash
# Terminal 2: Django backend
scripts/django.sh
```

Django server sẽ chạy tại: http://127.0.0.1:8000

### 4. Chạy React frontend

```bash
# Terminal 3: React frontend
scripts/react.sh
```

React app sẽ chạy tại: http://localhost:3000

## Kiểm tra chức năng

1. Mở trình duyệt tại http://localhost:3000
2. Click vào "Đăng nhập" trên header
3. Nhập thông tin đăng nhập (cần có user trong database)
4. Sau khi đăng nhập thành công:
   - Sẽ redirect về trang chủ (hoặc /admin nếu là admin)
   - Header sẽ hiển thị tên user
   - Có thể đăng xuất từ dropdown menu

## Tạo user test

Để tạo user test, bạn cần chạy Python script để hash password:

```python
import bcrypt

# Hash password
password = "test123"
hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
print(hashed.decode('utf-8'))
```

Sau đó insert vào MongoDB:

```javascript
db.User.insertOne({
  username: "testuser",
  password: "<hashed_password_from_above>",
  role: "user"
})
```

## Cấu trúc API

### POST /api/auth/login/

Request:
```json
{
  "username": "testuser",
  "password": "test123"
}
```

Response (success):
```json
{
  "success": true,
  "redirect": "/",
  "user": {
    "username": "testuser",
    "role": "user",
    "id": "..."
  }
}
```

Response (error):
```json
{
  "error": "Bad credentials."
}
```

### GET /api/auth/user/

Response:
```json
{
  "user": {
    "username": "testuser",
    "role": "user",
    "id": "..."
  }
}
```

### POST /api/auth/logout/

Response:
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

## Lưu ý

- CORS đã được cấu hình cho phép localhost:3000
- Cookie httpOnly được sử dụng để lưu JWT token
- Password được hash bằng bcrypt trước khi lưu vào database
- Token có thời hạn 10 giờ

## Troubleshooting

### Lỗi kết nối MongoDB
- Đảm bảo MongoDB đang chạy: `scripts/mongo.sh`
- Kiểm tra port 27017 không bị chiếm dụng

### Lỗi import User model
- Chạy migrations: `python manage.py makemigrations && python manage.py migrate`

### Lỗi CORS
- Kiểm tra `CORS_ALLOW_ALL_ORIGINS = True` trong settings.py
- Hoặc cấu hình `CORS_ALLOWED_ORIGINS` cụ thể

### Lỗi bcrypt hoặc jwt
- Cài đặt lại: `pip install bcrypt PyJWT`
