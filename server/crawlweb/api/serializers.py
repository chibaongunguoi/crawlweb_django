from rest_framework import serializers
from .models import JobDetail, User, UserProfile, Company, Application, Follow, Notification
import json


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'role']


class JobDetailSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    skills = serializers.SerializerMethodField()
    
    class Meta:
        model = JobDetail
        fields = '__all__'
    
    def to_representation(self, instance):
        """Convert the serialized data to include _id field"""
        data = super().to_representation(instance)
        # Ensure _id is set from the primary key
        if 'id' in data:
            data['_id'] = str(data['id'])
        else:
            data['_id'] = str(instance.pk)
        return data
    
    def get_skills(self, obj):
        if isinstance(obj.skills, str):
            try:
                return json.loads(obj.skills) if obj.skills else []
            except (json.JSONDecodeError, ValueError):
                return []
        return obj.skills if obj.skills else []


class UserProfileSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    
    class Meta:
        model = UserProfile
        fields = ['id', 'userID', 'name', 'phone', 'gender', 'birthdate', 'cv', 'description']
        
    def to_representation(self, instance):
        """Convert ObjectId to string"""
        data = super().to_representation(instance)
        if data.get('id'):
            data['id'] = str(data['id'])
        return data


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

class FollowSerializer(serializers.ModelSerializer):
    class Meta:
        model = Follow
        fields = '__all__'


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = '__all__'
