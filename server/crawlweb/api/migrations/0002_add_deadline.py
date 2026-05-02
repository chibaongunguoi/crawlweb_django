# Generated migration for adding deadline field to JobDetail

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='jobdetail',
            name='deadline',
            field=models.DateField(
                blank=True,
                null=True,
                db_index=True,
                help_text='Ngày hết hạn nộp đơn'
            ),
        ),
    ]
