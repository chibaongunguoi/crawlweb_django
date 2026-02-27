# Scraper Service - Hướng Dẫn Sử Dụng

## Tổng Quan

Scraper Service là một microservice riêng biệt chạy độc lập với Django backend, sử dụng FastAPI để crawl dữ liệu công việc từ các trang web tuyển dụng (TopCV, DevWork).

## Kiến Trúc

```
Django Backend (Port 8000)
    ↓ HTTP POST
Scraper Service (Port 37001)
    ↓ Callback
Django Backend (Receives progress & results)
```

## Cài Đặt & Chạy

### Bước 1: Cài đặt dependencies cho Scraper

```bash
cd server/scraper
python -m venv venv
venv\Scripts\activate  # Windows
# hoặc
source venv/bin/activate  # Linux/Mac

pip install -r requirements.txt
```

### Bước 2: Chạy Scraper Service

#### Windows:
```bash
scripts\scraper.bat
```

#### Linux/Mac:
```bash
chmod +x scripts/scraper.sh
./scripts/scraper.sh
```

#### Hoặc chạy trực tiếp:
```bash
cd server/scraper
python main.py
```

Scraper sẽ chạy trên **http://localhost:37001**

### Bước 3: Chạy Django Backend

```bash
cd server/crawlweb
python manage.py runserver
```

### Bước 4: Chạy React Frontend

```bash
cd client/app
npm start
```

## Sử Dụng

### Từ Admin Panel

1. Đăng nhập với tài khoản admin
2. Vào menu **"Quản lý Crawl"**
3. Nhập các URLs cần crawl (mỗi URL một dòng):
   ```
   https://www.topcv.vn/tim-viec-lam-python
   https://www.topcv.vn/tim-viec-lam-react
   ```
4. Click **"Bắt Đầu Crawl"**
5. Theo dõi tiến trình realtime trong bảng lịch sử

### API Endpoints

#### 1. Upload URLs để crawl
```http
POST /api/scrape/upload/
Content-Type: application/json

{
  "urls": [
    "https://www.topcv.vn/tim-viec-lam-python",
    "https://devwork.vn/viec-lam/react"
  ]
}

Response:
{
  "jobId": "507f1f77bcf86cd799439011"
}
```

#### 2. Lấy danh sách jobs
```http
GET /api/scrape/jobs/

Response:
{
  "jobs": [
    {
      "id": "507f1f77bcf86cd799439011",
      "status": "processing",
      "progress": 45,
      "totalUrls": 10,
      "processedUrls": 4,
      "jobCount": 23,
      "createdAt": "2024-01-15T10:30:00",
      "completedAt": null
    }
  ]
}
```

#### 3. Kiểm tra trạng thái job
```http
GET /api/scrape/status/{job_id}/

Response:
{
  "job": {
    "id": "507f1f77bcf86cd799439011",
    "status": "completed",
    "progress": 100,
    "totalUrls": 10,
    "processedUrls": 10,
    "jobCount": 156,
    "currentUrl": "",
    "errorMessage": null
  }
}
```

#### 4. Xóa job
```http
DELETE /api/scrape/jobs/{job_id}/

Response:
{
  "success": true,
  "message": "Job deleted successfully"
}
```

## Callback Endpoints (Internal)

Các endpoint này được scraper service gọi tự động:

```http
POST /api/scrape/progress/
POST /api/scrape/result/
```

## Cấu Hình

### Environment Variables

Trong `server/scraper/.env` (tùy chọn):
```env
SCRAPER_HOST=localhost
SCRAPER_PORT=37001
```

### Scraper Strategy

Scraper hỗ trợ crawl từ:
- **TopCV**: https://www.topcv.vn/
- **DevWork**: https://devwork.vn/

Tự động phát hiện và sử dụng strategy phù hợp dựa trên URL.

## Troubleshooting

### Lỗi: "Failed to start scraper service"

**Nguyên nhân**: Scraper service chưa chạy

**Giải pháp**:
```bash
cd server/scraper
python main.py
```

### Lỗi: Connection refused to localhost:37001

**Nguyên nhân**: Scraper service chưa khởi động hoặc crashed

**Giải pháp**:
1. Kiểm tra terminal đang chạy scraper có lỗi không
2. Restart scraper service
3. Kiểm tra port 37001 có bị chiếm dụng không:
   ```bash
   netstat -ano | findstr :37001  # Windows
   lsof -i :37001  # Linux/Mac
   ```

### Job stuck ở trạng thái "processing"

**Nguyên nhân**: Scraper service bị crash giữa chừng

**Giải pháp**:
1. Restart scraper service
2. Xóa job bị stuck trong admin panel
3. Tạo job mới

### Progress không cập nhật

**Nguyên nhân**: Callback URL không đúng hoặc Django backend không accessible

**Giải pháp**:
1. Kiểm tra Django đang chạy
2. Kiểm tra logs của scraper service
3. Verify callback URLs trong `scrape_views.py`

## Models

### ScrapeJob Model (MongoDB)

```python
{
  "_id": ObjectId,
  "urls": ["url1", "url2"],  # JSONField
  "status": "pending|processing|completed|failed",
  "totalUrls": 10,
  "processedUrls": 5,
  "progress": 50,  # 0-100
  "jobCount": 50,  # Number of jobs scraped
  "currentUrl": "https://...",
  "errorMessage": null,
  "metadata": {},
  "createdAt": DateTime,
  "completedAt": DateTime
}
```

## Performance

- **Rate Limiting**: 1-3 giây giữa mỗi request để tránh bị block
- **Threading**: Mỗi job chạy trong thread riêng
- **Timeout**: Request timeout 30 giây
- **Callback**: Gửi progress update sau mỗi URL được xử lý

## Security

- Admin authentication required để truy cập scrape endpoints
- Role check: Chỉ user có `role='admin'` mới có quyền
- CSRF protection via Django cookies
- Input validation cho URLs

## Giới Hạn

- Tối đa 50 URLs mỗi lần upload (có thể điều chỉnh)
- Không lưu trữ kết quả crawl (cần extend code để lưu vào JobDetail model)
- Scraper service không có queue system (chạy tuần tự)

## Future Improvements

1. **Queue System**: Sử dụng Celery/Redis để xử lý nhiều jobs song song
2. **Result Storage**: Tự động lưu jobs vào JobDetail collection
3. **Job Scheduling**: Hỗ trợ cron jobs để crawl định kỳ
4. **Webhook Support**: Gửi thông báo khi job hoàn thành
5. **Retry Logic**: Tự động retry failed URLs
6. **Rate Limit Config**: Cho phép config delay time qua UI

---

**Liên hệ**: Nếu có vấn đề, check Django logs và Scraper service terminal output
