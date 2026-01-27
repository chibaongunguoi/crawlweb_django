from django.db import models
from django.conf import settings
from django_mongodb_backend.fields import EmbeddedModelField, ArrayField
from django_mongodb_backend.models import EmbeddedModel


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
        ordering = ['-collected_at']

    def __str__(self):
        return f"{self.job_title} - {self.company_name}"
