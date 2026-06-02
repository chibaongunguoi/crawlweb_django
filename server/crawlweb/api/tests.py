from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from .job_url_utils import compute_url_hash, normalize_url
from .models import JobDetail, ScrapeJob, ScrapeSchedule
from .scrape_queue import ScrapeQueueManager, compute_next_run, compute_retry_delay


class JobApiTests(TestCase):
	def setUp(self):
		self.job_one = JobDetail.objects.create(
			url='https://example.com/jobs/1',
			job_title='Python Developer',
			province='Ha Noi',
			company_name='Example Co',
			skills=['Python', 'Django'],
			salary='10-20 triệu',
			deadline=timezone.localdate() + timedelta(days=7),
		)

		self.job_two = JobDetail.objects.create(
			url='https://example.com/jobs/2',
			job_title='Frontend Engineer',
			province='Da Nang',
			company_name='Sample Co',
			skills=['React'],
			salary='15 triệu',
		)

		self.job_three = JobDetail.objects.create(
			url='https://example.com/jobs/3',
			job_title='Backend Engineer',
			province='Ho Chi Minh',
			company_name='Backend Co',
			skills=['Go'],
			salary='20 triệu',
		)

	def test_list_jobs_pagination(self):
		response = self.client.get('/api/jobs/search/?page=1&pageSize=2')
		self.assertEqual(response.status_code, 200)
		payload = response.json()

		self.assertEqual(payload['total'], 3)
		self.assertEqual(payload['totalPages'], 2)
		self.assertEqual(len(payload['items']), 2)

	def test_job_detail_by_id(self):
		response = self.client.get(f'/api/jobs/{self.job_one.pk}/')
		self.assertEqual(response.status_code, 200)
		payload = response.json()

		self.assertEqual(payload['item']['job_title'], 'Python Developer')

	def test_expired_status_fields(self):
		expired_job = JobDetail.objects.create(
			url='https://example.com/jobs/expired',
			job_title='Expired Role',
			province='Ha Noi',
			company_name='Old Co',
			deadline=timezone.localdate() - timedelta(days=2),
		)

		response = self.client.get('/api/jobs/search/?status=expired')
		self.assertEqual(response.status_code, 200)
		payload = response.json()

		job_ids = [item['_id'] for item in payload['items']]
		self.assertIn(str(expired_job.pk), job_ids)

		expired_item = next(item for item in payload['items'] if item['_id'] == str(expired_job.pk))
		self.assertTrue(expired_item['isExpired'])
		self.assertEqual(expired_item['daysLeft'], 0)

	def test_retry_delay_logic(self):
		self.assertEqual(compute_retry_delay(1, 30), 30)
		self.assertEqual(compute_retry_delay(2, 30), 60)


