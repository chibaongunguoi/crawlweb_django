from requests import Response
import re

from .strategy import ScrapeStrategy
from .devwork_scrape_strategy import DevworkScrapeStrategy
from .topcv_scrape_strategy import TopCvScrapeStrategy


class OverallScrapeStrategy(ScrapeStrategy):
    def __init__(self):
        self.sub_strategies: dict[str, ScrapeStrategy] = {
            r"^https://devwork\.vn/": DevworkScrapeStrategy(),
            r"^https://www\.topcv\.vn/": TopCvScrapeStrategy(),
        }

    def scrape(self, response: Response):
        url = response.url
        for platform, sub_strategy in self.sub_strategies.items():
            if re.match(platform, url):
                return sub_strategy.scrape(response)
