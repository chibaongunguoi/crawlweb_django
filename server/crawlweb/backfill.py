import os
import sys
from pathlib import Path

import requests

from api.models import JobDetail
from api.scrape_views import extract_source
from api.job_utils import (
    parse_deadline_value,
    extract_deadline_from_job_info,
    normalize_job_info_dates,
)


def _is_plain_text_description(value):
    if not value or not isinstance(value, str):
        return True
    # If no html-like tag exists, assume it was stored as plain text.
    return "<" not in value or ">" not in value


def _normalize_sources():
    scanned = 0
    updated = 0

    for job in JobDetail.objects.all():
        scanned += 1
        src = extract_source(job.url)
        if src and src != job.source:
            job.source = src
            job.save(update_fields=["source"])
            updated += 1

    return scanned, updated


def _refresh_itworks_formatting(timeout=30):
    # Import scraper strategy from sibling "server/scraper" project.
    # When this script is executed via `manage.py shell -c`, __file__ may not
    # point to backfill.py, so resolve path from multiple reliable candidates.
    candidates = []

    file_var = globals().get("__file__")
    if file_var:
        file_path = Path(file_var).resolve()
        candidates.extend(
            [
                file_path.parent.parent / "scraper",  # .../server/scraper
                file_path.parent / "scraper",
            ]
        )

    cwd = Path.cwd().resolve()
    candidates.extend(
        [
            cwd.parent / "scraper",  # when cwd = .../server/crawlweb
            cwd / "server" / "scraper",  # when cwd = repo root
        ]
    )

    scraper_root = None
    for candidate in candidates:
        if (candidate / "src").exists():
            scraper_root = candidate
            break

    if scraper_root is None:
        raise RuntimeError("Cannot locate scraper root folder containing 'src'.")

    if str(scraper_root) not in sys.path:
        sys.path.insert(0, str(scraper_root))

    from src.strategies.itworks_scrape_strategy import ItworksScrapeStrategy

    strategy = ItworksScrapeStrategy()

    scanned = 0
    refreshed = 0
    skipped = 0
    failed = 0

    jobs = JobDetail.objects.all()
    for job in jobs:
        src = job.source or extract_source(job.url)
        if src != "itworks":
            continue

        scanned += 1
        descriptions = job.descriptions or {}
        current_desc = descriptions.get("Job Description") if isinstance(descriptions, dict) else None

        # Refresh only records that still look like plain text (or missing).
        if not _is_plain_text_description(current_desc):
            skipped += 1
            continue

        try:
            response = requests.get(job.url, timeout=timeout)
            response.raise_for_status()

            parsed = strategy.scrape(response)

            changed = False
            update_fields = []
            for field in [
                "thumbnail",
                "job_title",
                "company_url",
                "company_name",
                "province",
                "salary",
                "skills",
                "descriptions",
                "job_info",
            ]:
                new_value = parsed.get(field)
                if new_value is not None and getattr(job, field) != new_value:
                    setattr(job, field, new_value)
                    update_fields.append(field)
                    changed = True

            if changed:
                job.save(update_fields=update_fields)
                refreshed += 1
            else:
                skipped += 1
        except Exception as exc:
            failed += 1
            print(f"[backfill][itworks][error] {job.url} => {exc}")

    return scanned, refreshed, skipped, failed


def _normalize_deadlines():
    scanned = 0
    updated = 0
    updated_deadline = 0
    updated_job_info = 0

    for job in JobDetail.objects.all():
        scanned += 1
        update_fields = []

        job_info = job.job_info
        normalized_job_info = normalize_job_info_dates(job_info)
        if normalized_job_info is not None and normalized_job_info != job_info:
            job.job_info = normalized_job_info
            update_fields.append("job_info")
            updated_job_info += 1

        deadline_value = parse_deadline_value(job.deadline) if job.deadline else None
        if not deadline_value:
            raw_deadline = extract_deadline_from_job_info(normalized_job_info or job_info)
            deadline_value = parse_deadline_value(raw_deadline)

        if deadline_value and deadline_value != job.deadline:
            job.deadline = deadline_value
            update_fields.append("deadline")
            updated_deadline += 1

        if update_fields:
            job.save(update_fields=update_fields)
            updated += 1

    return scanned, updated, updated_deadline, updated_job_info


def main():
    mode = (os.getenv("BACKFILL_MODE") or "all").strip().lower()
    print(f"[backfill] mode={mode}")

    if mode in {"all", "source"}:
        scanned, updated = _normalize_sources()
        print(f"[backfill][source] scanned={scanned} updated={updated}")

    if mode in {"all", "itworks", "itworks-format"}:
        scanned, refreshed, skipped, failed = _refresh_itworks_formatting()
        print(
            "[backfill][itworks] "
            f"scanned={scanned} refreshed={refreshed} skipped={skipped} failed={failed}"
        )

    if mode in {"all", "deadline", "date", "dates"}:
        scanned, updated, updated_deadline, updated_job_info = _normalize_deadlines()
        print(
            "[backfill][deadline] "
            f"scanned={scanned} updated={updated} "
            f"deadline={updated_deadline} job_info={updated_job_info}"
        )


main()