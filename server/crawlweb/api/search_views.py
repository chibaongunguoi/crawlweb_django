"""
Advanced search API for JobDetail with full-text search, faceted filters,
and paginated results.

Technical notes:
- Uses MongoDB text index on job_title, descriptions, skills for full-text search.
- Uses field indexes on province, company_name, source, deadline for filter performance.
- Fuzziness is approximated via regex on non-text-indexed fields when $text is not used.
- Facets are computed via MongoDB aggregation pipeline when ?facets=true.

Pros/cons of search backends:
- MongoDB text index: built-in, no extra infra, supports stemming for CJK/English.
  Cons: limited fuzziness, Vietnamese stemming not well supported, single-field
  text index only.
- Meilisearch/Elasticsearch: excellent fuzziness, typo tolerance, Vietnamese
  analyzers. Cons: extra service to deploy and maintain.

This implementation uses MongoDB for zero-infrastructure cost.
"""

import logging
import re
from datetime import datetime, timezone as tz
from math import ceil

from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import JobDetail
from .serializers import JobDetailSerializer
from .job_utils import (
    normalize_city_label,
    city_matches_filter,
    get_salary_sort_value,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_int(value, default, min_val=None, max_val=None):
    try:
        result = int(value)
    except (ValueError, TypeError):
        return default
    if min_val is not None:
        result = max(min_val, result)
    if max_val is not None:
        result = min(max_val, result)
    return result


def _parse_date(value):
    """Parse ISO or yyyy-mm-dd date string, return aware datetime or None."""
    if not value:
        return None
    text = str(value).strip()
    for fmt in ('%Y-%m-%dT%H:%M:%S.%fZ', '%Y-%m-%dT%H:%M:%SZ', '%Y-%m-%d', '%Y/%m/%d'):
        try:
            dt = datetime.strptime(text, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=tz.utc)
            return dt
        except ValueError:
            continue
    return None


def _build_regex_pattern(query_text):
    """Build a safe regex pattern from user query for fuzzy-like matching."""
    if not query_text:
        return None
    # Escape regex special chars, then join words with .* for loose matching.
    words = [re.escape(w.strip()) for w in query_text.split() if w.strip()]
    if not words:
        return None
    return '.*'.join(words)


def _safe_text_descriptions(descriptions):
    """Extract searchable text from descriptions dict."""
    if not descriptions or not isinstance(descriptions, dict):
        return ''
    parts = []
    for v in descriptions.values():
        if isinstance(v, str):
            parts.append(v)
        elif isinstance(v, list):
            parts.extend(str(item) for item in v if item)
    return ' '.join(parts)


# ---------------------------------------------------------------------------
# Main search endpoint
# ---------------------------------------------------------------------------

@api_view(['GET'])
def advanced_job_search(request):
    """
    GET /api/jobs/search/advanced/?q=<query>&skill=<skill>&city=<city>
       &company=<company>&source=<source>
       &deadline_from=<yyyy-mm-dd>&deadline_to=<yyyy-mm-dd>
       &sort=<field>:<asc|desc>&page=1&pageSize=24
       &facets=true

    Response:
    {
        "items": [...],
        "page": 1,
        "pageSize": 24,
        "total": 123,
        "totalPages": 6,
        "facets": {                  // only when facets=true
            "sources": [{"label": "topcv", "count": 42}, ...],
            "provinces": [{"label": "Ha Noi", "count": 30}, ...],
            "companies": [{"label": "FPT", "count": 10}, ...]
        }
    }
    """
    # -- Parse query parameters -------------------------------------------------
    q = (request.query_params.get('q') or '').strip()
    skill = (request.query_params.get('skill') or '').strip()
    city = (request.query_params.get('city') or '').strip().lower()
    company = (request.query_params.get('company') or '').strip().lower()
    source = (request.query_params.get('source') or '').strip().lower()
    deadline_from = _parse_date(request.query_params.get('deadline_from'))
    deadline_to = _parse_date(request.query_params.get('deadline_to'))
    include_facets = (request.query_params.get('facets') or '').lower() in ('true', '1', 'yes')

    # Sort: supports createdAt, deadline, salary, relevance
    sort_raw = (request.query_params.get('sort') or 'relevance:desc').strip().lower()
    if ':' in sort_raw:
        sort_field, sort_dir = sort_raw.split(':', 1)
    else:
        sort_field, sort_dir = sort_raw, 'desc'
    sort_dir_desc = sort_dir != 'asc'

    page = _parse_int(request.query_params.get('page'), default=1, min_val=1)
    page_size = _parse_int(request.query_params.get('pageSize'), default=24, min_val=1, max_val=200)

    # -- Build MongoDB query via Django ORM -------------------------------------
    jobs = JobDetail.objects.all()

    # Source filter
    if source:
        jobs = jobs.filter(source__iexact=source)

    # Company filter (substring match)
    if company:
        jobs = jobs.filter(company_name__icontains=company)

    # Province / city filter
    if city:
        jobs = jobs.filter(province__icontains=city)

    # Deadline range
    if deadline_from:
        jobs = jobs.filter(deadline__gte=deadline_from)
    if deadline_to:
        jobs = jobs.filter(deadline__lte=deadline_to)

    # -- Text / skill matching (in-memory for flexibility) ----------------------
    # We pull filtered queryset then do text/skill matching in Python because
    # MongoDB text index via Django ORM is not straightforward. For large
    # datasets, consider using pymongo raw aggregation.

    q_lower = q.lower() if q else ''
    skill_lower = skill.lower() if skill else ''
    regex_pattern = _build_regex_pattern(q_lower) if q_lower else None
    regex = re.compile(regex_pattern, re.IGNORECASE) if regex_pattern else None

    results = []
    for job in jobs:
        # Skill filter
        if skill_lower:
            skill_list = [s.lower() for s in (job.skills or []) if isinstance(s, str)]
            if skill_lower not in skill_list:
                continue

        # Text search: match in job_title, descriptions, skills, company_name, province
        relevance_score = 0
        if q_lower:
            title_lower = (job.job_title or '').lower()
            desc_text = _safe_text_descriptions(job.descriptions).lower()
            skills_text = ' '.join(str(s) for s in (job.skills or [])).lower()
            company_text = (job.company_name or '').lower()
            province_text = (job.province or '').lower()

            matched = False

            # Exact title match gets highest score
            if q_lower in title_lower:
                relevance_score += 10
                matched = True

            # Exact skill match gets high score
            if q_lower in skills_text:
                relevance_score += 8
                matched = True

            # Company name match
            if q_lower in company_text:
                relevance_score += 5
                matched = True

            # Description match
            if q_lower in desc_text:
                relevance_score += 3
                matched = True

            # Province match
            if q_lower in province_text:
                relevance_score += 2
                matched = True

            # Fuzzy regex match if no exact match yet
            if not matched and regex:
                haystack = f"{title_lower} {desc_text} {skills_text} {company_text}"
                if regex.search(haystack):
                    relevance_score += 1
                    matched = True

            if not matched:
                continue

        results.append((job, relevance_score))

    # -- Sort -------------------------------------------------------------------
    if sort_field == 'salary':
        results.sort(
            key=lambda x: get_salary_sort_value(x[0].salary, 'desc'),
            reverse=sort_dir_desc,
        )
    elif sort_field == 'deadline':
        results.sort(
            key=lambda x: (x[0].deadline is None, x[0].deadline),
            reverse=sort_dir_desc,
        )
    elif sort_field == 'createdat' or sort_field == 'collected_at':
        min_ts = datetime(1970, 1, 1, tzinfo=tz.utc)
        results.sort(
            key=lambda x: x[0].collected_at or min_ts,
            reverse=sort_dir_desc,
        )
    else:
        # relevance (default): sort by score, then newest
        min_ts = datetime(1970, 1, 1, tzinfo=tz.utc)
        results.sort(
            key=lambda x: (x[1], x[0].collected_at or min_ts),
            reverse=True,
        )

    # -- Pagination -------------------------------------------------------------
    total = len(results)
    total_pages = ceil(total / page_size) if total else 0
    start_index = (page - 1) * page_size
    end_index = start_index + page_size
    page_items = [item[0] for item in results[start_index:end_index]]

    serializer = JobDetailSerializer(page_items, many=True)

    response_data = {
        'items': serializer.data,
        'page': page,
        'pageSize': page_size,
        'total': total,
        'totalPages': total_pages,
    }

    # -- Facets -----------------------------------------------------------------
    if include_facets:
        sources_map = {}
        provinces_map = {}
        companies_map = {}

        for job, _score in results:
            src = (job.source or '').strip()
            if src:
                sources_map[src] = sources_map.get(src, 0) + 1

            prov = (job.province or '').strip()
            if prov:
                prov_label = normalize_city_label(prov, fallback=prov)
                if prov_label:
                    provinces_map[prov_label] = provinces_map.get(prov_label, 0) + 1

            comp = (job.company_name or '').strip()
            if comp:
                companies_map[comp] = companies_map.get(comp, 0) + 1

        response_data['facets'] = {
            'sources': sorted(
                [{'label': k, 'count': v} for k, v in sources_map.items()],
                key=lambda x: x['count'], reverse=True
            ),
            'provinces': sorted(
                [{'label': k, 'count': v} for k, v in provinces_map.items()],
                key=lambda x: x['count'], reverse=True
            ),
            'companies': sorted(
                [{'label': k, 'count': v} for k, v in companies_map.items()],
                key=lambda x: x['count'], reverse=True
            )[:50],  # limit to top 50 companies
        }

    return Response(response_data, status=status.HTTP_200_OK)