# from django.http import HttpResponse
# from django.shortcuts import render

# from .models import JobDetail

# def index(request):
#     return HttpResponse("Hello, world. You're at the application index.")

# def recent_jobs(request):
#     jobs = JobDetail.objects.order_by("-collected_at")[:5]
#     return render(request, "api/recent_jobs.html", {"jobs": jobs})


from urllib import request
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from .models import JobDetail, User, UserProfile, Company, Application, Follow
from .serializers import JobDetailSerializer, UserSerializer, UserProfileSerializer, CompanySerializer, ApplicationSerializer, FollowSerializer
import bcrypt
import jwt
import datetime
import logging
import os
from django.conf import settings
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from bson import ObjectId

logger = logging.getLogger(__name__)
@api_view(['GET'])
def getJobDetail(request):
    jobs = JobDetail.objects.all()
    serializer = JobDetailSerializer(jobs, many=True)
    return Response({'data': serializer.data}, status=status.HTTP_200_OK)


@api_view(['POST'])
def login(request):
    try:
        username = request.data.get('username')
        password = request.data.get('password')
        
        logger.info(f"Login attempt for user: {username}")

        if not username or not password:
            return Response(
                {'error': 'Username and password are required.'}, 
                status=status.HTTP_400_BAD_REQUEST
            )

        # Find user by username
        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            return Response(
                {'error': 'Bad credentials.'}, 
                status=status.HTTP_401_UNAUTHORIZED
            )

        # Verify password
        if not bcrypt.checkpw(password.encode('utf-8'), user.password.encode('utf-8')):
            return Response(
                {'error': 'Bad credentials.'}, 
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        logger.info(f"User found: id={user.id}, pk={user.pk}, username={user.username}")

        # Generate JWT token
        expiry = datetime.datetime.utcnow() + datetime.timedelta(hours=10)
        user_id_str = str(user.pk) if user.pk else str(user.id)
        
        logger.info(f"Using userId: {user_id_str}")
        
        token = jwt.encode(
            {
                'username': user.username,
                'role': user.role,
                'userId': user_id_str,
                'exp': expiry
            },
            settings.SECRET_KEY,
            algorithm='HS256'
        )
        
        logger.info(f"Token generated for user: {username}")

        # Determine redirect based on role
        redirect_map = {
            'admin': '/admin',
            'user': '/',
            'company': '/'
        }
        redirect = redirect_map.get(user.role, '/')

        response = Response({
            'success': True,
            'redirect': redirect,
            'user': {
                'username': user.username,
                'role': user.role
            }
        }, status=status.HTTP_200_OK)

        # Set httpOnly cookie
        cookie_domain = request.get_host().split(':')[0]
        if cookie_domain in {'localhost', '127.0.0.1'}:
            cookie_domain = None

        cookie_kwargs = {
            'key': 'auth',
            'value': token,
            'httponly': True,
            'secure': False,  # Set to True in production with HTTPS
            'samesite': 'Lax',
            'max_age': 36000,  # 10 hours
            'path': '/',
        }
        if cookie_domain:
            cookie_kwargs['domain'] = cookie_domain

        response.set_cookie(**cookie_kwargs)
        
        logger.info(f"Cookie set for user: {username}")

        return response

    except Exception as e:
        logger.error(f"Login error: {e}")
        print(f"Login error: {e}")
        return Response(
            {'error': 'Something went wrong.'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
def get_user(request):
    try:
        logger.info(f"Get user request from: {request.META.get('HTTP_ORIGIN')}")
        logger.info(f"All cookies: {request.COOKIES}")
        
        auth_token = request.COOKIES.get('auth')
        logger.info(f"Auth token value: {auth_token}")

        if not auth_token:
            logger.warning("No auth token found in cookies")
            return Response({'user': None}, status=status.HTTP_200_OK)
        
        # Decode JWT token
        try:
            payload = jwt.decode(auth_token, settings.SECRET_KEY, algorithms=['HS256'])
            logger.info(f"Decoded payload: {payload}")
            
            username = payload.get('username')
            if not username:
                logger.warning("No username in token payload")
                return Response({'user': None}, status=status.HTTP_200_OK)
            
            try:
                user = User.objects.get(username=username)
            except User.DoesNotExist:
                logger.warning(f"User not found with username: {username}")
                return Response({'user': None}, status=status.HTTP_200_OK)
            
            logger.info(f"User authenticated: {user.username}")
            
            return Response({
                'user': {
                    'username': user.username,
                    'role': user.role
                }
            }, status=status.HTTP_200_OK)
        except jwt.ExpiredSignatureError:
            logger.warning("Token expired")
            return Response({'user': None}, status=status.HTTP_200_OK)
        except jwt.InvalidTokenError as e:
            logger.warning(f"Invalid token: {e}")
            return Response({'user': None}, status=status.HTTP_200_OK)
            
    except Exception as e:
        logger.error(f"Get user error: {e}", exc_info=True)
        print(f"Get user error: {e}")
        return Response({'user': None}, status=status.HTTP_200_OK)


@api_view(['POST'])
def logout(request):
    try:
        response = Response({
            'success': True,
            'message': 'Logged out successfully'
        }, status=status.HTTP_200_OK)
        
        # Delete the auth cookie
        response.delete_cookie('auth')
        
        return response
    except Exception as e:
        print(f"Logout error: {e}")
        return Response(
            {'error': 'Something went wrong.'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
def register(request):
    try:
        username = request.data.get('username')
        password = request.data.get('password')

        # Validation
        if not username or not password:
            return Response(
                {'error': 'Tên đăng nhập và mật khẩu là bắt buộc'}, 
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validate username length
        if len(username.strip()) < 3:
            return Response(
                {'error': 'Tên đăng nhập phải có ít nhất 3 ký tự'}, 
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validate password length
        if len(password) < 6:
            return Response(
                {'error': 'Mật khẩu phải có ít nhất 6 ký tự'}, 
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check if username already exists
        if User.objects.filter(username=username.strip()).exists():
            return Response(
                {'error': 'Tên đăng nhập đã tồn tại'}, 
                status=status.HTTP_409_CONFLICT
            )

        # Hash password
        hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())

        # Create new user
        new_user = User.objects.create(
            username=username.strip(),
            password=hashed_password.decode('utf-8'),
            role='user'  # Default role
        )

        return Response({
            'success': True,
            'message': 'Đăng ký thành công',
            'user': {
                'username': new_user.username,
                'role': new_user.role
            }
        }, status=status.HTTP_201_CREATED)

    except Exception as e:
        print(f"Registration error: {e}")
        return Response(
            {'error': 'Lỗi server. Vui lòng thử lại sau.'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# Helper function to get user from request cookie
def get_user_from_token(request):
    """Extract and verify user from JWT token in cookie"""
    try:
        auth_token = request.COOKIES.get('auth')
        if not auth_token:
            return None
        
        payload = jwt.decode(auth_token, settings.SECRET_KEY, algorithms=['HS256'])
        username = payload.get('username')
        if not username:
            return None
        
        try:
            user = User.objects.get(username=username)
            return user
        except User.DoesNotExist:
            return None
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


# ==================== USER PROFILE APIs ====================

@api_view(['POST'])
def upload_cv(request):
    """Upload CV file"""
    user = get_user_from_token(request)
    if not user:
        return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)
    
    if 'cv' not in request.FILES:
        return Response({'error': 'No file uploaded'}, status=status.HTTP_400_BAD_REQUEST)
    
    cv_file = request.FILES['cv']
    
    # Validate file type
    if not cv_file.name.endswith('.pdf'):
        return Response({'error': 'Chỉ chấp nhận file PDF'}, status=status.HTTP_400_BAD_REQUEST)
    
    # Validate file size (5MB)
    if cv_file.size > 5 * 1024 * 1024:
        return Response({'error': 'File phải nhỏ hơn 5MB'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        # Create uploads directory if not exists
        upload_dir = os.path.join(settings.MEDIA_ROOT, 'cv')
        os.makedirs(upload_dir, exist_ok=True)
        
        # Generate unique filename
        filename = f"{user.username}_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        file_path = os.path.join('cv', filename)
        
        # Save file
        saved_path = default_storage.save(file_path, ContentFile(cv_file.read()))
        
        # Return URL
        file_url = request.build_absolute_uri(settings.MEDIA_URL + saved_path)
        
        return Response({
            'success': True,
            'url': file_url,
            'filename': filename
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"Upload CV error: {e}")
        return Response({'error': 'Có lỗi khi tải file'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET', 'PUT', 'POST'])
def user_profile(request):
    """Get or update user profile"""
    user = get_user_from_token(request)
    if not user:
        return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)
    
    if request.method == 'GET':
        try:
            profile = UserProfile.objects.get(userID=user.username)
            # Return data directly without serializer to avoid ObjectId issues
            return Response({
                'success': True,
                'data': {
                    'userID': profile.userID,
                    'name': profile.name,
                    'phone': profile.phone,
                    'gender': profile.gender,
                    'birthdate': str(profile.birthdate) if profile.birthdate else None,
                    'cv': profile.cv,
                    'description': profile.description
                }
            }, status=status.HTTP_200_OK)
        except UserProfile.DoesNotExist:
            return Response({'success': True, 'data': None}, status=status.HTTP_200_OK)
        except UserProfile.MultipleObjectsReturned:
            # Handle duplicate records - get the one with data (not empty)
            logger.warning(f"Multiple UserProfile found for {user.username}, cleaning up duplicates")
            profiles = UserProfile.objects.filter(userID=user.username).order_by('-id')
            # Find profile with data (name is not null)
            profile = None
            for p in profiles:
                if p.name:  # Has data
                    profile = p
                    break
            if not profile:
                profile = profiles.first()  # Fallback if all empty
            # Delete duplicates
            UserProfile.objects.filter(userID=user.username).exclude(pk=profile.pk).delete()
            return Response({
                'success': True,
                'data': {
                    'userID': profile.userID,
                    'name': profile.name,
                    'phone': profile.phone,
                    'gender': profile.gender,
                    'birthdate': str(profile.birthdate) if profile.birthdate else None,
                    'cv': profile.cv,
                    'description': profile.description
                }
            }, status=status.HTTP_200_OK)
    
    elif request.method == 'POST':
        # POST: Tạo mới profile (nếu đã có thì cập nhật)
        try:
            logger.info(f"Creating/Updating profile for user: {user.username}")
            logger.info(f"Request data: {request.data}")
            
            # Check if profile exists
            try:
                profile = UserProfile.objects.get(userID=user.username)
                created = False
                logger.info(f"Profile already exists, will update it")
            except UserProfile.DoesNotExist:
                profile = UserProfile(userID=user.username)
                created = True
                logger.info(f"Creating new profile")
            except UserProfile.MultipleObjectsReturned:
                # Handle duplicate records
                logger.warning(f"Multiple UserProfile found for {user.username}, cleaning up duplicates")
                profiles = UserProfile.objects.filter(userID=user.username).order_by('-id')
                profile = None
                for p in profiles:
                    if p.name:
                        profile = p
                        break
                if not profile:
                    profile = profiles.first()
                UserProfile.objects.filter(userID=user.username).exclude(pk=profile.pk).delete()
                created = False
            
            # Update fields
            profile.name = request.data.get('name')
            profile.phone = request.data.get('phone')
            profile.gender = request.data.get('gender', 'nam')
            
            # Handle birthdate
            birthdate = request.data.get('birthdate')
            if birthdate and birthdate.strip():
                profile.birthdate = birthdate
            else:
                profile.birthdate = None
            
            profile.cv = request.data.get('cv', '')
            profile.description = request.data.get('description', '')
            
            # Save
            profile.save()
            
            logger.info(f"Profile {'created' if created else 'updated'} successfully for user: {user.username}")
            
            return Response({
                'success': True,
                'message': 'Thêm thông tin thành công!' if created else 'Cập nhật thông tin thành công!',
                'data': {
                    'userID': profile.userID,
                    'name': profile.name,
                    'phone': profile.phone,
                    'gender': profile.gender,
                    'birthdate': str(profile.birthdate) if profile.birthdate else None,
                    'cv': profile.cv,
                    'description': profile.description
                }
            }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Create/Update profile error: {e}")
            logger.exception("Full traceback:")
            return Response({'error': f'Lỗi khi lưu thông tin: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    elif request.method == 'PUT':
        # PUT: Cập nhật profile (nếu chưa có thì tạo mới)
        try:
            logger.info(f"Updating profile for user: {user.username}")
            logger.info(f"Request data: {request.data}")
            
            # Get or create profile
            try:
                profile = UserProfile.objects.get(userID=user.username)
                created = False
                logger.info(f"Updating existing profile")
            except UserProfile.DoesNotExist:
                profile = UserProfile(userID=user.username)
                created = True
                logger.info(f"Profile not found, creating new one")
            except UserProfile.MultipleObjectsReturned:
                # Handle duplicate records
                logger.warning(f"Multiple UserProfile found for {user.username}, cleaning up duplicates")
                profiles = UserProfile.objects.filter(userID=user.username).order_by('-id')
                profile = None
                for p in profiles:
                    if p.name:
                        profile = p
                        break
                if not profile:
                    profile = profiles.first()
                UserProfile.objects.filter(userID=user.username).exclude(pk=profile.pk).delete()
                created = False
            
            # Update fields
            profile.name = request.data.get('name')
            profile.phone = request.data.get('phone')
            profile.gender = request.data.get('gender', 'nam')
            
            # Handle birthdate
            birthdate = request.data.get('birthdate')
            if birthdate and birthdate.strip():
                profile.birthdate = birthdate
            else:
                profile.birthdate = None
            
            profile.cv = request.data.get('cv', '')
            profile.description = request.data.get('description', '')
            
            # Save
            profile.save()
            
            logger.info(f"Profile {'created' if created else 'updated'} successfully for user: {user.username}")
            
            return Response({
                'success': True,
                'message': 'Thêm thông tin thành công!' if created else 'Cập nhật thông tin thành công!',
                'data': {
                    'userID': profile.userID,
                    'name': profile.name,
                    'phone': profile.phone,
                    'gender': profile.gender,
                    'birthdate': str(profile.birthdate) if profile.birthdate else None,
                    'cv': profile.cv,
                    'description': profile.description
                }
            }, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Update profile error: {e}")
            logger.exception("Full traceback:")
            return Response({'error': f'Lỗi khi cập nhật profile: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ==================== COMPANY APIs ====================

@api_view(['GET'])
def get_companies(request):
    """Get companies by username or name"""
    username = request.GET.get('username')
    name = request.GET.get('name')
    
    try:
        if username:
            companies = Company.objects.filter(username=username)
        elif name:
            companies = Company.objects.filter(name=name)
        else:
            return Response({'error': 'Username or name required'}, status=status.HTTP_400_BAD_REQUEST)
        
        companies_data = []
        for company in companies:
            company_dict = {
                '_id': str(company.pk),
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
        
        return Response({'success': True, 'companies': companies_data}, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Get companies error: {e}")
        return Response({'error': 'Lỗi khi lấy thông tin công ty'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['PUT'])
def update_company(request, company_id):
    """Update company information"""
    user = get_user_from_token(request)
    if not user or user.role != 'company':
        return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)
    
    try:
        company = Company.objects.get(pk=company_id, username=user.username)
        
        # Update fields
        company.name = request.data.get('name', company.name)
        company.email = request.data.get('email', company.email)
        company.phone = request.data.get('phone', company.phone)
        company.website = request.data.get('website', company.website)
        company.address = request.data.get('address', company.address)
        company.logo = request.data.get('logo', company.logo)
        company.description = request.data.get('description', company.description)
        
        company.save()
        
        serializer = CompanySerializer(company)
        return Response({'success': True, 'data': serializer.data}, status=status.HTTP_200_OK)
    except Company.DoesNotExist:
        return Response({'error': 'Company not found'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        logger.error(f"Update company error: {e}")
        return Response({'error': 'Lỗi khi cập nhật thông tin công ty'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ==================== APPLICATION APIs ====================

@api_view(['GET', 'POST'])
def user_applications(request):
    """Get or create user applications"""
    user = get_user_from_token(request)
    if not user:
        return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)
    
    if request.method == 'GET':
        try:
            applications = Application.objects.filter(userID=user.username)
            result = []
            
            for app in applications:
                app_data = {
                    '_id': str(app.pk),
                    'userID': app.userID,
                    'JobDetailID': {},
                    'status': app.status,
                    'time': app.time.isoformat(),
                    'content': app.content
                }
                
                # Get job detail
                try:
                    job = JobDetail.objects.get(pk=app.JobDetailID)
                    app_data['JobDetailID'] = {
                        '_id': str(job.pk),
                        'job_title': job.job_title,
                        'company_name': job.company_name,
                        'province': job.province,
                        'salary': job.salary
                    }
                except JobDetail.DoesNotExist:
                    pass
                
                result.append(app_data)
            
            return Response({'success': True, 'data': result}, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Get applications error: {e}")
            return Response({'error': 'Lỗi khi lấy danh sách ứng tuyển'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    elif request.method == 'POST':
        try:
            # Accept both jobId and JobDetailID parameter names
            job_id = request.data.get('jobId') or request.data.get('JobDetailID')
            if not job_id:
                return Response({'error': 'Job ID required'}, status=status.HTTP_400_BAD_REQUEST)
            
            # Check if already applied
            if Application.objects.filter(userID=user.username, JobDetailID=job_id).exists():
                return Response({'error': 'Bạn đã ứng tuyển công việc này'}, status=status.HTTP_409_CONFLICT)
            
            # Create application
            application = Application.objects.create(
                userID=user.username,
                JobDetailID=job_id,
                status='chưa duyệt'
            )
            
            return Response({'success': True, 'data': {'_id': str(application.pk)}}, status=status.HTTP_201_CREATED)
        except Exception as e:
            logger.error(f"Create application error: {e}")
            return Response({'error': 'Lỗi khi tạo đơn ứng tuyển'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['DELETE', 'PUT'])
def application_detail(request, application_id):
    """Delete or update an application"""
    user = get_user_from_token(request)
    if not user:
        return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)
    
    try:
        application = Application.objects.get(pk=application_id)
        
        # Check permissions
        if user.role == 'user' and application.userID != user.username:
            return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)
        
        if request.method == 'DELETE':
            application.delete()
            return Response({'success': True, 'message': 'Đã xóa đơn ứng tuyển'}, status=status.HTTP_200_OK)
        
        elif request.method == 'PUT':
            # Company can update status
            if user.role == 'company':
                application.status = request.data.get('status', application.status)
                application.content = request.data.get('content', application.content)
                application.save()
                return Response({'success': True}, status=status.HTTP_200_OK)
            else:
                return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)
                
    except Application.DoesNotExist:
        return Response({'error': 'Application not found'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        logger.error(f"Application detail error: {e}")
        return Response({'error': 'Lỗi xử lý đơn ứng tuyển'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
def company_applications(request):
    """Get applications for company's jobs"""
    user = get_user_from_token(request)
    if not user or user.role != 'company':
        return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)
    
    try:
        # Get company info
        companies = Company.objects.filter(username=user.username)
        if not companies:
            return Response({'success': True, 'data': []}, status=status.HTTP_200_OK)
        
        company = companies.first()
        
        # Get all jobs from this company
        jobs = JobDetail.objects.filter(company_name=company.name)
        job_ids = [str(job.pk) for job in jobs]
        
        # Get applications for these jobs
        applications = Application.objects.filter(JobDetailID__in=job_ids)
        
        result = []
        for app in applications:
            app_data = {
                '_id': str(app.pk),
                'userID': {'username': app.userID},
                'JobDetailID': {},
                'status': app.status,
                'time': app.time.isoformat(),
                'content': app.content,
                'userProfile': {}
            }
            
            # Get job detail
            try:
                job = JobDetail.objects.get(pk=app.JobDetailID)
                app_data['JobDetailID'] = {
                    '_id': str(job.pk),
                    'job_title': job.job_title,
                    'company_name': job.company_name
                }
            except JobDetail.DoesNotExist:
                pass
            
            # Get user profile
            try:
                profile = UserProfile.objects.get(userID=app.userID)
                app_data['userProfile'] = {
                    'name': profile.name,
                    'phone': profile.phone,
                    'birthdate': profile.birthdate.isoformat() if profile.birthdate else None,
                    'gender': profile.gender,
                    'cv': profile.cv,
                    'description': profile.description
                }
            except UserProfile.DoesNotExist:
                pass
            
            result.append(app_data)
        
        return Response({'success': True, 'data': result}, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Get company applications error: {e}")
        return Response({'error': 'Lỗi khi lấy danh sách ứng tuyển'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ==================== FAVORITES APIs ====================

@api_view(['GET', 'POST'])
def user_favorites(request):
    """Get or add user favorites"""
    user = get_user_from_token(request)
    if not user:
        return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)
    
    if request.method == 'GET':
        try:
            follows = Follow.objects.filter(userID=user.username)
            result = []
            
            for follow in follows:
                try:
                    job = JobDetail.objects.get(pk=follow.JobDetailID)
                    job_data = JobDetailSerializer(job).data
                    job_data['_id'] = str(job.pk)
                    result.append(job_data)
                except JobDetail.DoesNotExist:
                    pass
            
            return Response({'success': True, 'data': result}, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Get favorites error: {e}")
            return Response({'error': 'Lỗi khi lấy danh sách yêu thích'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    elif request.method == 'POST':
        try:
            job_id = request.data.get('jobId')
            if not job_id:
                return Response({'error': 'Job ID required'}, status=status.HTTP_400_BAD_REQUEST)
            
            # Check if already favorited
            if Follow.objects.filter(userID=user.username, JobDetailID=job_id).exists():
                return Response({'error': 'Đã lưu công việc này'}, status=status.HTTP_409_CONFLICT)
            
            # Create favorite
            follow = Follow.objects.create(
                userID=user.username,
                JobDetailID=job_id
            )
            
            return Response({'success': True, 'isFollowed': True}, status=status.HTTP_201_CREATED)
        except Exception as e:
            # Mongo duplicate key (E11000) can happen with concurrent requests.
            if 'E11000' in str(e):
                return Response({'error': 'Đã lưu công việc này'}, status=status.HTTP_409_CONFLICT)
            logger.error(f"Add favorite error: {e}")
            return Response({'error': 'Lỗi khi lưu công việc'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['DELETE'])
def delete_favorite(request, job_id):
    """Remove job from favorites"""
    user = get_user_from_token(request)
    if not user:
        return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)
    
    try:
        follow = Follow.objects.get(userID=user.username, JobDetailID=job_id)
        follow.delete()
        return Response({'success': True}, status=status.HTTP_200_OK)
    except Follow.DoesNotExist:
        return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        logger.error(f"Delete favorite error: {e}")
        return Response({'error': 'Lỗi khi xóa'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
def follow_count(request):
    """Get follow count for a job"""
    try:
        job_id = request.query_params.get('jobId')
        if not job_id:
            return Response({'error': 'Job ID required'}, status=status.HTTP_400_BAD_REQUEST)
        
        count = Follow.objects.filter(JobDetailID=job_id).count()
        return Response({'success': True, 'count': count}, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Get follow count error: {e}")
        return Response({'error': 'Lỗi khi lấy số lượng yêu thích'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ==================== CHANGE PASSWORD API ====================

@api_view(['POST'])
def change_password(request):
    """Change user password"""
    user = get_user_from_token(request)
    if not user:
        return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)
    
    try:
        current_password = request.data.get('currentPassword')
        new_password = request.data.get('newPassword')
        
        if not current_password or not new_password:
            return Response({'error': 'Passwords required'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Verify current password
        if not bcrypt.checkpw(current_password.encode('utf-8'), user.password.encode('utf-8')):
            return Response({'error': 'Current password is incorrect'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Hash new password
        hashed_password = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt())
        user.password = hashed_password.decode('utf-8')
        user.save()
        
        return Response({'success': True, 'message': 'Đổi mật khẩu thành công'}, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Change password error: {e}")
        return Response({'error': 'Lỗi khi đổi mật khẩu'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
