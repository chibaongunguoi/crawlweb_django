def removeConsecutiveSpaces(s: str) -> str:
    lines = [line.strip() for line in s.split("\n") if line.strip() != ""]
    s = "\n".join(lines)

    old_char = ""
    result = ""
    for c in s:
        if old_char != " " or c != " ":
            result += c

        old_char = c

    return result


def _strip_accents(value: str) -> str:
    import unicodedata

    normalized = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


def extract_deadline_from_job_info(job_info: dict) -> str | None:
    if not isinstance(job_info, dict):
        return None

    for key, value in job_info.items():
        if not key or not value:
            continue
        normalized = _strip_accents(str(key)).lower()
        if "deadline" in normalized or "han nop" in normalized:
            return str(value)

    return None
