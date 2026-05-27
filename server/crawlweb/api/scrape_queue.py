from __future__ import annotations

import os
import queue
import threading
import time
from datetime import datetime, timedelta

import requests
from django.utils import timezone

from .models import ScrapeJob, ScrapeSchedule

try:
    from croniter import croniter
except Exception:  # pragma: no cover - croniter optional at import time
    croniter = None


SCRAPER_HOST = os.getenv('SCRAPER_HOST', 'localhost')
SCRAPER_PORT = os.getenv('SCRAPER_PORT', '37001')
SCRAPER_URL = f'http://{SCRAPER_HOST}:{SCRAPER_PORT}/api/scrape'
CALLBACK_BASE_URL = os.getenv('SCRAPER_CALLBACK_BASE_URL', 'http://localhost:8000')
SCRAPE_CONCURRENCY = int(os.getenv('SCRAPE_CONCURRENCY', '2'))
SCRAPE_MAX_RETRIES = int(os.getenv('SCRAPE_MAX_RETRIES', '3'))
SCRAPE_RETRY_DELAY = int(os.getenv('SCRAPE_RETRY_DELAY', '30'))
SCRAPE_SCHEDULE_POLL_SECONDS = int(os.getenv('SCRAPE_SCHEDULE_POLL_SECONDS', '30'))
SCRAPE_RETRY_POLL_SECONDS = int(os.getenv('SCRAPE_RETRY_POLL_SECONDS', '10'))
SCRAPE_REQUEST_TIMEOUT = int(os.getenv('SCRAPE_REQUEST_TIMEOUT', '10'))


_def_queue_lock = threading.Lock()
_def_queue = None


def compute_retry_delay(retry_count: int, base_delay: int) -> int:
    if retry_count <= 0:
        return base_delay
    return int(base_delay * (2 ** (retry_count - 1)))


def _parse_time_of_day(value: str) -> tuple[int, int]:
    try:
        hour_str, minute_str = value.split(':', 1)
        return int(hour_str), int(minute_str)
    except Exception:
        return 9, 0


def compute_next_run(schedule: ScrapeSchedule, start_from: datetime | None = None) -> datetime | None:
    now = start_from or timezone.now()

    if schedule.scheduleType == 'cron' and schedule.cronExpression:
        if croniter is None:
            return None
        iterator = croniter(schedule.cronExpression, now)
        return iterator.get_next(datetime)

    hour, minute = _parse_time_of_day(schedule.timeOfDay or '09:00')

    if schedule.scheduleType == 'daily':
        candidate = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if candidate <= now:
            candidate += timedelta(days=1)
        return candidate

    # Default weekly schedule.
    day_of_week = schedule.dayOfWeek if schedule.dayOfWeek is not None else 0
    delta_days = (day_of_week - now.weekday()) % 7
    candidate = now + timedelta(days=delta_days)
    candidate = candidate.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if candidate <= now:
        candidate += timedelta(days=7)
    return candidate


