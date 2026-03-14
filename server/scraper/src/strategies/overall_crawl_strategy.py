from requests import Response
import re

from .strategy import ScrapeStrategy
from .devwork_crawl_strategy import DevworkCrawlStrategy
from .topcv_crawl_strategy import TopCvCrawlStrategy
from .itworks_crawl_strategy import ItworksCrawlStrategy


class OverallCrawlStrategy(ScrapeStrategy):
    def __init__(self):
        self.sub_strategies: dict[str, ScrapeStrategy] = {
            r"^https://devwork\.vn/": DevworkCrawlStrategy(),
            r"^https://www\.topcv\.vn/": TopCvCrawlStrategy(),
            r"^https://(www\.)?itworks\.asia/": ItworksCrawlStrategy(),
            r"^https://(www\.)?itwork\.asia/": ItworksCrawlStrategy(),
        }

    def scrape(self, response: Response):
        url = response.url
        for platform, sub_strategy in self.sub_strategies.items():
            if re.match(platform, url):
                return sub_strategy.scrape(response)
