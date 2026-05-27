from ..util import removeConsecutiveSpaces, extract_deadline_from_job_info
from .strategy import ScrapeStrategy
from requests import Response
from bs4 import BeautifulSoup
import re
from ..model.job_detail import JobDetail


class TopCvScrapeStrategy(ScrapeStrategy):
    def getThumbnail(self, page) -> str | None:
        thumbnail = None
        try:
            a = page.find("a", attrs={"class": "company-logo"})
            thumbnail = a.find("img").get("src")
            thumbnail = removeConsecutiveSpaces(thumbnail)
        except Exception:
            pass
        return thumbnail

    def scrapeTitle(self, page) -> str:
        title = page.find("h1", attrs={"class": "job-detail__info--title"})
        if title is None:
            raise Exception("Cannot find title.")

        title = title.text
        title = removeConsecutiveSpaces(title)
        return title

    def scrapeCompanyInfo(self, page) -> dict:
        result: dict = {"company_name": None, "company_url": None}
        company_name_element = page.find(
            "a",
            attrs={
                "class": "name",
                "href": re.compile(r"^https://www.topcv.vn/cong-ty/"),
            },
        )

        result["company_name"] = removeConsecutiveSpaces(company_name_element.text)
        result["company_url"] = company_name_element.get("href")
        return result

    def scrapeUpperPart(self, page) -> dict:
        result = {"salary": None, "province": None}
        for item in page.find_all("div", attrs={"class": "job-detail__info--section"}):
            title = item.find(
                "div", attrs={"class": "job-detail__info--section-content-title"}
            )
            value = item.find(
                "div", attrs={"class": "job-detail__info--section-content-value"}
            )

            if title is None or value is None:
                continue

            if title.text == "Địa điểm":
                result["province"] = value.text
            elif title.text == "Mức lương":
                result["salary"] = value.text

        return result

    def scrapeBody(self, page) -> dict:
        result = {"descriptions": {}}

        for description_item in page.find_all(
            "div", attrs={"class": "job-description__item"}
        ):
            title = description_item.find("h3")
            content = description_item.find(
                "div", attrs={"class": "job-description__item--content"}
            )

            if content is None or title is None:
                continue

            result["descriptions"][title.text] = removeConsecutiveSpaces(content.text)

        return result

    def scrapeGeneralInfo(self, page) -> dict:
        result = {"job_info": {}}
        for item in page.find_all("div", attrs={"class": "box-general-group-info"}):
            title = item.find("div", attrs={"class": "box-general-group-info-title"})
            value = item.find("div", attrs={"class": "box-general-group-info-value"})

            if title is None or value is None:
                continue

            result["job_info"][title.text] = value.text

        return result

    def scrapeBoxCategory(self, page):
        result = {"skills": ()}
        skills = []
        for item in page.find_all("div", attrs={"class": "box-category collapsed"}):
            title = item.find("div", attrs={"class": "box-title"})
            values = item.find_all("div", attrs={"class": "box-category-tag"})

            if title is None or not values:
                continue

            if title.text == "Kỹ năng cần có":
                for value in values:
                    skills.append(value.text)

        result["skills"] = tuple(skills)
        return result

    def scrape(self, response: Response):
        url = response.url
        page = BeautifulSoup(response.content, "html.parser")

        descriptions = {}

        thumbnail = self.getThumbnail(page)
        upper_part_info = self.scrapeUpperPart(page)

        province = upper_part_info["province"]
        salary = upper_part_info["salary"]
        body_info = self.scrapeBody(page)
        descriptions.update(body_info["descriptions"])
        general_info = self.scrapeGeneralInfo(page)
        job_info = general_info["job_info"]
        deadline = extract_deadline_from_job_info(job_info)
        box_category_info = self.scrapeBoxCategory(page)
        skills = box_category_info["skills"]
        title = self.scrapeTitle(page)
        company_info = self.scrapeCompanyInfo(page)
        company_name = company_info["company_name"]
        company_url = company_info["company_url"]
        job = JobDetail(
            url=url,
            thumbnail=thumbnail,
            job_title=title,
            province=province,
            skills=skills,
            descriptions=descriptions,
            job_info=job_info,
            company_name=company_name,
            company_url=company_url,
            salary=salary,
            deadline=deadline,
        )
        return job.__dict__
