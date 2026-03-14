from requests import Response
import re

from .strategy import ScrapeStrategy
from .devwork_scrape_strategy import DevworkScrapeStrategy
from .topcv_scrape_strategy import TopCvScrapeStrategy
from .itworks_scrape_strategy import ItworksScrapeStrategy


class OverallScrapeStrategy(ScrapeStrategy):
    def __init__(self):
        self.sub_strategies: dict[str, ScrapeStrategy] = {
            r"^https://devwork\.vn/": DevworkScrapeStrategy(),
            r"^https://www\.topcv\.vn/": TopCvScrapeStrategy(),
            r"^https://(www\.)?itworks\.asia/": ItworksScrapeStrategy(),
            r"^https://(www\.)?itwork\.asia/": ItworksScrapeStrategy(),
        }

    def scrape(self, response: Response):
        url = response.url
        for platform, sub_strategy in self.sub_strategies.items():
            if re.match(platform, url):
                return sub_strategy.scrape(response)
