import hashlib
from urllib.parse import parse_qsl, quote, urlencode, urlsplit, urlunsplit


TRACKING_PARAM_PREFIXES = ('utm_',)
TRACKING_PARAM_NAMES = {
    'fbclid',
    'gclid',
    'msclkid',
    'yclid',
    'mc_cid',
    'mc_eid',
}


def normalize_url(url):
    """
    Canonicalize job URLs for idempotent persistence.

    Rules:
    - Default scheme to https when missing.
    - Lowercase host.
    - Remove leading www.
    - Remove fragment.
    - Remove tracking params (utm_* and common click IDs).
    - Sort remaining query params deterministically.
    - Strip trailing slash from path except root.
    """
    if not url:
        return ''

    raw_url = str(url).strip()
    if not raw_url:
        return ''

    if '://' not in raw_url and not raw_url.startswith('//'):
        raw_url = f'https://{raw_url}'

    split = urlsplit(raw_url, scheme='https')
    scheme = (split.scheme or 'https').lower()
    hostname = (split.hostname or '').lower()

    if hostname.startswith('www.'):
        hostname = hostname[4:]

    if not hostname:
        return ''

    netloc = hostname
    if split.port:
        netloc = f'{netloc}:{split.port}'

    path = quote(split.path or '/', safe='/%:@')
    if path != '/':
        path = path.rstrip('/')

    query_pairs = []
    for key, value in parse_qsl(split.query, keep_blank_values=True):
        lowered_key = key.lower()
        if lowered_key in TRACKING_PARAM_NAMES:
            continue
        if any(lowered_key.startswith(prefix) for prefix in TRACKING_PARAM_PREFIXES):
            continue
        query_pairs.append((key, value))

    query_pairs.sort(key=lambda pair: (pair[0], pair[1]))
    query = urlencode(query_pairs, doseq=True)

    return urlunsplit((scheme, netloc, path, query, ''))


def compute_url_hash(url):
    normalized_url = normalize_url(url)
    if not normalized_url:
        return ''
    return hashlib.sha256(normalized_url.encode('utf-8')).hexdigest()