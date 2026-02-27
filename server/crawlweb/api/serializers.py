from rest_framework import serializers
from .models import JobDetail, User, UserProfile, Company, Application, Follow
import json


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'role']


class JobDetailSerializer(serializers.ModelSerializer):
    skills = serializers.SerializerMethodField()
    
    class Meta:
        model = JobDetail
        fields = '__all__'
    
    def get_skills(self, obj):
        if isinstance(obj.skills, str):
            try:
                return json.loads(obj.skills) if obj.skills else []
            except (json.JSONDecodeError, ValueError):
                return []
        return obj.skills if obj.skills else []


class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = '__all__'


class CompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = '__all__'


class ApplicationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Application
        fields = '__all__'


class FollowSerializer(serializers.ModelSerializer):
    class Meta:
        model = Follow
        fields = '__all__'