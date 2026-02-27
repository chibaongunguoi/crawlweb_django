from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from .models import User, JobDetail, Company, Notification, Application, Follow, UserProfile
from .serializers import (
    UserSerializer, JobDetailSerializer, CompanySerializer, 
    NotificationSerializer, ApplicationSerializer
)
import logging
import bcrypt

logger = logging.getLogger(__name__)


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
            user_dict = {
                'id': str(user.pk),
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
            
            users_data.append(user_dict)
        
        return Response({
            'success': True,
            'users': users_data
        }, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Error getting users: {str(e)}")
        return Response(
            {'error': 'Failed to get users'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['DELETE'])
def admin_delete_user(request, user_id):
    """Delete a user (admin only)"""
    try:
        user = User.objects.get(pk=user_id)
        username = user.username
        
        # Delete related data
        UserProfile.objects.filter(userID=username).delete()
        Application.objects.filter(userID=username).delete()
        Follow.objects.filter(userID=username).delete()
        Notification.objects.filter(userID=username).delete()
        
        # Delete user
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
        logger.error(f"Error deleting user: {str(e)}")
        return Response(
            {'error': 'Failed to delete user'},
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
            job_id = str(job['id'])
            follow_count = Follow.objects.filter(JobDetailID=job_id).count()
            job['followCount'] = follow_count
        
        return Response({
            'success': True,
            'data': jobs_data
        }, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Error getting jobs: {str(e)}")
        return Response(
            {'error': 'Failed to get jobs'},
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
                company_dict = {
                    'id': str(company.pk),
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
            
            return Response({
                'success': True,
                'companies': companies_data,
                'count': len(companies_data)
            }, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Error getting companies: {str(e)}")
            return Response(
                {'error': 'Failed to get companies'},
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
