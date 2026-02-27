from django.db import models

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
