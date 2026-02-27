from django.db import models
from django.conf import settings
from django_mongodb_backend.fields import EmbeddedModelField, ArrayField
from django_mongodb_backend.models import EmbeddedModel


class User(models.Model):
    username = models.CharField(
        max_length=150,
        unique=True,
        help_text="Tên đăng nhập"
    )
    password = models.CharField(
        max_length=255,
        help_text="Mật khẩu đã hash"
    )
    role = models.CharField(
        max_length=20,
        choices=[
            ('admin', 'Admin'),
            ('user', 'User'),
            ('company', 'Company'),
        ],
        default='user',
        help_text="Vai trò người dùng"
    )

    class Meta:
        db_table = 'User'
        verbose_name = 'User'
        verbose_name_plural = 'Users'

    def __str__(self):
        return f"{self.username} ({self.role})"


class JobDetail(models.Model):
    url = models.URLField(
        max_length=500,
        unique=True,
        db_index=True,
        help_text="URL của công việc"
    )
    thumbnail = models.URLField(
        max_length=500,
        blank=True,
        null=True,
        help_text="URL ảnh thumbnail"
    )
    job_title = models.CharField(
        max_length=255,
        help_text="Tên công việc"
    )
    company_url = models.URLField(
        max_length=500,
        blank=True,
        null=True,
        help_text="URL công ty"
    )
    company_name = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Tên công ty"
    )
    province = models.CharField(
        max_length=100,
        help_text="Tỉnh/thành phố"
    )
    salary = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="Mức lương"
    )
    skills = ArrayField(
        base_field=models.CharField(max_length=100),
        blank=True,
        default=list,
        help_text="Danh sách kỹ năng"
    )
    descriptions = models.JSONField(
        blank=True,
        null=True,
        help_text="Mô tả công việc (Map)"
    )
    job_info = models.JSONField(
        blank=True,
        null=True,
        help_text="Thông tin công việc (Map)"
    )
    collected_at = models.DateTimeField(
        auto_now_add=True,
        help_text="Thời gian thu thập"
    )

    class Meta:
        db_table = 'JobDetail'
        verbose_name = 'Job Detail'
        verbose_name_plural = 'Job Details'

    def __str__(self):
        return f"{self.job_title} - {self.company_name}"


class UserProfile(models.Model):
    userID = models.CharField(
        max_length=255,
        unique=True,
        db_index=True,
        help_text="Username của user"
    )
    name = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Họ và tên"
    )
    phone = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        help_text="Số điện thoại"
    )
    gender = models.CharField(
        max_length=10,
        choices=[
            ('nam', 'Nam'),
            ('nữ', 'Nữ'),
            ('other', 'Khác'),
        ],
        default='nam',
        help_text="Giới tính"
    )
    birthdate = models.DateField(
        blank=True,
        null=True,
        help_text="Ngày sinh"
    )
    cv = models.CharField(
        max_length=500,
        blank=True,
        null=True,
        help_text="Link CV"
    )
    description = models.TextField(
        blank=True,
        null=True,
        help_text="Mô tả bản thân"
    )

    class Meta:
        db_table = 'UserProfile'
        verbose_name = 'User Profile'
        verbose_name_plural = 'User Profiles'

    def __str__(self):
        return f"{self.name or self.userID}"


class Company(models.Model):
    username = models.CharField(
        max_length=150,
        db_index=True,
        help_text="Username của công ty"
    )
    name = models.CharField(
        max_length=255,
        help_text="Tên công ty"
    )
    email = models.EmailField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Email công ty"
    )
    phone = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        help_text="Số điện thoại"
    )
    website = models.URLField(
        max_length=500,
        blank=True,
        null=True,
        help_text="Website công ty"
    )
    address = models.TextField(
        blank=True,
        null=True,
        help_text="Địa chỉ"
    )
    logo = models.CharField(
        max_length=500,
        blank=True,
        null=True,
        help_text="Link logo"
    )
    description = models.TextField(
        blank=True,
        null=True,
        help_text="Mô tả công ty"
    )

    class Meta:
        db_table = 'Company'
        verbose_name = 'Company'
        verbose_name_plural = 'Companies'

    def __str__(self):
        return self.name


