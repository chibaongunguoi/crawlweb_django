from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Count
from .models import User, JobDetail, Company, Notification, Application, Follow, UserProfile, ScrapeJob
from .serializers import (
    UserSerializer, JobDetailSerializer, CompanySerializer, 
    NotificationSerializer, ApplicationSerializer
)
from collections import Counter
from datetime import datetime, timedelta
from django.utils import timezone
import logging
import bcrypt

logger = logging.getLogger(__name__)


def _resolve_user_by_id_or_username(user_id):
    """Resolve user by primary key first, then fallback to username."""
    try:
        return User.objects.get(pk=user_id)
    except Exception:
        # Mongo backends can raise validation errors for non-ObjectId strings.
        # In that case, fallback to username-based lookup.
        return User.objects.get(username=user_id)


# ============= ADMIN STATS =============
@api_view(['GET'])
def admin_stats(request):
    """Get admin dashboard statistics"""
    try:
        total_users = User.objects.count()
        total_jobs = JobDetail.objects.count()
        total_companies = Company.objects.count()
        
        return Response({
            'success': True,
            'stats': {
                'totalUsers': total_users,
                'totalJobs': total_jobs,
                'totalCompanies': total_companies
            }
        }, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Error getting admin stats: {str(e)}")
        return Response(
            {'error': 'Failed to get statistics'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# ============= USER MANAGEMENT =============
@api_view(['GET'])
def admin_get_users(request):
    """Get all users (admin only)"""
    try:
        users = User.objects.all().order_by('-id')
        
        # Get user profiles for additional info
        users_data = []
        for user in users:
            # Handle ObjectId properly - use _id for MongoDB
            try:
                if hasattr(user, '_id'):
                    user_id = str(user._id)
                elif hasattr(user, 'id') and user.id is not None:
                    user_id = str(user.id)
                elif hasattr(user, 'pk') and user.pk is not None:
                    user_id = str(user.pk)
                else:
                    user_id = user.username  # fallback to username
            except Exception as e:
                logger.warning(f"Error getting ID for user {user.username}: {str(e)}")
                user_id = user.username
            
            user_dict = {
                'id': user_id,
                'username': user.username,
                'role': user.role
            }
            
            # Get profile if exists
            try:
                profile = UserProfile.objects.get(userID=user.username)
                user_dict['profile'] = {
                    'name': profile.name,
                    'phone': profile.phone,
                    'cv': profile.cv
                }
            except UserProfile.DoesNotExist:
                user_dict['profile'] = None
            except Exception as e:
                logger.warning(f"Error getting profile for {user.username}: {str(e)}")
                user_dict['profile'] = None
            
            users_data.append(user_dict)
        
        logger.info(f"Returning {len(users_data)} users")
        
        return Response({
            'success': True,
            'users': users_data
        }, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Error getting users: {str(e)}", exc_info=True)
        return Response(
            {'error': f'Failed to get users: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET', 'PUT', 'DELETE'])
def admin_delete_user(request, user_id):
    """Get, update or delete a user (admin only)."""
    try:
        user = _resolve_user_by_id_or_username(user_id)
        username = user.username

        if request.method == 'GET':
            profile = UserProfile.objects.filter(userID=username).first()
            profile_data = {
                'name': profile.name if profile else '',
                'phone': profile.phone if profile else '',
                'cv': profile.cv if profile else '',
                # Keep these keys for frontend compatibility.
                'email': '',
                'address': profile.description if profile and profile.description else '',
            }

            return Response({
                'success': True,
                'user': {
                    'id': str(getattr(user, 'id', user.pk)),
                    'username': user.username,
                    'role': user.role,
                    'profile': profile_data,
                }
            }, status=status.HTTP_200_OK)

        if request.method == 'PUT':
            data = request.data or {}

            role = data.get('role')
            if role in {'admin', 'user', 'company'}:
                user.role = role
                user.save(update_fields=['role'])

            profile_payload = data.get('profile') or {}
            profile, _ = UserProfile.objects.get_or_create(userID=username)
            profile.name = profile_payload.get('name', profile.name)
            profile.phone = profile_payload.get('phone', profile.phone)
            profile.cv = profile_payload.get('cv', profile.cv)
            # Map UI "address" into existing profile description field.
            if 'address' in profile_payload:
                profile.description = profile_payload.get('address')
            profile.save()

            return Response({
                'success': True,
                'message': 'User updated successfully'
            }, status=status.HTTP_200_OK)

        # DELETE method
        UserProfile.objects.filter(userID=username).delete()
        Application.objects.filter(userID=username).delete()
        Follow.objects.filter(userID=username).delete()
        Notification.objects.filter(userID=username).delete()
        user.delete()

        return Response({
            'success': True,
            'message': 'User deleted successfully'
        }, status=status.HTTP_200_OK)
    except User.DoesNotExist:
        return Response(
            {'error': 'User not found'},
            status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        logger.error(f"Error handling user detail endpoint: {str(e)}")
        return Response(
            {'error': 'Failed to process user request'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# ============= JOB MANAGEMENT =============
@api_view(['GET'])
def admin_get_jobs(request):
    """Get all jobs with follow counts"""
    try:
        jobs = JobDetail.objects.all().order_by('-collected_at')
        serializer = JobDetailSerializer(jobs, many=True)
        
        # Add follow counts
        jobs_data = serializer.data
        for job in jobs_data:
            try:
                job_id = str(job['id'])
                follow_count = Follow.objects.filter(JobDetailID=job_id).count()
                job['followCount'] = follow_count
            except Exception as e:
                logger.warning(f"Error getting follow count for job: {str(e)}")
                job['followCount'] = 0
        
        logger.info(f"Returning {len(jobs_data)} jobs")
        
        return Response({
            'success': True,
            'data': jobs_data
        }, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Error getting jobs: {str(e)}", exc_info=True)
        return Response(
            {'error': f'Failed to get jobs: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['DELETE'])
def admin_delete_job(request, job_id):
    """Delete a job (admin only)"""
    try:
        job = JobDetail.objects.get(pk=job_id)
        
        # Delete related data
        Application.objects.filter(JobDetailID=job_id).delete()
        Follow.objects.filter(JobDetailID=job_id).delete()
        Notification.objects.filter(JobDetailID=job_id).delete()
        
        # Delete job
        job.delete()
        
        return Response({
            'success': True,
            'message': 'Job deleted successfully'
        }, status=status.HTTP_200_OK)
    except JobDetail.DoesNotExist:
        return Response(
            {'error': 'Job not found'},
            status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        logger.error(f"Error deleting job: {str(e)}")
        return Response(
            {'error': 'Failed to delete job'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['PUT'])
def admin_update_job(request, job_id):
    """Update a job (admin only)"""
    try:
        job = JobDetail.objects.get(pk=job_id)
        serializer = JobDetailSerializer(job, data=request.data, partial=True)
        
        if serializer.is_valid():
            serializer.save()
            return Response({
                'success': True,
                'data': serializer.data
            }, status=status.HTTP_200_OK)
        
        return Response({
            'error': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)
    except JobDetail.DoesNotExist:
        return Response(
            {'error': 'Job not found'},
            status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        logger.error(f"Error updating job: {str(e)}")
        return Response(
            {'error': 'Failed to update job'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# ============= COMPANY MANAGEMENT =============
@api_view(['GET', 'POST'])
def admin_companies(request):
    """Get all companies or create new company"""
    if request.method == 'GET':
        try:
            companies = Company.objects.all().order_by('-id')
            
            companies_data = []
            for company in companies:
                try:
                    company_id = str(company.id) if hasattr(company, 'id') else str(company.pk)
                except:
                    company_id = str(company.pk)
                    
                company_dict = {
                    'id': company_id,
                    'name': company.name,
                    'email': company.email,
                    'phone': company.phone,
                    'website': company.website,
                    'logo': company.logo,
                    'description': company.description,
                    'address': company.address,
                    'username': company.username
                }
                companies_data.append(company_dict)
            
            logger.info(f"Returning {len(companies_data)} companies")
            
            return Response({
                'success': True,
                'companies': companies_data,
                'count': len(companies_data)
            }, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Error getting companies: {str(e)}", exc_info=True)
            return Response(
                {'error': f'Failed to get companies: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    elif request.method == 'POST':
        try:
            data = request.data
            
            # Validate required fields
            if not data.get('name'):
                return Response(
                    {'error': 'Tên công ty là bắt buộc'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            if not data.get('username'):
                return Response(
                    {'error': 'Username là bắt buộc'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            if not data.get('password'):
                return Response(
                    {'error': 'Password là bắt buộc'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Check if company name exists
            if Company.objects.filter(name=data['name']).exists():
                return Response(
                    {'error': 'Tên công ty đã tồn tại'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Check if username exists
            if User.objects.filter(username=data['username']).exists():
                return Response(
                    {'error': 'Username đã tồn tại'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Create user account
            hashed_password = bcrypt.hashpw(
                data['password'].encode('utf-8'),
                bcrypt.gensalt()
            ).decode('utf-8')
            
            user = User.objects.create(
                username=data['username'],
                password=hashed_password,
                role='company'
            )
            
            # Create company
            company = Company.objects.create(
                username=data['username'],
                name=data['name'],
                email=data.get('email'),
                phone=data.get('phone'),
                website=data.get('website'),
                logo=data.get('logo'),
                description=data.get('description'),
                address=data.get('address')
            )
            
            return Response({
                'success': True,
                'message': 'Company created successfully',
                'company': {
                    'id': str(company.pk),
                    'name': company.name,
                    'username': company.username
                }
            }, status=status.HTTP_201_CREATED)
        except Exception as e:
            logger.error(f"Error creating company: {str(e)}")
            return Response(
                {'error': f'Failed to create company: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


@api_view(['PUT', 'DELETE'])
def admin_company_detail(request, company_id):
    """Update or delete a company"""
    try:
        company = Company.objects.get(pk=company_id)
        
        if request.method == 'PUT':
            data = request.data
            
            # Update company fields
            if 'name' in data:
                company.name = data['name']
            if 'email' in data:
                company.email = data['email']
            if 'phone' in data:
                company.phone = data['phone']
            if 'website' in data:
                company.website = data['website']
            if 'logo' in data:
                company.logo = data['logo']
            if 'description' in data:
                company.description = data['description']
            if 'address' in data:
                company.address = data['address']
            
            company.save()
            
            return Response({
                'success': True,
                'message': 'Company updated successfully'
            }, status=status.HTTP_200_OK)
        
        elif request.method == 'DELETE':
            username = company.username
            
            # Delete related user account
            try:
                User.objects.filter(username=username).delete()
            except:
                pass
            
            # Delete company
            company.delete()
            
            return Response({
                'success': True,
                'message': 'Company deleted successfully'
            }, status=status.HTTP_200_OK)
    
    except Company.DoesNotExist:
        return Response(
            {'error': 'Company not found'},
            status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        logger.error(f"Error with company: {str(e)}")
        return Response(
            {'error': f'Failed to process request: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# ============= NOTIFICATION MANAGEMENT =============
@api_view(['GET'])
def admin_get_notifications(request):
    """Get all notifications"""
    try:
        notifications = Notification.objects.all().order_by('-createdAt')
        
        notifications_data = []
        for notif in notifications:
            notif_dict = {
                'id': str(notif.pk),
                'userID': notif.userID,
                'JobDetailID': notif.JobDetailID,
                'content': notif.content,
                'status': notif.status,
                'createdAt': notif.createdAt.isoformat() if notif.createdAt else None
            }
            
            # Get user info
            try:
                user = User.objects.get(username=notif.userID)
                profile = UserProfile.objects.get(userID=notif.userID)
                notif_dict['userProfile'] = {
                    'name': profile.name
                }
            except:
                notif_dict['userProfile'] = None
            
            # Get job info
            if notif.JobDetailID:
                try:
                    job = JobDetail.objects.get(pk=notif.JobDetailID)
                    notif_dict['JobDetailID'] = {
                        'job_title': job.job_title
                    }
                except:
                    pass
            
            notifications_data.append(notif_dict)
        
        return Response({
            'success': True,
            'data': notifications_data
        }, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Error getting notifications: {str(e)}")
        return Response(
            {'error': 'Failed to get notifications'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['DELETE'])
def admin_delete_notification(request, notification_id):
    """Delete a notification"""
    try:
        notification = Notification.objects.get(pk=notification_id)
        notification.delete()
        
        return Response({
            'success': True,
            'message': 'Notification deleted successfully'
        }, status=status.HTTP_200_OK)
    except Notification.DoesNotExist:
        return Response(
            {'error': 'Notification not found'},
            status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        logger.error(f"Error deleting notification: {str(e)}")
        return Response(
            {'error': 'Failed to delete notification'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


def _parse_date_range(request):
    from_str = request.query_params.get('from')
    to_str = request.query_params.get('to')
    now = timezone.now()

    def make_aware(value):
        return value if timezone.is_aware(value) else timezone.make_aware(value)

    try:
        from_dt = datetime.strptime(from_str, '%Y-%m-%d') if from_str else (now - timedelta(days=30))
    except ValueError:
        from_dt = now - timedelta(days=30)

    try:
        to_dt = datetime.strptime(to_str, '%Y-%m-%d') if to_str else now
        to_dt = to_dt.replace(hour=23, minute=59, second=59, microsecond=999999)
    except ValueError:
        to_dt = now

    return make_aware(from_dt), make_aware(to_dt)


def _time_bucket(dt, interval):
    if interval == 'month':
        return dt.strftime('%Y-%m')
    if interval == 'week':
        iso_year, iso_week, _ = dt.isocalendar()
        return f"{iso_year}-W{iso_week:02d}"
    return dt.strftime('%Y-%m-%d')


@api_view(['GET'])
def admin_jobs_over_time(request):
    """Aggregate jobs over time by day/week/month."""
    try:
        interval = request.query_params.get('interval', 'day').lower()
        if interval not in {'day', 'week', 'month'}:
            interval = 'day'

        from_dt, to_dt = _parse_date_range(request)
        jobs = JobDetail.objects.filter(collected_at__gte=from_dt, collected_at__lte=to_dt)

        buckets = Counter()
        for job in jobs:
            if not job.collected_at:
                continue
            buckets[_time_bucket(job.collected_at, interval)] += 1

        data = [{'x': key, 'y': buckets[key]} for key in sorted(buckets.keys())]

        return Response({
            'success': True,
            'meta': {
                'interval': interval,
                'from': from_dt.isoformat(),
                'to': to_dt.isoformat(),
            },
            'data': data,
        }, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Error getting jobs over time: {str(e)}", exc_info=True)
        return Response(
            {'error': 'Failed to aggregate jobs over time'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
def admin_top_skills(request):
    """Aggregate top skills from JobDetail.skills array."""
    try:
        from_dt, to_dt = _parse_date_range(request)
        limit = int(request.query_params.get('limit', 20))
        limit = max(1, min(limit, 100))

        jobs = JobDetail.objects.filter(collected_at__gte=from_dt, collected_at__lte=to_dt)
        skill_counter = Counter()

        for job in jobs:
            if not isinstance(job.skills, list):
                continue
            for skill in job.skills:
                if skill and isinstance(skill, str):
                    normalized = skill.strip()
                    if normalized:
                        skill_counter[normalized] += 1

        top = skill_counter.most_common(limit)
        data = [{'label': label, 'value': value} for label, value in top]

        return Response({
            'success': True,
            'data': data,
        }, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Error getting top skills: {str(e)}", exc_info=True)
        return Response(
            {'error': 'Failed to aggregate top skills'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
def admin_follow_counts(request):
    """Top jobs by favorites count."""
    try:
        top = int(request.query_params.get('top', 50))
        top = max(1, min(top, 200))

        grouped = list(
            Follow.objects.values('JobDetailID')
            .annotate(count=Count('id'))
            .order_by('-count')[:top]
        )

        job_ids = [
            item['JobDetailID']
            for item in grouped
            if item.get('JobDetailID') not in (None, '', 'None')
        ]
        jobs = JobDetail.objects.filter(pk__in=job_ids)
        jobs_map = {str(job.pk): job for job in jobs}

        data = []
        for item in grouped:
            job_id = item.get('JobDetailID')
            job = jobs_map.get(str(job_id))
            data.append({
                'jobId': job_id,
                'count': item.get('count', 0),
                'title': job.job_title if job else 'Unknown job',
                'company': job.company_name if job else 'Unknown company',
            })

        return Response({'success': True, 'data': data}, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Error getting follow counts: {str(e)}", exc_info=True)
        return Response(
            {'error': 'Failed to aggregate follow counts'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
def admin_application_counts(request):
    """Top jobs by application count."""
    try:
        top = int(request.query_params.get('top', 50))
        top = max(1, min(top, 200))

        grouped = list(
            Application.objects.values('JobDetailID')
            .annotate(count=Count('id'))
            .order_by('-count')[:top]
        )

        job_ids = [
            item['JobDetailID']
            for item in grouped
            if item.get('JobDetailID') not in (None, '', 'None')
        ]
        jobs = JobDetail.objects.filter(pk__in=job_ids)
        jobs_map = {str(job.pk): job for job in jobs}

        data = []
        for item in grouped:
            job_id = item.get('JobDetailID')
            job = jobs_map.get(str(job_id))
            data.append({
                'jobId': job_id,
                'count': item.get('count', 0),
                'title': job.job_title if job else 'Unknown job',
                'company': job.company_name if job else 'Unknown company',
            })

        return Response({'success': True, 'data': data}, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Error getting application counts: {str(e)}", exc_info=True)
        return Response(
            {'error': 'Failed to aggregate application counts'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
def admin_source_breakdown(request):
    """Breakdown jobs by source domain."""
    try:
        from_dt, to_dt = _parse_date_range(request)
        grouped = list(
            JobDetail.objects.filter(collected_at__gte=from_dt, collected_at__lte=to_dt)
            .values('source')
            .annotate(value=Count('id'))
            .order_by('-value')
        )

        data = [
            {
                'label': item.get('source') or 'unknown',
                'value': item.get('value', 0)
            }
            for item in grouped
        ]

        return Response({'success': True, 'data': data}, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Error getting source breakdown: {str(e)}", exc_info=True)
        return Response(
            {'error': 'Failed to aggregate source breakdown'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
def admin_scraper_health(request):
    """Get scraper status counts for selected period."""
    try:
        period = request.query_params.get('period', '7d').lower()
        period_map = {'7d': 7, '14d': 14, '30d': 30, '90d': 90}
        days = period_map.get(period, 7)
        from_dt = timezone.now() - timedelta(days=days)

        grouped = list(
            ScrapeJob.objects.filter(createdAt__gte=from_dt)
            .values('status')
            .annotate(count=Count('id'))
            .order_by('-count')
        )

        data = [
            {
                'status': item.get('status') or 'unknown',
                'count': item.get('count', 0)
            }
            for item in grouped
        ]

        return Response({'success': True, 'period': period, 'data': data}, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Error getting scraper health: {str(e)}", exc_info=True)
        return Response(
            {'error': 'Failed to aggregate scraper health'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
