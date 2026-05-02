from __future__ import annotations

import math
import os
import re
import unicodedata
from datetime import date, datetime
from typing import Optional, Tuple

from django.utils import timezone


_DATE_PATTERNS = (
    (re.compile(r"(\d{4})-(\d{1,2})-(\d{1,2})"), "%Y-%m-%d"),
    (re.compile(r"(\d{4})/(\d{1,2})/(\d{1,2})"), "%Y/%m/%d"),
    (re.compile(r"(\d{4})\.(\d{1,2})\.(\d{1,2})"), "%Y.%m.%d"),
    (re.compile(r"(\d{1,2})/(\d{1,2})/(\d{2,4})"), "%d/%m/%Y"),
    (re.compile(r"(\d{1,2})-(\d{1,2})-(\d{2,4})"), "%d-%m-%Y"),
    (re.compile(r"(\d{1,2})\.(\d{1,2})\.(\d{2,4})"), "%d.%m.%Y"),
)

_MONTH_ABBREV_TO_NUMBER = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}

_MONTH_NAME_PATTERN = (
    r"(?P<month>jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|"
    r"jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|sept(?:ember)?|"
    r"oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
)

DEFAULT_DATE_DISPLAY_FORMAT = os.getenv("JOB_INFO_DATE_FORMAT", "%d/%m/%Y")


def _parse_month_name_date(text: str) -> Optional[date]:
    patterns = [
        rf"\b{_MONTH_NAME_PATTERN}\s+(?P<day>\d{{1,2}})(?:st|nd|rd|th)?(?:,)?\s+(?P<year>\d{{2,4}})\b",
        rf"\b(?P<day>\d{{1,2}})(?:st|nd|rd|th)?\s+{_MONTH_NAME_PATTERN}(?:,)?\s+(?P<year>\d{{2,4}})\b",
    ]

    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if not match:
            continue

        month_text = match.group("month").lower()
        month_key = month_text[:3]
        month = _MONTH_ABBREV_TO_NUMBER.get(month_key)
        if not month:
            continue

        day = int(match.group("day"))
        year = int(match.group("year"))
        if year < 100:
            year += 2000

        try:
            return datetime(year, month, day).date()
        except ValueError:
            continue

    return None


def _strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


_REMOTE_WORDS = ("remote", "work from home", "wfh", "tu xa", "lam tu xa")
_REMOTE_CONDENSED = ("remote", "workfromhome", "wfh", "tuxa", "lamtuxa")
_HCM_WORDS = ("ho chi minh", "tp ho chi minh", "sai gon", "saigon")
_HCM_CONDENSED = ("hochiminh", "tphochiminh", "hcm", "hcmc", "hcmm", "tphcm", "saigon")
_HN_WORDS = ("ha noi", "tp ha noi", "hanoi")
_HN_CONDENSED = ("hanoi", "tphanoi", "hn")
_DN_WORDS = ("da nang", "tp da nang", "danang")
_DN_CONDENSED = ("danang", "tpdanang", "dn")
_OTHER_WORDS = ("khac", "other", "others")
_OTHER_CONDENSED = ("khac", "other", "others")


def _normalize_location_text(value: str) -> str:
    text = _strip_accents(str(value)).lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return " ".join(text.split())


def _condense_location_text(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value)


def _matches_location(text: str, condensed: str, words: tuple[str, ...], condensed_words: tuple[str, ...]) -> bool:
    return any(token in text for token in words) or any(token in condensed for token in condensed_words)


def normalize_city_label(value: Optional[str], fallback: Optional[str] = None) -> str:
    if value is None:
        return "" if fallback is None else fallback

    text = _normalize_location_text(value)
    if not text:
        return "" if fallback is None else fallback

    condensed = _condense_location_text(text)

    if _matches_location(text, condensed, _REMOTE_WORDS, _REMOTE_CONDENSED):
        return "Remote"
    if _matches_location(text, condensed, _HCM_WORDS, _HCM_CONDENSED):
        return "Hồ Chí Minh"
    if _matches_location(text, condensed, _HN_WORDS, _HN_CONDENSED):
        return "Hà Nội"
    if _matches_location(text, condensed, _DN_WORDS, _DN_CONDENSED):
        return "Đà Nẵng"
    if _matches_location(text, condensed, _OTHER_WORDS, _OTHER_CONDENSED):
        return "Khác"

    return "" if fallback is None else fallback


