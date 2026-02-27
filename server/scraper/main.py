# python job_scraper.py
from src.scrape_manager import AggregationMode
from src.scraper_api_host import ScraperApiHost
from src.strategies.overall_scrape_strategy import OverallScrapeStrategy
import os

HOST = os.getenv("SCRAPER_HOST", "localhost")
PORT = int(os.getenv("SCRAPER_PORT", 37001))

if __name__ == "__main__":
    api_host = ScraperApiHost(
        host=HOST,
        port=PORT,
        scrape_strategy=OverallScrapeStrategy(),
        aggregation_mode=AggregationMode.append,
    )
    api_host.run()
