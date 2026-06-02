import unittest

from requests import Response

from src.strategies.devwork_crawl_strategy import (
    DevworkCrawlStrategy,
    normalize_devwork_detail_url,
)
from src.util import extract_deadline_from_job_info


def make_response(html: str, url: str = "https://devwork.vn/viec-lam") -> Response:
    response = Response()
    response.status_code = 200
    response.url = url
    response._content = html.encode("utf-8")
    return response


class DevworkCrawlStrategyTests(unittest.TestCase):
    def test_normalize_accepts_valid_devwork_detail_url(self):
        url = normalize_devwork_detail_url(
            "https://www.devwork.vn/viec-lam/123/python-developer?utm_source=test"
        )

        self.assertEqual(url, "https://devwork.vn/viec-lam/123/python-developer")

    def test_normalize_rejects_list_page_tracking_and_foreign_host(self):
        self.assertIsNone(normalize_devwork_detail_url("https://devwork.vn/viec-lam"))
        self.assertIsNone(normalize_devwork_detail_url("https://devwork.vn/viec-lam?utm_source=test"))
        self.assertIsNone(normalize_devwork_detail_url("https://example.com/viec-lam/123/python"))

    def test_strategy_dedupes_and_rejects_invalid_urls(self):
        html = """
        <html>
          <body>
            <a href="/viec-lam/123/python-developer?utm_source=test">Python</a>
            <a href="https://www.devwork.vn/viec-lam/123/python-developer">Duplicate</a>
            <a href="https://devwork.vn/viec-lam">List page</a>
            <a href="https://example.com/viec-lam/456/java">Foreign</a>
            <a href="https://jobs.devwork.vn/viec-lam/456/java-developer">Java</a>
          </body>
        </html>
        """
        strategy = DevworkCrawlStrategy()

        urls = strategy.scrape(make_response(html))

        self.assertEqual(
            urls,
            [
                "https://devwork.vn/viec-lam/123/python-developer",
                "https://devwork.vn/viec-lam/456/java-developer",
            ],
        )


class DevworkDeadlineExtractionTests(unittest.TestCase):
    def test_extract_deadline_from_vietnamese_devwork_label(self):
        job_info = {
            "Địa điểm": "Hà Nội",
            "Hạn nộp hồ sơ": "2025-08-31",
        }

        self.assertEqual(extract_deadline_from_job_info(job_info), "2025-08-31")


if __name__ == "__main__":
    unittest.main()
