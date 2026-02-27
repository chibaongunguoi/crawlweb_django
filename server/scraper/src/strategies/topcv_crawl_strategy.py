from bs4 import BeautifulSoup
from requests import Response
from typing import Any
from .strategy import ScrapeStrategy
import re


class TopCvCrawlStrategy(ScrapeStrategy):
    def scrape(self, response: Response):
        soup = BeautifulSoup(response.content, "html.parser")

        job_urls = []
        container: Any = soup.find("div", attrs={"class": "job-list-search-result"})
        if container is None:
            return job_urls

        results = container.find_all(
            "a", attrs={"href": re.compile(r"^https://www\.topcv\.vn/viec-lam/.+")}
        )

        for elm in results:
            elm: Any
            job_urls.append(elm.get("href"))

        return job_urls
