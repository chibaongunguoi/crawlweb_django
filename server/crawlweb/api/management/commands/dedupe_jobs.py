from collections import defaultdict

from django.core.management.base import BaseCommand

from ...job_url_utils import compute_url_hash, normalize_url
from ...models import Application, Follow, JobDetail, Notification


class Command(BaseCommand):
    help = "Backfill normalized URLs/url_hash and merge duplicate JobDetail records."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Analyze and report duplicates without modifying data.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        jobs = list(JobDetail.objects.all())

        groups = defaultdict(list)
        for job in jobs:
            normalized_url = normalize_url(job.url)
            url_hash = compute_url_hash(job.url)
            if not normalized_url or not url_hash:
                self.stdout.write(
                    self.style.WARNING(f"Skipping invalid URL for job {job.pk}: {job.url}")
                )
                continue
            groups[url_hash].append((job, normalized_url))

        updated_hashes = 0
        duplicate_groups = 0
        deleted_duplicates = 0

        for url_hash, entries in groups.items():
            entries.sort(key=lambda item: (item[0].collected_at or 0, str(item[0].pk)))
            canonical_job, canonical_url = entries[0]

            if canonical_job.url_hash != url_hash or canonical_job.url != canonical_url:
                updated_hashes += 1
                if not dry_run:
                    canonical_job.url_hash = url_hash
                    canonical_job.url = canonical_url
                    canonical_job.save(update_fields=["url_hash", "url"])

            duplicates = entries[1:]
            if not duplicates:
                continue

            duplicate_groups += 1
            self.stdout.write(
                self.style.WARNING(
                    f"Duplicate group {url_hash}: keep {canonical_job.pk}, merge {len(duplicates)} duplicates"
                )
            )

            for duplicate_job, duplicate_url in duplicates:
                if duplicate_job.url_hash != url_hash or duplicate_job.url != duplicate_url:
                    updated_hashes += 1
                    if not dry_run:
                        duplicate_job.url_hash = url_hash
                        duplicate_job.url = duplicate_url
                        duplicate_job.save(update_fields=["url_hash", "url"])

                if not dry_run:
                    Application.objects.filter(JobDetailID=str(duplicate_job.pk)).update(
                        JobDetailID=str(canonical_job.pk)
                    )
                    Follow.objects.filter(JobDetailID=str(duplicate_job.pk)).update(
                        JobDetailID=str(canonical_job.pk)
                    )
                    Notification.objects.filter(JobDetailID=str(duplicate_job.pk)).update(
                        JobDetailID=str(canonical_job.pk)
                    )
                    duplicate_job.delete()

                deleted_duplicates += 1

        summary = (
            f"Processed {len(jobs)} jobs | "
            f"updated normalized/hash fields: {updated_hashes} | "
            f"duplicate groups: {duplicate_groups} | "
            f"duplicates removed: {deleted_duplicates} | "
            f"dry_run={dry_run}"
        )
        self.stdout.write(self.style.SUCCESS(summary))