
from django.urls import include, path
from .views import getJobDetail

urlpatterns = [
    # path("", include("rest_framework.urls")),
    path("jobs/", getJobDetail, name="recent_jobs"),

]