class ScrapeQueueManager:
    def __init__(self):
        self.queue = queue.Queue()
        self.running = False
        self._threads: list[threading.Thread] = []
        self._lock = threading.Lock()

    def start(self):
        with self._lock:
            if self.running:
                return
            self.running = True

            for _ in range(max(1, SCRAPE_CONCURRENCY)):
                worker = threading.Thread(target=self._worker_loop, daemon=True)
                worker.start()
                self._threads.append(worker)

            retry_worker = threading.Thread(target=self._retry_loop, daemon=True)
            retry_worker.start()
            self._threads.append(retry_worker)

            schedule_worker = threading.Thread(target=self._schedule_loop, daemon=True)
            schedule_worker.start()
            self._threads.append(schedule_worker)

            self._bootstrap_pending_jobs()

    def enqueue(self, job_id: str):
        self.queue.put(job_id)

    def schedule_retry(self, job: ScrapeJob, error_message: str):
        job.retryCount = (job.retryCount or 0) + 1
        job.lastError = error_message
        job.errorMessage = error_message

        job.maxRetries = job.maxRetries or SCRAPE_MAX_RETRIES
        job.retryDelay = job.retryDelay or SCRAPE_RETRY_DELAY

        max_retries = job.maxRetries
        base_delay = job.retryDelay

        if job.retryCount > max_retries:
            job.status = 'failed'
            job.completedAt = timezone.now()
            job.nextRetryAt = None
            job.save(update_fields=['retryCount', 'lastError', 'errorMessage', 'status', 'completedAt', 'nextRetryAt', 'maxRetries', 'retryDelay'])
            return

        delay_seconds = compute_retry_delay(job.retryCount, base_delay)
        job.status = 'retrying'
        job.nextRetryAt = timezone.now() + timedelta(seconds=delay_seconds)
        job.save(update_fields=['retryCount', 'lastError', 'errorMessage', 'status', 'nextRetryAt', 'maxRetries', 'retryDelay'])

    def _bootstrap_pending_jobs(self):
        for job in ScrapeJob.objects.filter(status__in=['queued', 'retrying', 'pending']):
            self.enqueue(str(job.pk))

    def _worker_loop(self):
        while self.running:
            try:
                job_id = self.queue.get(timeout=1)
            except queue.Empty:
                continue

            try:
                self._process_job(job_id)
            finally:
                self.queue.task_done()

    def _process_job(self, job_id: str):
        try:
            job = ScrapeJob.objects.get(pk=job_id)
        except ScrapeJob.DoesNotExist:
            return

        if job.status in {'processing', 'completed'}:
            return

        job.status = 'processing'
        job.lastAttemptAt = timezone.now()
        job.nextRetryAt = None
        job.save(update_fields=['status', 'lastAttemptAt', 'nextRetryAt'])

        base_url = None
        if isinstance(job.metadata, dict):
            base_url = job.metadata.get('callbackBaseUrl')
        if not base_url:
            base_url = CALLBACK_BASE_URL

        payload = {
            'urls': job.urls,
            'callback_url': f'{base_url}/api/scrape/result/',
            'progress_callback_url': f'{base_url}/api/scrape/progress/',
            'metadata': {
                'jobId': str(job.pk),
                'start_at': time.time(),
            },
        }

        try:
            response = requests.post(SCRAPER_URL, json=payload, timeout=SCRAPE_REQUEST_TIMEOUT)
            response.raise_for_status()
        except Exception as exc:
            self.schedule_retry(job, f'Failed to start scraper service: {exc}')

    def _retry_loop(self):
        while self.running:
            now = timezone.now()
            for job in ScrapeJob.objects.filter(status='retrying', nextRetryAt__lte=now):
                job.status = 'queued'
                job.save(update_fields=['status'])
                self.enqueue(str(job.pk))
            time.sleep(SCRAPE_RETRY_POLL_SECONDS)

    def _schedule_loop(self):
        while self.running:
            now = timezone.now()
            due_schedules = ScrapeSchedule.objects.filter(active=True, nextRunAt__lte=now)

            for schedule in due_schedules:
                job = ScrapeJob.objects.create(
                    urls=schedule.urls,
                    status='queued',
                    totalUrls=len(schedule.urls or []),
                    processedUrls=0,
                    progress=0,
                    retryCount=0,
                    maxRetries=SCRAPE_MAX_RETRIES,
                    retryDelay=SCRAPE_RETRY_DELAY,
                    metadata={'scheduleId': str(schedule.pk)},
                )
                self.enqueue(str(job.pk))

                schedule.lastRunAt = now
                schedule.nextRunAt = compute_next_run(schedule, now + timedelta(seconds=1))
                schedule.save(update_fields=['lastRunAt', 'nextRunAt'])

            time.sleep(SCRAPE_SCHEDULE_POLL_SECONDS)


def get_scrape_queue() -> ScrapeQueueManager:
    global _def_queue
    if _def_queue is None:
        with _def_queue_lock:
            if _def_queue is None:
                _def_queue = ScrapeQueueManager()
    return _def_queue


def start_scrape_queue():
    manager = get_scrape_queue()
    manager.start()
