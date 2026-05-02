from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from .models import ScrapeJob, JobDetail
from .job_utils import (
    parse_deadline_value,
    extract_deadline_from_job_info,
    normalize_job_info_dates,
    strip_redundant_deadline_info,
)
from .scrape_queue import get_scrape_queue, compute_next_run
from .models import ScrapeSchedule
from datetime import datetime
from django.utils import timezone
import logging
import os
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

SCRAPE_MAX_RETRIES = int(os.getenv('SCRAPE_MAX_RETRIES', '3'))
SCRAPE_RETRY_DELAY = int(os.getenv('SCRAPE_RETRY_DELAY', '30'))


# Normalize known hostnames to stable source names.
SOURCE_HOST_MAPPING = {
    'devwork.vn': 'devwork',
    'www.devwork.vn': 'devwork',
    'devwork.com': 'devwork',
    'www.devwork.com': 'devwork',
    'jobs.devwork.com': 'devwork',
    'jobs.devwork.vn': 'devwork',
    'devwork.example': 'devwork',
    'topcv.vn': 'topcv',
    'www.topcv.vn': 'topcv',
    'itworks.asia': 'itworks',
    'www.itworks.asia': 'itworks',
    'itwork.asia': 'itworks',
    'www.itwork.asia': 'itworks',
}


def extract_source(url):
    """Extract a compact source name from URL host, fallback to unknown."""
    if not url:
        return 'unknown'

    try:
        parsed = urlparse(url)
        hostname = parsed.hostname

        # Handle URLs without scheme, e.g. "example.com/jobs".
        if not hostname:
            parsed = urlparse(f'//{url}')
            hostname = parsed.hostname

        if not hostname:
            return 'unknown'

        hostname = hostname.lower().strip()
        normalized_host = hostname[4:] if hostname.startswith('www.') else hostname

        # 1) Exact mapping first.
        if hostname in SOURCE_HOST_MAPPING:
            return SOURCE_HOST_MAPPING[hostname]
        if normalized_host in SOURCE_HOST_MAPPING:
            return SOURCE_HOST_MAPPING[normalized_host]

        # 2) Keyword/domain-family fallback for known sources.
        if 'devwork' in normalized_host:
            return 'devwork'
        if 'topcv' in normalized_host:
            return 'topcv'

        # 3) Generic fallback: use first domain label.
        if '.' in normalized_host:
            return normalized_host.split('.')[0]

        return normalized_host or 'unknown'
    except Exception:
        return 'unknown'


def _parse_progress_payload(payload: dict):
    """Support both nested and flat progress payload formats."""
    metadata = payload.get('metadata', {}) or {}
    data = payload.get('data', {}) or {}

    # Preferred shape (nested): {metadata: {jobId}, data: {processed, currentUrl, progress}}
    job_id = metadata.get('jobId')
    processed = data.get('processed', data.get('processedUrls'))
    current_url = data.get('currentUrl')
    progress = data.get('progress')

    # Backward-compatible flat shape: {jobId, processedUrls, currentUrl, progress}
    if not job_id:
        job_id = payload.get('jobId')
    if processed is None:
        processed = payload.get('processedUrls', payload.get('processed'))
    if current_url is None:
        current_url = payload.get('currentUrl')
    if progress is None:
        progress = payload.get('progress')

    return job_id, processed, current_url, progress


