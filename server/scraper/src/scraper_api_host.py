from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ValidationError
import traceback
import uvicorn
import asyncio
from concurrent.futures import ThreadPoolExecutor
from src.scrape_manager import AggregationMode, ScrapeManager
from .strategies.strategy import ScrapeStrategy


class ValidateCrawlInput(BaseModel):
    urls: list[str]
    callback_url: str | None = None
    progress_callback_url: str | None = None
    metadata: dict = {}


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

    def route(self):
        self.app.add_api_route("/api/scrape", self.postScrape, methods=["POST"])

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
