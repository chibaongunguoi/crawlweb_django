from requests import Response


class ScrapeStrategy:
    def scrape(self, response: Response):
        response = response
        raise NotImplementedError()