@api_view(['POST'])
def scrape_upload(request):
    """Upload URLs for scraping"""
    try:
        urls = request.data.get('urls', [])
        
        # Validate input
        if not isinstance(urls, list) or len(urls) == 0:
            return Response(
                {'error': 'URLs must be a non-empty array'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Filter and validate URLs
        valid_urls = [url.strip() for url in urls if url and url.strip()]
        
        if len(valid_urls) == 0:
            return Response(
                {'error': 'No valid URLs provided'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Create scrape job
        scrape_job = ScrapeJob.objects.create(
            urls=valid_urls,
            status='queued',
            totalUrls=len(valid_urls),
            processedUrls=0,
            progress=0,
            retryCount=0,
            maxRetries=SCRAPE_MAX_RETRIES,
            retryDelay=SCRAPE_RETRY_DELAY,
        )
        
        job_id = scrape_job.pk
        logger.info(f"Created scrape job with ID: {job_id}")
        
        host = request.get_host()
        protocol = 'https' if request.is_secure() else 'http'
        base_url = f'{protocol}://{host}'
        scrape_job.metadata = {
            **(scrape_job.metadata or {}),
            'callbackBaseUrl': base_url,
        }
        scrape_job.save(update_fields=['metadata'])

        queue = get_scrape_queue()
        queue.start()
        queue.enqueue(str(job_id))
        
        return Response({
            'jobId': job_id
        }, status=status.HTTP_200_OK)
    
    except Exception as e:
        logger.error(f"Error in scrape_upload: {str(e)}", exc_info=True)
        return Response(
            {'error': f'Something went wrong: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
def scrape_progress(request):
    """Callback endpoint for scraper progress updates"""
    try:
        data = request.data
        job_id, processed, current_url, progress = _parse_progress_payload(data)
        
        if not job_id:
            return Response(
                {'error': 'Job ID not provided'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            scrape_job = ScrapeJob.objects.get(pk=job_id)
        except ScrapeJob.DoesNotExist:
            return Response(
                {'error': 'Job not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Update progress
        scrape_job.processedUrls = int(processed or 0)
        scrape_job.currentUrl = current_url or ''
        scrape_job.progress = int(progress or 0)
        if scrape_job.status in {'queued', 'retrying', 'pending'}:
            scrape_job.status = 'processing'
        scrape_job.save()
        
        logger.info(f"Updated progress for job {job_id}: {scrape_job.progress}%")
        
        return Response({'success': True}, status=status.HTTP_200_OK)
    
    except Exception as e:
        logger.error(f"Error in scrape_progress: {str(e)}", exc_info=True)
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
def scrape_result(request):
    """Callback endpoint for scraper results"""
    try:
        data = request.data
        job_id = data.get('metadata', {}).get('jobId')
        
        if not job_id:
            return Response(
                {'error': 'Job ID not provided'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            scrape_job = ScrapeJob.objects.get(pk=job_id)
        except ScrapeJob.DoesNotExist:
            return Response(
                {'error': 'Job not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Process result
        result_status = data.get('status', 'error')
        job_urls = data.get('data', [])
        
        if result_status == 'success':
            scrape_job.status = 'completed'
            scrape_job.jobCount = len(job_urls)
            scrape_job.processedUrls = scrape_job.totalUrls
            scrape_job.progress = 100
            scrape_job.lastError = None
            scrape_job.nextRetryAt = None
            
            # Save each job to JobDetail collection
            saved_count = 0
            for job_data in job_urls:
                try:
                    # Check if job already exists by URL
                    url = job_data.get('url')
                    if not url:
                        continue

                    job_info = job_data.get('job_info')
                    normalized_job_info = normalize_job_info_dates(job_info)
                    normalized_job_info = strip_redundant_deadline_info(normalized_job_info)

                    raw_deadline = extract_deadline_from_job_info(normalized_job_info or job_info)
                    if not raw_deadline:
                        raw_deadline = job_data.get('deadline')
                    deadline_value = parse_deadline_value(raw_deadline)
                        
                    # Create or update JobDetail
                    job_detail, created = JobDetail.objects.update_or_create(
                        url=url,
                        defaults={
                            'source': extract_source(url),
                            'thumbnail': job_data.get('thumbnail'),
                            'job_title': job_data.get('job_title', ''),
                            'company_url': job_data.get('company_url'),
                            'company_name': job_data.get('company_name'),
                            'province': job_data.get('province', ''),
                            'salary': job_data.get('salary'),
                            'deadline': deadline_value,
                            'skills': job_data.get('skills', []),
                            'descriptions': job_data.get('descriptions'),
                            'job_info': normalized_job_info,
                        }
                    )
                    saved_count += 1
                    if created:
                        logger.info(f"Created new job: {url}")
                    else:
                        logger.info(f"Updated existing job: {url}")
                except Exception as e:
                    logger.error(f"Error saving job {job_data.get('url')}: {str(e)}")
            
            logger.info(f"Job {job_id} completed with {len(job_urls)} jobs, saved {saved_count} to database")
        else:
            error_message = data.get('message', 'Unknown error')
            logger.error(f"Job {job_id} failed: {error_message}")
            scrape_job.metadata = data.get('metadata', {})
            scrape_job.save(update_fields=['metadata'])
            queue = get_scrape_queue()
            queue.schedule_retry(scrape_job, error_message)
            return Response({'success': True}, status=status.HTTP_200_OK)
        
        scrape_job.completedAt = timezone.now()
        scrape_job.metadata = data.get('metadata', {})
        scrape_job.save()
        
        return Response({'success': True}, status=status.HTTP_200_OK)
    
    except Exception as e:
        logger.error(f"Error in scrape_result: {str(e)}", exc_info=True)
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
def scrape_status(request, job_id):
    """Get status of a scrape job"""
    try:
        try:
            scrape_job = ScrapeJob.objects.get(pk=job_id)
        except ScrapeJob.DoesNotExist:
            return Response(
                {'error': 'Job not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        job_data = {
            'id': str(scrape_job.pk),
            'status': scrape_job.status,
            'totalUrls': scrape_job.totalUrls,
            'processedUrls': scrape_job.processedUrls,
            'progress': scrape_job.progress,
            'jobCount': scrape_job.jobCount,
            'currentUrl': scrape_job.currentUrl,
            'errorMessage': scrape_job.errorMessage,
            'lastError': scrape_job.lastError,
            'retryCount': scrape_job.retryCount,
            'maxRetries': scrape_job.maxRetries,
            'retryDelay': scrape_job.retryDelay,
            'nextRetryAt': scrape_job.nextRetryAt.isoformat() if scrape_job.nextRetryAt else None,
            'lastAttemptAt': scrape_job.lastAttemptAt.isoformat() if scrape_job.lastAttemptAt else None,
            'createdAt': scrape_job.createdAt.isoformat() if scrape_job.createdAt else None,
            'completedAt': scrape_job.completedAt.isoformat() if scrape_job.completedAt else None,
        }
        
        return Response({
            'job': job_data
        }, status=status.HTTP_200_OK)
    
    except Exception as e:
        logger.error(f"Error in scrape_status: {str(e)}", exc_info=True)
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
def scrape_jobs(request):
    """Get list of all scrape jobs"""
    try:
        jobs = ScrapeJob.objects.all().order_by('-createdAt')[:50]  # Last 50 jobs
        
        jobs_data = []
        for job in jobs:
            jobs_data.append({
                'id': str(job.pk),
                'status': job.status,
                'totalUrls': job.totalUrls,
                'processedUrls': job.processedUrls,
                'progress': job.progress,
                'jobCount': job.jobCount,
                'errorMessage': job.errorMessage,
                'lastError': job.lastError,
                'retryCount': job.retryCount,
                'maxRetries': job.maxRetries,
                'retryDelay': job.retryDelay,
                'nextRetryAt': job.nextRetryAt.isoformat() if job.nextRetryAt else None,
                'lastAttemptAt': job.lastAttemptAt.isoformat() if job.lastAttemptAt else None,
                'createdAt': job.createdAt.isoformat() if job.createdAt else None,
                'completedAt': job.completedAt.isoformat() if job.completedAt else None,
                'urls': job.urls,
            })
        
        return Response({
            'jobs': jobs_data
        }, status=status.HTTP_200_OK)
    
    except Exception as e:
        logger.error(f"Error in scrape_jobs: {str(e)}", exc_info=True)
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['DELETE'])
def scrape_delete_job(request, job_id):
    """Delete a scrape job"""
    try:
        try:
            scrape_job = ScrapeJob.objects.get(pk=job_id)
        except ScrapeJob.DoesNotExist:
            return Response(
                {'error': 'Job not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        scrape_job.delete()
        
        return Response({
            'success': True,
            'message': 'Job deleted successfully'
        }, status=status.HTTP_200_OK)
    
    except Exception as e:
        logger.error(f"Error in scrape_delete_job: {str(e)}", exc_info=True)
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
def scrape_retry_job(request, job_id):
    """Manually retry a scrape job."""
    try:
        try:
            scrape_job = ScrapeJob.objects.get(pk=job_id)
        except ScrapeJob.DoesNotExist:
            return Response(
                {'error': 'Job not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        scrape_job.status = 'queued'
        scrape_job.retryCount = 0
        scrape_job.errorMessage = None
        scrape_job.lastError = None
        scrape_job.nextRetryAt = None
        scrape_job.completedAt = None
        scrape_job.save(update_fields=[
            'status',
            'retryCount',
            'errorMessage',
            'lastError',
            'nextRetryAt',
            'completedAt',
        ])

        queue = get_scrape_queue()
        queue.start()
        queue.enqueue(str(scrape_job.pk))

        return Response({'success': True}, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Error retrying job: {str(e)}", exc_info=True)
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET', 'POST'])
def scrape_schedules(request):
    """List or create scrape schedules."""
    if request.method == 'GET':
        schedules = ScrapeSchedule.objects.all().order_by('-createdAt')
        data = []
        for schedule in schedules:
            data.append({
                'id': str(schedule.pk),
                'name': schedule.name,
                'urls': schedule.urls,
                'scheduleType': schedule.scheduleType,
                'dayOfWeek': schedule.dayOfWeek,
                'timeOfDay': schedule.timeOfDay,
                'cronExpression': schedule.cronExpression,
                'active': schedule.active,
                'lastRunAt': schedule.lastRunAt.isoformat() if schedule.lastRunAt else None,
                'nextRunAt': schedule.nextRunAt.isoformat() if schedule.nextRunAt else None,
                'createdAt': schedule.createdAt.isoformat() if schedule.createdAt else None,
                'updatedAt': schedule.updatedAt.isoformat() if schedule.updatedAt else None,
            })

        return Response({'schedules': data}, status=status.HTTP_200_OK)

    try:
        payload = request.data or {}
        urls = payload.get('urls') or []
        if not isinstance(urls, list) or not urls:
            return Response({'error': 'URLs must be a non-empty array'}, status=status.HTTP_400_BAD_REQUEST)

        schedule_type = (payload.get('scheduleType') or 'weekly').strip().lower()
        if schedule_type not in {'daily', 'weekly', 'cron'}:
            schedule_type = 'weekly'

        schedule = ScrapeSchedule.objects.create(
            name=payload.get('name'),
            urls=urls,
            scheduleType=schedule_type,
            dayOfWeek=payload.get('dayOfWeek'),
            timeOfDay=payload.get('timeOfDay') or '09:00',
            cronExpression=payload.get('cronExpression'),
            active=bool(payload.get('active', True)),
        )

        schedule.nextRunAt = compute_next_run(schedule)
        if schedule_type == 'cron' and schedule.nextRunAt is None:
            schedule.delete()
            return Response({'error': 'Cron expression invalid or croniter missing'}, status=status.HTTP_400_BAD_REQUEST)

        schedule.save(update_fields=['nextRunAt'])

        return Response({'id': str(schedule.pk)}, status=status.HTTP_201_CREATED)
    except Exception as e:
        logger.error(f"Error creating schedule: {str(e)}", exc_info=True)
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['PUT', 'DELETE'])
def scrape_schedule_detail(request, schedule_id):
    """Update or delete a scrape schedule."""
    try:
        schedule = ScrapeSchedule.objects.get(pk=schedule_id)
    except ScrapeSchedule.DoesNotExist:
        return Response({'error': 'Schedule not found'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'DELETE':
        schedule.delete()
        return Response({'success': True}, status=status.HTTP_200_OK)

    payload = request.data or {}
    if 'name' in payload:
        schedule.name = payload.get('name')
    if 'urls' in payload:
        schedule.urls = payload.get('urls') or []
    if 'scheduleType' in payload:
        schedule.scheduleType = payload.get('scheduleType')
    if 'dayOfWeek' in payload:
        schedule.dayOfWeek = payload.get('dayOfWeek')
    if 'timeOfDay' in payload:
        schedule.timeOfDay = payload.get('timeOfDay') or schedule.timeOfDay
    if 'cronExpression' in payload:
        schedule.cronExpression = payload.get('cronExpression')
    if 'active' in payload:
        schedule.active = bool(payload.get('active'))

    schedule.nextRunAt = compute_next_run(schedule)
    if schedule.scheduleType == 'cron' and schedule.nextRunAt is None:
        return Response({'error': 'Cron expression invalid or croniter missing'}, status=status.HTTP_400_BAD_REQUEST)

    schedule.save()

    return Response({'success': True}, status=status.HTTP_200_OK)


@api_view(['POST'])
def scrape_schedule_toggle(request, schedule_id):
    """Toggle schedule active status."""
    try:
        schedule = ScrapeSchedule.objects.get(pk=schedule_id)
    except ScrapeSchedule.DoesNotExist:
        return Response({'error': 'Schedule not found'}, status=status.HTTP_404_NOT_FOUND)

    schedule.active = not schedule.active
    schedule.nextRunAt = compute_next_run(schedule) if schedule.active else None
    schedule.save(update_fields=['active', 'nextRunAt'])

    return Response({'success': True, 'active': schedule.active}, status=status.HTTP_200_OK)
