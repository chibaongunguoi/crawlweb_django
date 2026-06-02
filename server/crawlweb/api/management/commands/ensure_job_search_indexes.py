from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = "Create MongoDB indexes for JobDetail advanced search."

    def handle(self, *args, **options):
        collection = connection.get_collection("api_jobdetail")

        # MongoDB permits only one text index per collection. Keep the field
        # weights aligned with the search API relevance intent.
        collection.create_index(
            [
                ("job_title", "text"),
                ("descriptions", "text"),
                ("skills", "text"),
            ],
            name="jobdetail_text_search",
            weights={
                "job_title": 10,
                "skills": 8,
                "descriptions": 3,
            },
            default_language="none",
            background=True,
        )

        collection.create_index([("province", 1)], name="jobdetail_province_idx", background=True)
        collection.create_index([("company_name", 1)], name="jobdetail_company_name_idx", background=True)
        collection.create_index([("source", 1)], name="jobdetail_source_idx", background=True)
        collection.create_index([("deadline", 1)], name="jobdetail_deadline_idx", background=True)
        collection.create_index([("collected_at", -1)], name="jobdetail_collected_at_idx", background=True)
        collection.create_index(
            [("url_hash", 1)],
            name="jobdetail_url_hash_idx",
            unique=True,
            sparse=True,
            background=True,
        )

        self.stdout.write(self.style.SUCCESS("JobDetail search indexes ensured."))