def city_matches_filter(province: Optional[str], city_query: str) -> bool:
    if not city_query:
        return True

    query_text = _normalize_location_text(city_query)
    if not query_text:
        return True

    query_condensed = _condense_location_text(query_text)
    if _matches_location(query_text, query_condensed, _OTHER_WORDS, _OTHER_CONDENSED):
        return normalize_city_label(province, fallback="Khác") == "Khác"

    canonical_query = normalize_city_label(city_query, fallback=None)
    if canonical_query:
        return normalize_city_label(province, fallback="Khác") == canonical_query

    province_text = _normalize_location_text(province or "")
    return query_text in province_text


def parse_deadline_value(raw: Optional[object]) -> Optional[date]:
    """Parse a deadline value into a date object when possible."""
    if raw is None:
        return None

    if isinstance(raw, date) and not isinstance(raw, datetime):
        return raw

    if isinstance(raw, datetime):
        return raw.date()

    text = str(raw).strip()
    if not text:
        return None

    # Normalize Vietnamese labels like "Han nop:" for easier matching.
    clean_text = _strip_accents(text).lower()
    clean_text = clean_text.replace("han nop", "").replace("deadline", "")

    month_named = _parse_month_name_date(clean_text)
    if month_named:
        return month_named

    for pattern, fmt in _DATE_PATTERNS:
        match = pattern.search(clean_text)
        if not match:
            continue

        date_text = match.group(0)
        year_value = match.group(3) if match.lastindex and match.lastindex >= 3 else None
        adjusted_fmt = fmt
        if year_value and len(year_value) == 2:
            adjusted_fmt = fmt.replace('%Y', '%y')

        try:
            parsed = datetime.strptime(date_text, adjusted_fmt).date()
            return parsed
        except ValueError:
            continue

    return None


def normalize_job_info_dates(job_info: Optional[dict], output_format: Optional[str] = None) -> Optional[dict]:
    if not isinstance(job_info, dict):
        return job_info

    format_value = output_format or DEFAULT_DATE_DISPLAY_FORMAT

    date_keys = (
        "deadline",
        "han nop",
        "ngay nop",
        "ngay het han",
        "ngay het",
        "ngay dang",
        "ngay cap nhat",
        "posted",
        "post date",
        "publish",
        "published",
        "expiry",
        "expire",
    )

    updated = dict(job_info)
    for key, value in job_info.items():
        if not key or value is None:
            continue

        normalized_key = _strip_accents(str(key)).lower()
        if not any(marker in normalized_key for marker in date_keys):
            continue

        parsed = parse_deadline_value(value)
        if not parsed:
            continue

        updated[key] = parsed.strftime(format_value)

    return updated


def extract_deadline_from_job_info(job_info: Optional[dict]) -> Optional[str]:
    if not isinstance(job_info, dict):
        return None

    deadline_keys = (
        "deadline",
        "han nop",
        "ngay nop",
        "ngay het han",
        "ngay het",
        "expiry",
        "expire",
        "expired",
    )

    for key, value in job_info.items():
        if not key or not value:
            continue
        normalized = _strip_accents(str(key)).lower()
        if any(marker in normalized for marker in deadline_keys):
            return str(value)

    return None


def compute_deadline_status(deadline: Optional[date]) -> Tuple[Optional[bool], Optional[int]]:
    if deadline is None:
        return None, None

    today = timezone.localdate()
    is_expired = deadline < today
    days_left = max(0, (deadline - today).days)
    return is_expired, days_left


def _parse_numbers(text: str) -> list[float]:
    return [float(value.replace(",", ".")) for value in re.findall(r"\d+(?:[.,]\d+)?", text)]


def parse_salary_range(text: Optional[str]) -> Tuple[Optional[int], Optional[int]]:
    if not text:
        return None, None

    raw = str(text).lower()
    if "thoa thuan" in _strip_accents(raw) or "thuong luong" in _strip_accents(raw):
        return None, None

    values = _parse_numbers(raw)
    if not values:
        return None, None

    multiplier = 1
    if any(token in raw for token in ["trieu", "tr", "m"]):
        multiplier = 1_000_000
    elif any(token in raw for token in ["nghin", "k"]):
        multiplier = 1_000

    normalized = [int(value * multiplier) for value in values]
    return min(normalized), max(normalized)


def normalize_salary_bound(raw: Optional[str]) -> Optional[int]:
    if raw is None:
        return None
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None

    # Heuristic: numbers below 1000 are treated as "million".
    if value < 1000:
        return int(value * 1_000_000)

    return int(value)


def get_salary_sort_value(text: Optional[str], direction: str) -> float:
    min_value, max_value = parse_salary_range(text)
    if min_value is None and max_value is None:
        return math.inf if direction == "asc" else -math.inf

    return min_value if direction == "asc" else max_value
