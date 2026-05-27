from django.apps import AppConfig
import os
import sys


class ApiConfig(AppConfig):
    default_auto_field = 'django_mongodb_backend.fields.ObjectIdAutoField'
    name = 'api'

    def ready(self):
        skip_commands = {'migrate', 'makemigrations', 'collectstatic', 'shell', 'test'}
        if any(cmd in sys.argv for cmd in skip_commands):
            return

        if os.getenv('SCRAPE_QUEUE_DISABLED') == '1':
            return

        # Avoid double-start on Django autoreload.
        run_main = os.environ.get('RUN_MAIN')
        if run_main not in (None, 'true'):
            return

        from .scrape_queue import start_scrape_queue

        start_scrape_queue()
