from api.models import JobDetail
from api.scrape_views import extract_source

c = 0

for j in JobDetail.objects.all():
    if not j.source or j.source == "unknown":
        s = extract_source(j.url)
        if s and s != j.source:
            j.source = s
            j.save()
            c += 1

print("updated", c)