from rest_framework import serializers
from .models import JobDetail
import json

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