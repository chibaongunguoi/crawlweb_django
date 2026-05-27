#!/usr/bin/env bash
# ============================================================
# CrawlWeb - HTTPS Verification Script
# ============================================================
# Usage:
#   chmod +x deploy/check_https.sh
#   ./deploy/check_https.sh DOMAIN=example.com
#   DOMAIN=example.com ./deploy/check_https.sh
#   ./deploy/check_https.sh --domain example.com
#
# Checks:
#   - HTTPS connectivity and status code
#   - HTTP → HTTPS redirect
#   - TLS certificate subject/issuer/expiry
#   - Security headers (HSTS, X-Frame-Options, etc.)
#   - Certbot auto-renew dry-run (requires sudo/root)
#   - Service statuses (nginx, crawlweb-backend, crawlweb-scraper)
# ============================================================

set -u

DEFAULT_PROJECT_DIR="/opt/crawlweb"
DOMAIN="${DOMAIN:-}"
PROJECT_DIR="${PROJECT_DIR:-${DEFAULT_PROJECT_DIR}}"
CERT_DAYS_WARN="${CERT_DAYS_WARN:-30}"
RUN_RENEW_DRY_RUN="${RUN_RENEW_DRY_RUN:-true}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PASS=0
WARN=0
FAIL=0

log()  { echo -e "${CYAN}[CHECK]${NC} $1"; }
ok()   { echo -e "${GREEN}✅ PASS${NC} $1"; PASS=$((PASS + 1)); }
warn() { echo -e "${YELLOW}⚠️  WARN${NC} $1"; WARN=$((WARN + 1)); }
fail() { echo -e "${RED}❌ FAIL${NC} $1"; FAIL=$((FAIL + 1)); }

while [[ $# -gt 0 ]]; do
    case "$1" in
        --domain) DOMAIN="$2"; shift 2 ;;
        --project) PROJECT_DIR="$2"; shift 2 ;;
        --no-renew-dry-run) RUN_RENEW_DRY_RUN="false"; shift ;;
        --help|-h)
            echo "Usage: ./check_https.sh --domain DOMAIN [--project PROJECT_DIR] [--no-renew-dry-run]"
            echo ""
            echo "Environment variables:"
            echo "  DOMAIN              Domain to test"
            echo "  PROJECT_DIR          Project directory (default: /opt/crawlweb)"
            echo "  CERT_DAYS_WARN       Warn when cert expires within N days (default: 30)"
            echo "  RUN_RENEW_DRY_RUN    true/false (default: true)"
            exit 0
            ;;
        *) warn "Unknown argument: $1"; shift ;;
    esac
done

if [[ -z "${DOMAIN}" ]]; then
    read -rp "Enter domain to verify (e.g., itjobs.ddns.net): " DOMAIN
fi

if [[ -z "${DOMAIN}" ]]; then
    fail "DOMAIN is required."
    exit 1
fi

log "============================================"
log "CrawlWeb HTTPS Verification"
log "============================================"
echo "Domain:      ${DOMAIN}"
echo "Project dir: ${PROJECT_DIR}"
echo ""

# ============================================================
# 1. DNS check
# ============================================================
log "1) DNS resolution"

DNS_IP=""
if command -v dig &>/dev/null; then
    DNS_IP=$(dig +short "${DOMAIN}" @8.8.8.8 2>/dev/null | head -1 || echo "")
elif command -v nslookup &>/dev/null; then
    DNS_IP=$(nslookup "${DOMAIN}" 2>/dev/null | awk '/^Address: / { print $2 }' | tail -1 || echo "")
fi

if [[ -n "${DNS_IP}" ]]; then
    ok "${DOMAIN} resolves to ${DNS_IP}"
else
    warn "Could not resolve ${DOMAIN}. DNS may still be propagating."
fi

# ============================================================
# 2. HTTPS connectivity
# ============================================================
log "2) HTTPS connectivity"

HTTPS_CODE=$(curl -sS -o /tmp/crawlweb_https_check_body -w "%{http_code}" --max-time 20 "https://${DOMAIN}/" 2>/tmp/crawlweb_https_check_error || echo "000")
if [[ "${HTTPS_CODE}" =~ ^(200|301|302)$ ]]; then
    ok "HTTPS endpoint responds with HTTP ${HTTPS_CODE}"
else
    fail "HTTPS endpoint returned HTTP ${HTTPS_CODE}"
    echo "curl error:"
    cat /tmp/crawlweb_https_check_error 2>/dev/null || true
fi

API_CODE=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 20 "https://${DOMAIN}/api/" 2>/dev/null || echo "000")
if [[ "${API_CODE}" =~ ^(200|301|302|404)$ ]]; then
    ok "HTTPS /api/ reachable (HTTP ${API_CODE})"
else
    warn "HTTPS /api/ returned HTTP ${API_CODE}. Check backend/proxy if API is expected here."
fi

# ============================================================
# 3. HTTP -> HTTPS redirect
# ============================================================
log "3) HTTP → HTTPS redirect"

REDIRECT_INFO=$(curl -sS -o /dev/null -w "%{http_code} %{redirect_url}" --max-time 20 "http://${DOMAIN}/" 2>/dev/null || echo "000")
REDIRECT_CODE=$(echo "${REDIRECT_INFO}" | awk '{print $1}')
REDIRECT_URL=$(echo "${REDIRECT_INFO}" | cut -d' ' -f2-)

