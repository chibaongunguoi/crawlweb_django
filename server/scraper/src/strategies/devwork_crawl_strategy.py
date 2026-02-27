from bs4 import BeautifulSoup
from .strategy import ScrapeStrategy
from requests import Response
from typing import Any
import re


class DevworkCrawlStrategy(ScrapeStrategy):
    def scrape(self, response: Response):
        soup = BeautifulSoup(response.content, "html.parser")

        container: Any = soup.find("div", attrs={"class": "listing-container"})
        if container is None:
            return []

        job_urls = []
        results = container.find_all(
            "a", attrs={"href": re.compile(r"^/viec-lam/\d+/.+")}
        )
        for elm in results:
            elm: Any
            job_urls.append("https://devwork.vn" + elm.get("href"))

        return job_urls
