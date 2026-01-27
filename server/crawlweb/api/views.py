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
from .models import JobDetail
from .serializers import JobDetailSerializer
@api_view(['GET'])

def getJobDetail(request):
    jobs = JobDetail.objects.all()
    serializer = JobDetailSerializer(jobs, many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)