class ScrapeScheduleTests(TestCase):
	def test_compute_next_run_daily(self):
		now = timezone.make_aware(timezone.datetime(2026, 6, 2, 8, 30))
		schedule = ScrapeSchedule(scheduleType='daily', timeOfDay='09:00')

		next_run = compute_next_run(schedule, now)

		self.assertIsNotNone(next_run)
		assert next_run is not None
		self.assertEqual(next_run.hour, 9)
		self.assertEqual(next_run.minute, 0)
		self.assertEqual(next_run.date(), now.date())

	def test_compute_next_run_weekly(self):
		now = timezone.make_aware(timezone.datetime(2026, 6, 2, 10, 0))
		schedule = ScrapeSchedule(scheduleType='weekly', dayOfWeek=2, timeOfDay='09:15')

		next_run = compute_next_run(schedule, now)

		self.assertIsNotNone(next_run)
		assert next_run is not None
		self.assertEqual(next_run.weekday(), 2)
		self.assertEqual(next_run.hour, 9)
		self.assertEqual(next_run.minute, 15)

	def test_compute_next_run_cron(self):
		now = timezone.make_aware(timezone.datetime(2026, 6, 2, 10, 0))
		schedule = ScrapeSchedule(scheduleType='cron', cronExpression='0 12 * * *')

		next_run = compute_next_run(schedule, now)

		self.assertIsNotNone(next_run)
		assert next_run is not None
		self.assertEqual(next_run.hour, 12)
		self.assertEqual(next_run.minute, 0)

	def test_create_schedule_rejects_invalid_itworks_host(self):
		response = self.client.post(
			'/api/scrape/schedules/',
			data={
				'name': 'Invalid host',
				'source': 'itworks',
				'crawlMode': 'crawl_then_scrape',
				'urls': ['https://example.com/job/abc/'],
				'scheduleType': 'daily',
				'timeOfDay': '09:00',
				'active': True,
			},
			content_type='application/json',
		)

		self.assertEqual(response.status_code, 400)

	def test_create_schedule_accepts_valid_itworks_schedule(self):
		response = self.client.post(
			'/api/scrape/schedules/',
			data={
				'name': 'Itworks daily',
				'source': 'itworks',
				'crawlMode': 'crawl_then_scrape',
				'urls': ['https://itworks.asia/job/'],
				'scheduleType': 'daily',
				'timeOfDay': '09:00',
				'maxDetailUrls': 10,
				'active': True,
			},
			content_type='application/json',
		)

		self.assertEqual(response.status_code, 201)
		schedule = ScrapeSchedule.objects.get()
		self.assertEqual(schedule.source, 'itworks')
		self.assertEqual(schedule.crawlMode, 'crawl_then_scrape')
		self.assertEqual(schedule.urls, ['https://itworks.asia/job/'])
		self.assertIsNotNone(schedule.nextRunAt)

	def test_due_schedule_creates_job_and_updates_next_run_once(self):
		now = timezone.now()
		schedule = ScrapeSchedule.objects.create(
			name='Due itworks',
			source='itworks',
			crawlMode='crawl_then_scrape',
			urls=['https://itworks.asia/job/'],
			scheduleType='daily',
			timeOfDay='09:00',
			active=True,
			nextRunAt=now - timedelta(minutes=1),
		)
		manager = ScrapeQueueManager()

		manager.process_due_schedules(now)
		manager.process_due_schedules(now)

		self.assertEqual(ScrapeJob.objects.count(), 1)
		job = ScrapeJob.objects.get()
		self.assertEqual(job.metadata['scheduleId'], str(schedule.pk))
		self.assertEqual(job.metadata['source'], 'itworks')
		self.assertEqual(job.metadata['crawlMode'], 'crawl_then_scrape')

		schedule.refresh_from_db()
		self.assertIsNotNone(schedule.lastRunAt)
		self.assertIsNotNone(schedule.nextRunAt)
		assert schedule.nextRunAt is not None
		self.assertGreater(schedule.nextRunAt, now)


