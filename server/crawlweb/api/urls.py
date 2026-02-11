
from django.urls import include, path
from .views import getJobDetail, login, get_user, logout, register

urlpatterns = [
    # path("", include("rest_framework.urls")),
    path("jobs/", getJobDetail, name="recent_jobs"),
    path("auth/login/", login, name="login"),
    path("auth/register/", register, name="register"),
    path("auth/user/", get_user, name="get_user"),
    path("auth/logout/", logout, name="logout"),

]
