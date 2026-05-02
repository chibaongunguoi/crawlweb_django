from __future__ import annotations

import math
import re
import unicodedata
from datetime import date, datetime
from typing import Optional, Tuple

from django.utils import timezone


_DATE_PATTERNS = (
    (re.compile(r"(\d{4})-(\d{1,2})-(\d{1,2})"), "%Y-%m-%d"),
    (re.compile(r"(\d{1,2})/(\d{1,2})/(\d{2,4})"), "%d/%m/%Y"),
    (re.compile(r"(\d{1,2})-(\d{1,2})-(\d{2,4})"), "%d-%m-%Y"),
)


def _strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


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


def extract_deadline_from_job_info(job_info: Optional[dict]) -> Optional[str]:
    if not isinstance(job_info, dict):
        return None

    for key, value in job_info.items():
        if not key or not value:
            continue
        normalized = _strip_accents(str(key)).lower()
        if "deadline" in normalized or "han nop" in normalized:
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
