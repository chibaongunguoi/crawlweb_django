from enum import Enum, auto

import threading
import requests
import random
from colorama import Fore, init
from datetime import datetime, timezone
import time
import traceback
from .strategies.strategy import ScrapeStrategy

rate_lock = threading.BoundedSemaphore(value=1)
last_request = [0.0]

init(autoreset=True)


class AggregationMode(Enum):
    flatten = auto()
    append = auto()


def now():
    return datetime.now(timezone.utc).isoformat()


def sendCallback(callback_url: str, data, success: bool = True, metadata: dict = {}):
    try:
        import requests

        payload: dict = {
            "status": "success" if success else "error",
            "data": data,
        }

        metadata = metadata.copy()
        metadata["finish_at"] = time.time()
        if "start_at" in metadata:
            metadata["completed_in_seconds"] = (
                metadata["finish_at"] - metadata["start_at"]
            )

        if isinstance(data, list):
            metadata["count"] = len(data)

        payload["metadata"] = metadata

        print(f"Sending callback to: {callback_url}")
        response = requests.post(
            callback_url,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=30,
        )
        response.raise_for_status()
        print(f"Callback sent successfully. Status: {response.status_code}")

    except Exception as e:
        print(f"Error sending callback to {callback_url}: {e}")


USER_AGENTS = [
    # "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36",
    # "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
    # "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:130.0) Gecko/20100101 Firefox/130.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
]
REFERERS = ["https://www.google.com", "https://www.bing.com", "https://duckduckgo.com"]
# ACCEPT_LANGUAGES = ["en-US,en;q=0.9", "en-GB,en;q=0.9", "fr-FR,fr;q=0.9"]
# DNTS = ["0", "1"]


