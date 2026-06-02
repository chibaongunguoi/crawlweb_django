from bs4 import BeautifulSoup
from .strategy import ScrapeStrategy
from requests import Response
from typing import Any
from urllib.parse import urljoin, urlparse, urlunparse
import re


DEVWORK_ALLOWED_HOSTS = {
    "devwork.vn",
    "www.devwork.vn",
    "devwork.com",
    "www.devwork.com",
    "jobs.devwork.vn",
    "jobs.devwork.com",
}

DEVWORK_DETAIL_PATH_RE = re.compile(r"^/viec-lam/\d+/(?:[^/?#]+)", re.IGNORECASE)


def normalize_devwork_detail_url(url: str, base_url: str = "https://devwork.vn") -> str | None:
    if not isinstance(url, str):
        return None

    absolute_url = urljoin(base_url, url.strip())
    parsed = urlparse(absolute_url)
    hostname = (parsed.hostname or "").lower()
    if hostname not in DEVWORK_ALLOWED_HOSTS:
        return None

    if not DEVWORK_DETAIL_PATH_RE.match(parsed.path or ""):
        return None

    canonical_host = "devwork.vn" if hostname in {"www.devwork.vn", "devwork.vn", "jobs.devwork.vn"} else hostname
    return urlunparse((parsed.scheme or "https", canonical_host, parsed.path.rstrip("/"), "", "", ""))


class DevworkCrawlStrategy(ScrapeStrategy):
    def scrape(self, response: Response):
        soup = BeautifulSoup(response.content, "html.parser")

        job_urls = []
        seen = set()

        containers: list[Any] = soup.find_all("div", attrs={"class": "listing-container"})
        if not containers:
            containers = [soup]

        for container in containers:
            results = container.find_all("a", attrs={"href": True})
            for elm in results:
                href = elm.get("href")
                normalized_url = normalize_devwork_detail_url(str(href), response.url) if href else None
                if not normalized_url or normalized_url in seen:
                    continue
                seen.add(normalized_url)
                job_urls.append(normalized_url)

        return job_urls
