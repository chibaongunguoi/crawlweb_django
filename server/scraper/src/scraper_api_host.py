from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ValidationError
import traceback
import uvicorn
import asyncio
from concurrent.futures import ThreadPoolExecutor
from src.scrape_manager import AggregationMode, ScrapeManager, sendCallback
from .strategies.strategy import ScrapeStrategy
from .strategies.overall_crawl_strategy import OverallCrawlStrategy
from .strategies.overall_scrape_strategy import OverallScrapeStrategy


class ValidateCrawlInput(BaseModel):
    urls: list[str]
    callback_url: str | None = None
    progress_callback_url: str | None = None
    metadata: dict = {}
    max_detail_urls: int | None = None


class ApiHost:
    def __init__(self, host: str, port: int):
        self.host = host
        self.port = port
        self.app = FastAPI()
        self.route()

    def route(self):
        raise NotImplementedError()

    def run(self):
        uvicorn.run(self.app, host=self.host, port=self.port)


class ScraperApiHost(ApiHost):
    def __init__(
        self,
        host: str,
        port: int,
        scrape_strategy: ScrapeStrategy,
        aggregation_mode: AggregationMode,
    ):
        super().__init__(host, port)
        self.executor = ThreadPoolExecutor(max_workers=4)
        self.scrape_manager = ScrapeManager(
            scrape_strategy=scrape_strategy, aggregation_mode=aggregation_mode
        )
        self.crawl_manager = ScrapeManager(
            scrape_strategy=OverallCrawlStrategy(), aggregation_mode=AggregationMode.flatten
        )
        self.detail_scrape_manager = ScrapeManager(
            scrape_strategy=OverallScrapeStrategy(), aggregation_mode=AggregationMode.append
        )

    def route(self):
        self.app.add_api_route("/api/scrape", self.postScrape, methods=["POST"])
        self.app.add_api_route("/api/crawl-scrape", self.postCrawlScrape, methods=["POST"])

    async def postScrape(self, request: Request):
        try:
            data = await request.json()
            validated_input = ValidateCrawlInput(**data)
            loop = asyncio.get_event_loop()
            if validated_input.callback_url:
                loop.run_in_executor(
                    self.executor,
                    self.scrape_manager.scrapeUrlsWithCallback,
                    validated_input.urls,
                    validated_input.callback_url,
                    validated_input.progress_callback_url,
                    validated_input.metadata,
                )

                return JSONResponse(
                    status_code=202,
                    content={
                        "status": "accepted",
                        "message": "Crawling started. Results will be sent to callback URL.",
                    },
                )

            else:
                urls = await loop.run_in_executor(
                    self.executor, self.scrape_manager.scrapeUrls, validated_input.urls
                )

                return JSONResponse(
                    status_code=200,
                    content={
                        "status": "success",
                        "count": len(urls),
                        "job_urls": urls,
                    },
                )

        except ValidationError as e:
            return JSONResponse(
                status_code=422,
                content={
                    "status": "error",
                    "message": "Invalid input format",
                    "details": str(e),
                },
            )
        except Exception as e:
            traceback.print_exc()
            return JSONResponse(
                status_code=500,
                content={
                    "status": "error",
                    "message": "Internal server error",
                    "details": str(e),
                },
            )

    def _crawl_then_scrape_with_callback(
        self,
        seed_urls: list[str],
        callback_url: str,
        progress_callback_url: str | None,
        metadata: dict,
        max_detail_urls: int | None = None,
    ):
        try:
            detail_urls = self.crawl_manager.scrapeUrls(seed_urls)
            normalized_detail_urls = []
            seen = set()
            for url in detail_urls:
                if not isinstance(url, str):
                    continue
                clean_url = url.strip()
                if not clean_url or clean_url in seen:
                    continue
                seen.add(clean_url)
                normalized_detail_urls.append(clean_url)

            if max_detail_urls:
                normalized_detail_urls = normalized_detail_urls[:max_detail_urls]

            enriched_metadata = {
                **(metadata or {}),
                "seedUrls": seed_urls,
                "crawledUrls": normalized_detail_urls,
                "detailUrls": normalized_detail_urls,
                "detailUrlCount": len(normalized_detail_urls),
            }

            data = self.detail_scrape_manager.scrapeUrlsWithProgress(
                normalized_detail_urls,
                progress_callback_url,
                enriched_metadata,
            )
            sendCallback(callback_url=callback_url, data=data, metadata=enriched_metadata)
        except Exception as exc:
            traceback.print_exc()
            sendCallback(
                callback_url=callback_url,
                data=[],
                success=False,
                metadata={**(metadata or {}), "error": str(exc)},
            )

    async def postCrawlScrape(self, request: Request):
        try:
            data = await request.json()
            validated_input = ValidateCrawlInput(**data)
            loop = asyncio.get_event_loop()
            if validated_input.callback_url:
                loop.run_in_executor(
                    self.executor,
                    self._crawl_then_scrape_with_callback,
                    validated_input.urls,
                    validated_input.callback_url,
                    validated_input.progress_callback_url,
                    validated_input.metadata,
                    validated_input.max_detail_urls,
                )

                return JSONResponse(
                    status_code=202,
                    content={
                        "status": "accepted",
                        "message": "Crawl then scrape started. Results will be sent to callback URL.",
                    },
                )

            detail_urls = await loop.run_in_executor(
                self.executor, self.crawl_manager.scrapeUrls, validated_input.urls
            )
            normalized_detail_urls = []
            seen = set()
            for url in detail_urls:
                if not isinstance(url, str):
                    continue
                clean_url = url.strip()
                if not clean_url or clean_url in seen:
                    continue
                seen.add(clean_url)
                normalized_detail_urls.append(clean_url)
            if validated_input.max_detail_urls:
                normalized_detail_urls = normalized_detail_urls[:validated_input.max_detail_urls]

            jobs = await loop.run_in_executor(
                self.executor, self.detail_scrape_manager.scrapeUrls, normalized_detail_urls
            )

            return JSONResponse(
                status_code=200,
                content={
                    "status": "success",
                    "count": len(jobs),
                    "detail_urls": normalized_detail_urls,
                    "job_urls": jobs,
                },
            )

        except ValidationError as e:
            return JSONResponse(
                status_code=422,
                content={
                    "status": "error",
                    "message": "Invalid input format",
                    "details": str(e),
                },
            )
        except Exception as e:
            traceback.print_exc()
            return JSONResponse(
                status_code=500,
                content={
                    "status": "error",
                    "message": "Internal server error",
                    "details": str(e),
                },
            )