class ScrapeManager:
    def __init__(
        self,
        scrape_strategy: ScrapeStrategy,
        aggregation_mode: AggregationMode = AggregationMode.flatten,
    ):
        self.scrape_strategy = scrape_strategy
        self.aggregation_mode = aggregation_mode

    def scrapeSingle(self, url: str):
        n_attempts = 5
        for i in range(n_attempts):
            if i > 2:  # từ lần 3 trở lên
                with rate_lock:
                    now = time.time()
                    elapsed = now - last_request[0]
                    wait = max(0, 5.0 - elapsed)
                    if wait > 0:
                        time.sleep(wait)
                    last_request[0] = time.time()
            response = None
            try:
                print(Fore.BLUE + f"[-- START --] Attempt {i + 1} Scraping URL: {url}")
                headers = {
                    "User-Agent": random.choice(USER_AGENTS),
                    # "Accept-Language": random.choice(ACCEPT_LANGUAGES),
                    "Referer": random.choice(REFERERS),
                    # "DNT": random.choice(DNTS),
                    # "Connection": "keep-alive",
                }
                response = requests.get(url, headers=headers, timeout=30)
                response.raise_for_status()
                result = self.scrape_strategy.scrape(response)
                print(
                    Fore.GREEN
                    + f"[++ SUCCESS ++] Scraped {url} successfully at attempt {i + 1}."
                )
                return result
            except Exception:
                traceback.print_exc()
                print(
                    Fore.YELLOW
                    + f"[-- WARNING --] Failed to scrape {url} at attempt {i + 1}."
                )
            if i == n_attempts - 1:
                break
            time.sleep(random.uniform(5, 10))

        print(
            Fore.RED
            + f"[-- FAILURE --] Failed to scrape {url}, scraping failed after {n_attempts} times."
        )
        if self.aggregation_mode == AggregationMode.flatten:
            return []
        else:
            return None

    def scrapeUrls(self, urls: list[str]) -> list:
        """Crawl the provided URLs in parallel using ThreadPoolExecutor"""
        if not urls:
            print(
                Fore.CYAN + "[-- INFO --] ScrapeManager.scrapeUrls: No URLs provided."
            )
            return []

        print(
            Fore.CYAN
            + f"[-- INFO --] ScrapeManager.scrapeUrls: {len(urls)} URL(s) provided."
        )
        try:
            from concurrent.futures import ThreadPoolExecutor, as_completed

            batch_result = []
            with ThreadPoolExecutor(max_workers=min(len(urls), 4)) as executor:
                future_to_url = {
                    executor.submit(self.scrapeSingle, url): url for url in urls
                }
                for future in as_completed(future_to_url):
                    url = future_to_url[future]
                    try:
                        result = future.result()
                        if self.aggregation_mode == AggregationMode.flatten:
                            assert isinstance(result, list)
                            for record in result:
                                if record not in batch_result:
                                    batch_result.append(record)

                        else:
                            if result is not None:
                                batch_result.append(result)
                    except Exception as e:
                        print(
                            f"[ERROR at ScrapeManager.scrapeUrls] Error processing {url}: {str(e)}"
                        )
                        traceback.print_exc()

            return batch_result

        except Exception as e:
            print(f"[!! ERROR !!] ScrapeManager.crawl_urls: {e}")
            return []

    def sendProgressUpdate(self, progress_callback_url: str, jobId: str, processed: int, total: int, current_url: str = None):
        """Send progress update to callback URL"""
        if not progress_callback_url or not jobId:
            return

        try:
            import requests

            progress_percentage = int((processed / total) * 100) if total > 0 else 0

            payload = {
                "metadata": {
                    "jobId": jobId,
                },
                "data": {
                    "processed": processed,
                    "processedUrls": processed,
                    "currentUrl": current_url,
                    "progress": progress_percentage,
                },
            }

            print(f"Sending progress update: {processed}/{total} ({progress_percentage}%) - {current_url}")
            response = requests.post(
                progress_callback_url,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=10,
            )
            response.raise_for_status()
            print(f"Progress update sent successfully")

        except Exception as e:
            print(f"Error sending progress update: {e}")

    def scrapeUrlsWithProgress(self, urls: list[str], progress_callback_url: str = None, metadata: dict = {}) -> list:
        """Crawl the provided URLs with progress updates"""
        if not urls:
            print(
                Fore.CYAN + "[-- INFO --] ScrapeManager.scrapeUrlsWithProgress: No URLs provided."
            )
            return []

        print(
            Fore.CYAN
            + f"[-- INFO --] ScrapeManager.scrapeUrlsWithProgress: {len(urls)} URL(s) provided."
        )

        jobId = metadata.get("jobId")
        total_urls = len(urls)
        processed_count = 0

        try:
            from concurrent.futures import ThreadPoolExecutor, as_completed

            batch_result = []
            with ThreadPoolExecutor(max_workers=min(len(urls), 4)) as executor:
                future_to_url = {
                    executor.submit(self.scrapeSingle, url): url for url in urls
                }
                for future in as_completed(future_to_url):
                    url = future_to_url[future]
                    try:
                        result = future.result()
                        processed_count += 1

                        # Send progress update
                        self.sendProgressUpdate(progress_callback_url, jobId, processed_count, total_urls, url)

                        if self.aggregation_mode == AggregationMode.flatten:
                            assert isinstance(result, list)
                            for record in result:
                                if record not in batch_result:
                                    batch_result.append(record)

                        else:
                            if result is not None:
                                batch_result.append(result)
                    except Exception as e:
                        processed_count += 1
                        print(
                            f"[ERROR at ScrapeManager.scrapeUrlsWithProgress] Error processing {url}: {str(e)}"
                        )
                        # Send progress update even on error
                        self.sendProgressUpdate(progress_callback_url, jobId, processed_count, total_urls, url)
                        traceback.print_exc()

            return batch_result

        except Exception as e:
            print(f"[!! ERROR !!] ScrapeManager.scrapeUrlsWithProgress: {e}")
            return []

    def scrapeUrlsWithCallback(
        self, urls: list[str], callback_url: str, progress_callback_url: str = None, metadata: dict = {}
    ):
        try:
            data = self.scrapeUrlsWithProgress(urls, progress_callback_url, metadata)
            sendCallback(callback_url=callback_url, data=data, metadata=metadata)

        except Exception:
            sendCallback(
                callback_url=callback_url,
                data=[],
                success=False,
            )
