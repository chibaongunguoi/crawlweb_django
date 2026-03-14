from bs4 import BeautifulSoup
from requests import Response
from urllib.parse import urljoin, urlparse
import re

from .strategy import ScrapeStrategy


class ItworksCrawlStrategy(ScrapeStrategy):
    ALLOWED_HOSTS = {
        "itworks.asia",
        "www.itworks.asia",
        "itwork.asia",
        "www.itwork.asia",
    }

    DETAIL_PATH_PATTERN = re.compile(r"^/job/[^/?#]+/?$")

    def _normalize_detail_url(self, base_url: str, href: str | None):
        if not href:
            return None

        url = urljoin(base_url, href.strip())
        parsed = urlparse(url)

        if parsed.scheme not in {"http", "https"}:
            return None

        hostname = (parsed.hostname or "").lower().strip()
        if hostname not in self.ALLOWED_HOSTS:
            return None

        path = (parsed.path or "").strip()
        if not path:
            return None

        if path.startswith("/index.php/"):
            path = path[len("/index.php") :]

        # Only keep concrete detail URLs, ignore list/feed and noisy query links.
        if not self.DETAIL_PATH_PATTERN.match(path):
            return None
        if path in {"/job", "/job/"}:
            return None
        if path.startswith("/job/feed"):
            return None
        if parsed.query:
            return None

        canonical_path = path.rstrip("/") + "/"
        return f"https://itworks.asia{canonical_path}"

    def scrape(self, response: Response):
        soup = BeautifulSoup(response.content, "html.parser")

        job_urls = []
        seen = set()

        for anchor in soup.find_all("a", href=True):
            normalized = self._normalize_detail_url(response.url, anchor.get("href"))
            if normalized is None or normalized in seen:
                continue
            seen.add(normalized)
            job_urls.append(normalized)

        return job_urls
