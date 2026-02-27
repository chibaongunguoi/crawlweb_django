
from django.urls import include, path
from .views import (
    getJobDetail, login, get_user, logout, register,
    user_profile, get_companies, update_company,
    user_applications, application_detail, company_applications,
    user_favorites, delete_favorite, change_password
)

urlpatterns = [
    # path("", include("rest_framework.urls")),
    path("jobs/", getJobDetail, name="recent_jobs"),
    path("auth/login/", login, name="login"),
    path("auth/register/", register, name="register"),
    path("auth/user/", get_user, name="get_user"),
    path("auth/logout/", logout, name="logout"),
    
    # User profile
    path("user/profile/", user_profile, name="user_profile"),
    path("user/change-password/", change_password, name="change_password"),
    
    # Company
    path("admin/companies/", get_companies, name="get_companies"),
    path("admin/companies/<str:company_id>/", update_company, name="update_company"),
    
    # Applications
    path("user/apply/", user_applications, name="user_applications"),
    path("user/apply/<str:application_id>/", application_detail, name="application_detail"),
    path("company/applications/", company_applications, name="company_applications"),
    
    # Favorites
    path("user/favorites/", user_favorites, name="user_favorites"),
    path("user/favorites/<str:job_id>/", delete_favorite, name="delete_favorite"),
]
