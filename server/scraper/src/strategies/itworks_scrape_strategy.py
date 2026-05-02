from bs4 import BeautifulSoup
from requests import Response
from urllib.parse import urljoin

from .strategy import ScrapeStrategy
from ..model.job_detail import JobDetail
from ..util import removeConsecutiveSpaces, extract_deadline_from_job_info


class ItworksScrapeStrategy(ScrapeStrategy):
    ALLOWED_DESCRIPTION_TAGS = {
        "h4",
        "h5",
        "h6",
        "p",
        "ul",
        "ol",
        "li",
        "strong",
        "b",
        "em",
        "i",
        "br",
        "a",
    }

    def _clean_text(self, value):
        if value is None:
            return None
        text = removeConsecutiveSpaces(str(value))
        return text if text else None

    def _node_text(self, node):
        if node is None:
            return None
        return self._clean_text(node.get_text(" ", strip=True))

    def _first_text(self, page, selectors):
        for selector in selectors:
            node = page.select_one(selector)
            text = self._node_text(node)
            if text:
                return text
        return None

    def _extract_company(self, page, base_url):
        company_name = None
        company_url = None

        title_link = page.select_one(
            ".job-detail-employer-info .employer-title a, .job-employer-header .employer-title a"
        )
        if title_link is not None:
            company_name = self._clean_text(title_link.get_text(" ", strip=True))
            href = title_link.get("href")
            if href:
                company_url = urljoin(base_url, href)

        if company_name is None:
            company_name = self._first_text(
                page,
                [
                    ".job-detail-employer-info .employer-title",
                    ".job-employer-header .employer-title",
                ],
            )

        return company_name, company_url

    def _extract_thumbnail(self, page, base_url):
        img = page.select_one(
            ".job-detail-employer-info .employer-thumbnail img, .job-employer-header .employer-thumbnail img, .job-detail-header .employer-logo img"
        )
        if img is None:
            return None

        src = img.get("src") or img.get("data-src")
        if not src:
            return None

        return urljoin(base_url, src)

    def _extract_skills(self, page):
        skills = []
        for node in page.select(".category-job a, .job-category a"):
            value = self._node_text(node)
            if value and value not in skills:
                skills.append(value)
        return tuple(skills)

    def _extract_descriptions(self, page):
        descriptions = {}

        description_block = page.select_one(".job-detail-description")
        if description_block is not None:
            title = self._first_text(description_block, ["h3.title", "h2", "h3"]) or "Job Description"

            # Create a detached tree to sanitize while preserving semantic tags.
            block = BeautifulSoup(str(description_block), "html.parser")
            container = block.select_one(".job-detail-description") or block

            # Remove duplicated section heading from the body.
            heading = container.find(["h3", "h2"], class_="title") or container.find(["h3", "h2"])
            if heading is not None:
                heading_text = self._node_text(heading)
                if heading_text == title:
                    heading.decompose()

            for tag in container.find_all(True):
                if tag.name not in self.ALLOWED_DESCRIPTION_TAGS:
                    tag.unwrap()
                    continue

                if tag.name == "a":
                    href = tag.get("href")
                    safe_href = href if isinstance(href, str) and href.startswith(("http://", "https://", "/")) else None
                    tag.attrs = {}
                    if safe_href:
                        tag["href"] = safe_href
                        tag["target"] = "_blank"
                        tag["rel"] = "noopener noreferrer"
                else:
                    tag.attrs = {}

            # Drop empty paragraphs often present in WordPress content.
            for p in container.find_all("p"):
                if not self._node_text(p):
                    p.decompose()

            html_body = "".join(str(child) for child in container.children).strip()
            if html_body:
                descriptions[title] = html_body

        return descriptions

    def _extract_job_info(self, page):
        job_info = {}

        for item in page.select(".job-detail-detail ul.list li"):
            key = self._first_text(item, [".text", "strong"])
            value = self._first_text(item, [".value", "span", "p"])
            if key and value:
                job_info[key] = value

        job_type = self._first_text(page, [".job-type .type-job", ".job-type"])
        if job_type:
            job_info["Type"] = job_type

        deadline = self._first_text(page, [".job-deadline"])
        if deadline:
            job_info["Deadline"] = deadline

        return job_info

    def scrape(self, response: Response):
        page = BeautifulSoup(response.content, "html.parser")
        url = response.url

        title = self._first_text(page, [".job-detail-title", ".job-detail-header .job-title", ".job-title"])
        if title is None:
            raise Exception("Failed to scrape ITWorks job detail title.")

        company_name, company_url = self._extract_company(page, url)
        thumbnail = self._extract_thumbnail(page, url)
        province = self._first_text(page, [".job-location"])
        salary = self._first_text(page, [".job-salary", ".job-detail-detail .value .price-text"])
        skills = self._extract_skills(page)
        descriptions = self._extract_descriptions(page)
        job_info = self._extract_job_info(page)
        deadline = extract_deadline_from_job_info(job_info)

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