class Application(models.Model):
    userID = models.CharField(
        max_length=150,
        db_index=True,
        help_text="Username của người ứng tuyển"
    )
    JobDetailID = models.CharField(
        max_length=255,
        db_index=True,
        help_text="ID của JobDetail"
    )
    status = models.CharField(
        max_length=50,
        default='chưa duyệt',
        help_text="Trạng thái: chưa duyệt, đã duyệt, đã từ chối"
    )
    time = models.DateTimeField(
        auto_now_add=True,
        help_text="Thời gian ứng tuyển"
    )
    content = models.TextField(
        blank=True,
        null=True,
        help_text="Nội dung thông báo từ công ty"
    )

    class Meta:
        db_table = 'Application'
        verbose_name = 'Application'
        verbose_name_plural = 'Applications'
        unique_together = ['userID', 'JobDetailID']

    def __str__(self):
        return f"{self.userID} - {self.JobDetailID}"


class Follow(models.Model):
    userID = models.CharField(
        max_length=150,
        db_index=True,
        help_text="Username của người dùng"
    )
    JobDetailID = models.CharField(
        max_length=255,
        db_index=True,
        help_text="ID của JobDetail"
    )
    time = models.DateTimeField(
        auto_now_add=True,
        help_text="Thời gian lưu"
    )

    class Meta:
        db_table = 'Follow'
        verbose_name = 'Follow'
        verbose_name_plural = 'Follows'
        unique_together = ['userID', 'JobDetailID']

    def __str__(self):
        return f"{self.userID} follows {self.JobDetailID}"


class Notification(models.Model):
    userID = models.CharField(
        max_length=255,
        db_index=True,
        help_text="User ID nhận thông báo"
    )
    JobDetailID = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        db_index=True,
        help_text="ID của JobDetail"
    )
    content = models.TextField(
        help_text="Nội dung thông báo"
    )
    status = models.CharField(
        max_length=20,
        choices=[
            ('chưa đọc', 'Chưa đọc'),
            ('đã đọc', 'Đã đọc'),
        ],
        default='chưa đọc',
        help_text="Trạng thái thông báo"
    )
    createdAt = models.DateTimeField(
        auto_now_add=True,
        help_text="Thời gian tạo"
    )
    updatedAt = models.DateTimeField(
        auto_now=True,
        help_text="Thời gian cập nhật"
    )

    class Meta:
        db_table = 'Notification'
        verbose_name = 'Notification'
        verbose_name_plural = 'Notifications'
        ordering = ['-createdAt']

    def __str__(self):
        return f"Notification for {self.userID}: {self.content[:50]}"


class ScrapeJob(models.Model):
    _id = models.CharField(max_length=24, primary_key=True, db_column='_id', editable=False, blank=True)
    urls = models.JSONField(
        default=list,
        help_text="Danh sách URLs cần crawl"
    )
    status = models.CharField(
        max_length=20,
        choices=[
            ('pending', 'Pending'),
            ('processing', 'Processing'),
            ('completed', 'Completed'),
            ('failed', 'Failed'),
        ],
        default='pending',
        help_text="Trạng thái job"
    )
    jobCount = models.IntegerField(
        default=0,
        help_text="Số lượng jobs đã crawl"
    )
    errorMessage = models.TextField(
        blank=True,
        null=True,
        help_text="Thông báo lỗi"
    )
    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="Metadata bổ sung"
    )
    totalUrls = models.IntegerField(
        default=0,
        help_text="Tổng số URLs"
    )
    processedUrls = models.IntegerField(
        default=0,
        help_text="Số URLs đã xử lý"
    )
    currentUrl = models.CharField(
        max_length=1000,
        blank=True,
        null=True,
        help_text="URL đang xử lý"
    )
    progress = models.IntegerField(
        default=0,
        help_text="Phần trăm hoàn thành (0-100)"
    )
    createdAt = models.DateTimeField(
        auto_now_add=True,
        help_text="Thời gian tạo"
    )
    completedAt = models.DateTimeField(
        blank=True,
        null=True,
        help_text="Thời gian hoàn thành"
    )

    class Meta:
        db_table = 'ScrapeJob'
        verbose_name = 'Scrape Job'
        verbose_name_plural = 'Scrape Jobs'
        ordering = ['-createdAt']

    def __str__(self):
        return f"ScrapeJob {self.pk} - {self.status} ({self.processedUrls}/{self.totalUrls})"
    
    def save(self, *args, **kwargs):
        if not self._id:
            from bson import ObjectId
            self._id = str(ObjectId())
        super().save(*args, **kwargs)

