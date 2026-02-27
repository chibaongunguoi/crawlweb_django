
from django.urls import include, path
from .views import (
    getJobDetail, login, get_user, logout, register,
    user_profile, upload_cv, get_companies, update_company,
    user_applications, application_detail, company_applications,
    user_favorites, delete_favorite, change_password
)
from .admin_views import (
    admin_stats, admin_get_users, admin_delete_user,
    admin_get_jobs, admin_delete_job, admin_update_job,
    admin_companies, admin_company_detail,
    admin_get_notifications, admin_delete_notification
)
from .scrape_views import (
    scrape_upload, scrape_progress, scrape_result,
    scrape_status, scrape_jobs, scrape_delete_job
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
    path("user/profile/upload-cv/", upload_cv, name="upload_cv"),
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
    
    # Admin Routes
    path("admin/stats/", admin_stats, name="admin_stats"),
    path("admin/users/", admin_get_users, name="admin_get_users"),
    path("admin/users/count/", admin_get_users, name="admin_users_count"),
    path("admin/users/<str:user_id>/", admin_delete_user, name="admin_delete_user"),
    path("admin/jobs/", admin_get_jobs, name="admin_get_jobs"),
    path("admin/jobs/count/", admin_get_jobs, name="admin_jobs_count"),
    path("admin/jobs/<str:job_id>/", admin_delete_job, name="admin_delete_job"),
    path("admin/jobs/<str:job_id>/update/", admin_update_job, name="admin_update_job"),
    path("admin/companies-list/", admin_companies, name="admin_companies"),
    path("admin/companies-list/count/", admin_companies, name="admin_companies_count"),
    path("admin/companies-list/<str:company_id>/", admin_company_detail, name="admin_company_detail"),
    path("admin/notifications/", admin_get_notifications, name="admin_get_notifications"),
    path("admin/notifications/<str:notification_id>/", admin_delete_notification, name="admin_delete_notification"),
    
    # Scrape Routes
    path("scrape/upload/", scrape_upload, name="scrape_upload"),
    path("scrape/progress/", scrape_progress, name="scrape_progress"),
    path("scrape/result/", scrape_result, name="scrape_result"),
    path("scrape/status/<str:job_id>/", scrape_status, name="scrape_status"),
    path("scrape/jobs/", scrape_jobs, name="scrape_jobs"),
    path("scrape/jobs/<str:job_id>/", scrape_delete_job, name="scrape_delete_job"),
]