class ScrapeCallbackTests(TestCase):
	def test_scrape_result_update_or_create_by_url_hash_and_updates_crawled_urls_metadata(self):
		first_url = 'https://itworks.asia/job/python-developer/'
		second_url = 'https://itworks.asia/job/python-developer/?utm_source=test'
		normalized_url = normalize_url(first_url)
		url_hash = compute_url_hash(first_url)
		JobDetail.objects.create(
			url=normalized_url,
			url_hash=url_hash,
			job_title='Old title',
			province='Ha Noi',
			company_name='Old Co',
			skills=['Python'],
		)
		job = ScrapeJob.objects.create(
			urls=['https://itworks.asia/job/'],
			status='processing',
			totalUrls=1,
			processedUrls=0,
			progress=0,
			metadata={'jobId': 'placeholder'},
		)

		response = self.client.post(
			'/api/scrape/result/',
			data={
				'status': 'success',
				'metadata': {
					'jobId': str(job.pk),
					'crawledUrls': [first_url, second_url],
					'detailUrls': [first_url, second_url],
				},
				'data': [
					{
						'url': second_url,
						'job_title': 'New title',
						'province': 'Ho Chi Minh',
						'company_name': 'New Co',
						'skills': ['Django'],
					}
				],
			},
			content_type='application/json',
		)

		self.assertEqual(response.status_code, 200)
		self.assertEqual(JobDetail.objects.count(), 1)
		detail = JobDetail.objects.get(url_hash=url_hash)
		self.assertEqual(detail.job_title, 'New title')
		self.assertEqual(detail.source, 'itworks')

		job.refresh_from_db()
		self.assertEqual(job.status, 'completed')
		self.assertEqual(job.urls, [first_url, second_url])
		self.assertEqual(job.metadata['detailUrls'], [first_url, second_url])

	def test_create_schedule_accepts_valid_devwork_host(self):
		response = self.client.post(
			'/api/scrape/schedules/',
			data={
				'name': 'Devwork daily',
				'source': 'devwork',
				'crawlMode': 'crawl_then_scrape',
				'urls': ['https://devwork.vn/viec-lam'],
				'scheduleType': 'daily',
				'timeOfDay': '09:00',
				'active': True,
			},
			content_type='application/json',
		)

		self.assertEqual(response.status_code, 201)
		schedule = ScrapeSchedule.objects.get(name='Devwork daily')
		self.assertEqual(schedule.source, 'devwork')
		self.assertEqual(schedule.urls, ['https://devwork.vn/viec-lam'])

	def test_create_schedule_rejects_invalid_devwork_host(self):
		response = self.client.post(
			'/api/scrape/schedules/',
			data={
				'name': 'Invalid devwork',
				'source': 'devwork',
				'crawlMode': 'crawl_then_scrape',
				'urls': ['https://example.com/viec-lam/123/python'],
				'scheduleType': 'daily',
				'timeOfDay': '09:00',
				'active': True,
			},
			content_type='application/json',
		)

		self.assertEqual(response.status_code, 400)

	def test_create_schedule_uses_default_devwork_seed_when_urls_empty(self):
		response = self.client.post(
			'/api/scrape/schedules/',
			data={
				'name': 'Default devwork seed',
				'source': 'devwork',
				'crawlMode': 'crawl_then_scrape',
				'urls': [],
				'scheduleType': 'daily',
				'timeOfDay': '09:00',
				'active': True,
			},
			content_type='application/json',
		)

		self.assertEqual(response.status_code, 201)
		schedule = ScrapeSchedule.objects.get(name='Default devwork seed')
		self.assertEqual(schedule.urls, ['https://devwork.vn/viec-lam'])

	def test_due_devwork_schedule_creates_job_with_metadata(self):
		now = timezone.now()
		schedule = ScrapeSchedule.objects.create(
			name='Due devwork',
			source='devwork',
			crawlMode='crawl_then_scrape',
			urls=['https://devwork.vn/viec-lam'],
			scheduleType='daily',
			timeOfDay='09:00',
			maxDetailUrls=5,
			active=True,
			nextRunAt=now - timedelta(minutes=1),
		)
		manager = ScrapeQueueManager()

		manager.process_due_schedules(now)

		job = ScrapeJob.objects.get()
		self.assertEqual(job.metadata['scheduleId'], str(schedule.pk))
		self.assertEqual(job.metadata['source'], 'devwork')
		self.assertEqual(job.metadata['crawlMode'], 'crawl_then_scrape')
		self.assertEqual(job.metadata['maxDetailUrls'], 5)
		self.assertIn('scheduledRunAt', job.metadata)

	def test_scrape_result_saves_future_and_today_deadlines_skips_expired(self):
		today = timezone.localdate()
		job = ScrapeJob.objects.create(
			urls=['https://devwork.vn/viec-lam'],
			status='processing',
			totalUrls=3,
			processedUrls=0,
			progress=0,
		)

		response = self.client.post(
			'/api/scrape/result/',
			data={
				'status': 'success',
				'metadata': {
					'jobId': str(job.pk),
					'detailUrls': [
						'https://devwork.vn/viec-lam/1/future',
						'https://devwork.vn/viec-lam/2/today',
						'https://devwork.vn/viec-lam/3/expired',
					],
				},
				'data': [
					{
						'url': 'https://devwork.vn/viec-lam/1/future',
						'job_title': 'Future job',
						'company_name': 'Devwork A',
						'province': 'Ha Noi',
						'deadline': (today + timedelta(days=7)).isoformat(),
					},
					{
						'url': 'https://devwork.vn/viec-lam/2/today',
						'job_title': 'Today job',
						'company_name': 'Devwork B',
						'province': 'Ho Chi Minh',
						'deadline': today.isoformat(),
					},
					{
						'url': 'https://devwork.vn/viec-lam/3/expired',
						'job_title': 'Expired job',
						'company_name': 'Devwork C',
						'province': 'Da Nang',
						'deadline': (today - timedelta(days=1)).isoformat(),
					},
				],
			},
			content_type='application/json',
		)

		self.assertEqual(response.status_code, 200)
		self.assertTrue(JobDetail.objects.filter(job_title='Future job').exists())
		self.assertTrue(JobDetail.objects.filter(job_title='Today job').exists())
		self.assertFalse(JobDetail.objects.filter(job_title='Expired job').exists())
		job.refresh_from_db()
		self.assertEqual(job.jobCount, 2)

	def test_scrape_result_does_not_update_existing_record_when_new_callback_is_expired(self):
		today = timezone.localdate()
		url = 'https://devwork.vn/viec-lam/10/existing'
		url_hash = compute_url_hash(url)
		existing = JobDetail.objects.create(
			url=normalize_url(url),
			url_hash=url_hash,
			job_title='Existing title',
			company_name='Existing Co',
			deadline=today + timedelta(days=10),
		)
		job = ScrapeJob.objects.create(
			urls=[url],
			status='processing',
			totalUrls=1,
			processedUrls=0,
			progress=0,
		)

		response = self.client.post(
			'/api/scrape/result/',
			data={
				'status': 'success',
				'metadata': {'jobId': str(job.pk), 'detailUrls': [url]},
				'data': [
					{
						'url': url,
						'job_title': 'Expired update title',
						'company_name': 'Expired Co',
						'province': 'Ha Noi',
						'deadline': (today - timedelta(days=1)).isoformat(),
					}
				],
			},
			content_type='application/json',
		)

		self.assertEqual(response.status_code, 200)
		existing.refresh_from_db()
		self.assertEqual(existing.job_title, 'Existing title')
		self.assertEqual(existing.company_name, 'Existing Co')
		self.assertEqual(existing.deadline, today + timedelta(days=10))

	def test_scrape_result_url_hash_still_prevents_duplicates_for_devwork(self):
		first_url = 'https://devwork.vn/viec-lam/11/python'
		second_url = 'https://devwork.vn/viec-lam/11/python?utm_source=test'
		job = ScrapeJob.objects.create(
			urls=[first_url],
			status='processing',
			totalUrls=1,
			processedUrls=0,
			progress=0,
		)

		for title, url in [('First title', first_url), ('Second title', second_url)]:
			response = self.client.post(
				'/api/scrape/result/',
				data={
					'status': 'success',
					'metadata': {'jobId': str(job.pk), 'detailUrls': [url]},
					'data': [
						{
							'url': url,
							'job_title': title,
							'company_name': 'Devwork',
							'province': 'Ha Noi',
							'deadline': (timezone.localdate() + timedelta(days=3)).isoformat(),
						}
					],
				},
				content_type='application/json',
			)
			self.assertEqual(response.status_code, 200)

		self.assertEqual(JobDetail.objects.filter(url_hash=compute_url_hash(first_url)).count(), 1)
		self.assertEqual(JobDetail.objects.get(url_hash=compute_url_hash(first_url)).job_title, 'Second title')