if [[ "${REDIRECT_CODE}" == "301" || "${REDIRECT_CODE}" == "302" ]]; then
    if echo "${REDIRECT_URL}" | grep -q "^https://${DOMAIN}"; then
        ok "HTTP redirects to HTTPS: ${REDIRECT_CODE} → ${REDIRECT_URL}"
    else
        warn "HTTP redirects, but target is unexpected: ${REDIRECT_CODE} → ${REDIRECT_URL}"
    fi
else
    fail "HTTP redirect not working. Got HTTP ${REDIRECT_CODE}"
fi

# ============================================================
# 4. Certificate details and expiry
# ============================================================
log "4) TLS certificate"

CERT_OUTPUT=$(echo | openssl s_client -servername "${DOMAIN}" -connect "${DOMAIN}:443" 2>/dev/null | openssl x509 -noout -subject -issuer -dates 2>/dev/null || echo "")

if [[ -n "${CERT_OUTPUT}" ]]; then
    ok "TLS certificate is readable."
    echo "${CERT_OUTPUT}" | sed 's/^/  /'

    NOT_AFTER=$(echo "${CERT_OUTPUT}" | awk -F= '/notAfter/ {print $2}')
    if [[ -n "${NOT_AFTER}" ]]; then
        EXPIRY_TS=$(date -d "${NOT_AFTER}" +%s 2>/dev/null || echo "0")
        NOW_TS=$(date +%s)
        DAYS_LEFT=$(( (EXPIRY_TS - NOW_TS) / 86400 ))

        if [[ "${DAYS_LEFT}" -gt "${CERT_DAYS_WARN}" ]]; then
            ok "Certificate expires in ${DAYS_LEFT} days."
        elif [[ "${DAYS_LEFT}" -gt 0 ]]; then
            warn "Certificate expires soon: ${DAYS_LEFT} days left."
        else
            fail "Certificate appears to be expired."
        fi
    else
        warn "Could not parse certificate expiry."
    fi
else
    fail "Could not read TLS certificate from ${DOMAIN}:443"
fi

# ============================================================
# 5. Security headers
# ============================================================
log "5) Security headers"

HEADERS=$(curl -skI --max-time 20 "https://${DOMAIN}/" 2>/dev/null || echo "")

check_header() {
    local header_name="$1"
    if echo "${HEADERS}" | grep -iq "^${header_name}:"; then
        ok "Header present: ${header_name}"
    else
        fail "Missing header: ${header_name}"
    fi
}

check_header "Strict-Transport-Security"
check_header "X-Frame-Options"
check_header "X-Content-Type-Options"
check_header "Referrer-Policy"
check_header "Content-Security-Policy"

# ============================================================
# 6. Local services (if running on the EC2 host)
# ============================================================
log "6) Local service status"

if command -v systemctl &>/dev/null; then
    for svc in nginx crawlweb-backend crawlweb-scraper; do
        if systemctl is-active --quiet "${svc}" 2>/dev/null; then
            ok "${svc} is running"
        else
            fail "${svc} is NOT running. Check: sudo systemctl status ${svc}"
        fi
    done
else
    warn "systemctl not available; skipping service status checks."
fi

# ============================================================
# 7. Certbot timer / renew dry-run
# ============================================================
log "7) Certbot auto-renew"

if command -v certbot &>/dev/null; then
    ok "Certbot installed: $(certbot --version 2>&1)"

    if command -v systemctl &>/dev/null; then
        if systemctl list-timers --all 2>/dev/null | grep -qE "certbot|crawlweb-certbot-renew"; then
            ok "Certbot renewal timer exists."
            systemctl list-timers --all 2>/dev/null | grep -E "certbot|crawlweb-certbot-renew" | sed 's/^/  /' || true
        else
            warn "No certbot renewal timer detected. Check: systemctl list-timers | grep cert"
        fi
    fi

    if [[ "${RUN_RENEW_DRY_RUN}" == "true" ]]; then
        if [[ $EUID -ne 0 ]]; then
            warn "Skipping certbot renew --dry-run because script is not running as root. Run with sudo to test renewal."
        else
            log "Running certbot renew --dry-run (this can take a minute)..."
            if certbot renew --dry-run; then
                ok "certbot renew --dry-run succeeded."
            else
                fail "certbot renew --dry-run failed."
            fi
        fi
    else
        warn "Renew dry-run skipped by --no-renew-dry-run."
    fi
else
    fail "Certbot is not installed."
fi

# ============================================================
# Summary
# ============================================================
echo ""
log "============================================"
log "Verification Summary"
log "============================================"
echo -e "  ${GREEN}PASS:${NC} ${PASS}"
echo -e "  ${YELLOW}WARN:${NC} ${WARN}"
echo -e "  ${RED}FAIL:${NC} ${FAIL}"
echo ""

echo "Useful commands:"
echo "  curl -I https://${DOMAIN}"
echo "  curl -I http://${DOMAIN}"
echo "  sudo certbot certificates"
echo "  sudo certbot renew --dry-run"
echo "  sudo nginx -t"
echo "  sudo systemctl status nginx crawlweb-backend crawlweb-scraper"
echo ""

if [[ "${FAIL}" -gt 0 ]]; then
    exit 1
fi

exit 0