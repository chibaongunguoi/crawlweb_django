from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from .models import ScrapeJob, JobDetail
from datetime import datetime
import logging
import requests
import os

logger = logging.getLogger(__name__)

# Scraper service config
SCRAPER_HOST = os.getenv('SCRAPER_HOST', 'localhost')
SCRAPER_PORT = os.getenv('SCRAPER_PORT', '37001')
SCRAPER_URL = f'http://{SCRAPER_HOST}:{SCRAPER_PORT}/api/scrape'


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
            status='processing',
            totalUrls=len(valid_urls),
            processedUrls=0,
            progress=0
        )
        
        job_id = scrape_job.pk
        logger.info(f"Created scrape job with ID: {job_id}")
        
        # Get current host for callback
        host = request.get_host()
        protocol = 'https' if request.is_secure() else 'http'
        base_url = f'{protocol}://{host}'
        
        # Call scraper service asynchronously
        try:
            scraper_data = {
                'urls': valid_urls,
                'callback_url': f'{base_url}/api/scrape/result/',
                'progress_callback_url': f'{base_url}/api/scrape/progress/',
                'metadata': {
                    'jobId': job_id,
                    'start_at': datetime.now().timestamp()
                }
            }
            
            logger.info(f"Calling scraper at {SCRAPER_URL}")
            logger.info(f"Scraper data: {scraper_data}")
            
            # Fire and forget - don't wait for response
            requests.post(
                SCRAPER_URL,
                json=scraper_data,
                timeout=5
            )
        except Exception as e:
            logger.error(f"Error calling scraper: {str(e)}")
            scrape_job.status = 'failed'
            scrape_job.errorMessage = f'Failed to start scraper service: {str(e)}'
            scrape_job.completedAt = datetime.now()
            scrape_job.save()
        
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
        
        # Update progress
        progress_data = data.get('data', {})
        scrape_job.processedUrls = progress_data.get('processed', 0)
        scrape_job.currentUrl = progress_data.get('currentUrl', '')
        scrape_job.progress = progress_data.get('progress', 0)
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
            
            logger.info(f"Job {job_id} completed with {len(job_urls)} jobs")
        else:
            scrape_job.status = 'failed'
            scrape_job.errorMessage = data.get('message', 'Unknown error')
            logger.error(f"Job {job_id} failed: {scrape_job.errorMessage}")
        
        scrape_job.completedAt = datetime.now()
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
                'createdAt': job.createdAt.isoformat() if job.createdAt else None,
                'completedAt': job.completedAt.isoformat() if job.completedAt else None,
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
