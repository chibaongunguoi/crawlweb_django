from datetime import datetime, timezone


def now():
    return datetime.now(timezone.utc).isoformat()


class JobDetail:
    def __init__(
        self,
        url: str,
        thumbnail=None,
        job_title=None,
        company_url=None,
        company_name=None,
        province=None,
        salary=None,
        deadline=None,
        skills=None,
        descriptions=None,
        job_info=None,
    ):
        self.url = url
        self.thumbnail = thumbnail
        self.job_title = job_title
        self.company_url = company_url
        self.company_name = company_name

        self.province = province
        self.salary = salary
        self.deadline = deadline
        self.skills = skills
        self.descriptions = descriptions
        self.job_info = job_info

        self.collected_at = now()
