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
from .models import JobDetail, User
from .serializers import JobDetailSerializer, UserSerializer
import bcrypt
import jwt
import datetime
import logging
from django.conf import settings

logger = logging.getLogger(__name__)
@api_view(['GET'])
def getJobDetail(request):
    jobs = JobDetail.objects.all()
    serializer = JobDetailSerializer(jobs, many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)


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
                'role': user.role,
                'id': user_id_str
            }
        }, status=status.HTTP_200_OK)

        # Set httpOnly cookie
        response.set_cookie(
            key='auth',
            value=token,
            httponly=True,
            secure=False,  # Set to True in production with HTTPS
            samesite='Lax',
            max_age=36000,  # 10 hours
            path='/',
            domain='localhost'  # Explicit domain
        )
        
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
                    'role': user.role,
                    'id': str(user.pk)
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
                'id': str(new_user.pk),
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

