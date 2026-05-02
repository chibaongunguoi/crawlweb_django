from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from .models import JobDetail
from .scrape_queue import compute_retry_delay


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
