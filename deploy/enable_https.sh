#!/usr/bin/env bash
# ============================================================
# CrawlWeb - Enable HTTPS with Let's Encrypt (Certbot)
# ============================================================
# Usage:
#   chmod +x deploy/enable_https.sh
#   sudo ./enable_https.sh                     (interactive - sẽ hỏi DOMAIN, EMAIL)
#   sudo DOMAIN=example.com EMAIL=admin@example.com ./enable_https.sh
#   sudo ./enable_https.sh --domain example.com --email admin@example.com
#
# This script (idempotent):
#   1. Validates parameters (DOMAIN, EMAIL)
#   2. Backs up existing Nginx config (timestamped)
#   3. Installs Certbot + nginx plugin if needed
#   4. Obtains or renews SSL certificate
#   5. Writes new Nginx config (HTTPS + HTTP redirect + security headers)
#   6. Enables HTTP/2, OCSP stapling
#   7. Restarts/reloads services
#   8. Verifies HTTPS endpoint and HSTS header
#   9. Sets up auto-renew via systemd timer (or cron fallback)
# ============================================================

set -euo pipefail

# ----------------------- Configuration Defaults -----------------------
DEFAULT_PROJECT_DIR="/opt/crawlweb"
DEFAULT_DJANGO_PORT=8000
DEFAULT_SCRAPER_PORT=37001
LOG_DIR="/var/log/crawlweb"
LOG_FILE="${LOG_DIR}/enable_https.log"
NGINX_SITE="/etc/nginx/sites-available/crawlweb"
BACKUP_DIR="/etc/nginx/backup"

# ----------------------- Colors -----------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

write_log() {
    mkdir -p "${LOG_DIR}" 2>/dev/null || true
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$1] $2" >> "${LOG_FILE}" 2>/dev/null || true
}

log()  { echo -e "${GREEN}[HTTPS]${NC} $1"; write_log "INFO" "$1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; write_log "WARN" "$1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; write_log "ERROR" "$1"; exit 1; }

# ----------------------- Parse Arguments -----------------------
DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"
PROJECT_DIR="${PROJECT_DIR:-${DEFAULT_PROJECT_DIR}}"
DJANGO_PORT="${DJANGO_PORT:-${DEFAULT_DJANGO_PORT}}"
SCRAPER_PORT="${SCRAPER_PORT:-${DEFAULT_SCRAPER_PORT}}"

while [[ $# -gt 0 ]]; do
    case "$1" in
        DOMAIN=*)      DOMAIN="${1#DOMAIN=}"; shift ;;
        EMAIL=*)       EMAIL="${1#EMAIL=}"; shift ;;
        PROJECT_DIR=*) PROJECT_DIR="${1#PROJECT_DIR=}"; shift ;;
        DJANGO_PORT=*) DJANGO_PORT="${1#DJANGO_PORT=}"; shift ;;
        SCRAPER_PORT=*) SCRAPER_PORT="${1#SCRAPER_PORT=}"; shift ;;
        --domain)   DOMAIN="$2"; shift 2 ;;
        --email)    EMAIL="$2"; shift 2 ;;
        --project)  PROJECT_DIR="$2"; shift 2 ;;
        --help|-h)
            echo "Usage: sudo ./enable_https.sh --domain DOMAIN --email EMAIL [--project PROJECT_DIR]"
            echo ""
            echo "Options:"
            echo "  --domain   Domain name (e.g., example.com)"
            echo "  --email    Email for Let's Encrypt notifications"
            echo "  --project  Project directory (default: /opt/crawlweb)"
            exit 0
            ;;
        *) warn "Unknown argument: $1"; shift ;;
    esac
done

# ----------------------- Pre-checks -----------------------
if [[ $EUID -ne 0 ]]; then
    err "This script must be run as root. Use: sudo ./enable_https.sh"
fi

# Create log directory
mkdir -p "${LOG_DIR}"
mkdir -p "${BACKUP_DIR}"

log "============================================"
log "CrawlWeb HTTPS Setup - Starting"
log "============================================"

# Interactive prompts if variables not set
if [[ -z "${DOMAIN}" ]]; then
    read -rp "Enter your domain (e.g., itjobs.ddns.net): " DOMAIN
fi
if [[ -z "${EMAIL}" ]]; then
    read -rp "Enter admin email for Let's Encrypt: " EMAIL
fi

# Validate
if [[ -z "${DOMAIN}" ]]; then
    err "DOMAIN is required. Set via environment variable or --domain flag."
fi
if [[ -z "${EMAIL}" ]]; then
    err "EMAIL is required. Set via environment variable or --email flag."
fi

log "Domain:       ${DOMAIN}"
log "Email:        ${EMAIL}"
log "Project dir:  ${PROJECT_DIR}"
log "Django port:  ${DJANGO_PORT}"
log "Scraper port: ${SCRAPER_PORT}"

# ============================================================
# STEP 1: Verify prerequisites
# ============================================================
log "Step 1/9: Verifying prerequisites..."

# Check Nginx is installed
if ! command -v nginx &>/dev/null; then
    err "Nginx is not installed. Run deploy.sh first."
fi

# Check that project directory exists
if [[ ! -d "${PROJECT_DIR}" ]]; then
    err "Project directory not found: ${PROJECT_DIR}. Run deploy.sh first."
fi

# Check that current Nginx config exists
if [[ ! -f "${NGINX_SITE}" ]]; then
    err "Nginx site config not found: ${NGINX_SITE}. Run deploy.sh first."
fi

# Check DNS resolves to this server's IP
log "Checking DNS resolution for ${DOMAIN}..."
PUBLIC_IP=$(curl -s --max-time 10 http://checkip.amazonaws.com 2>/dev/null || echo "")
DNS_IP=$(dig +short "${DOMAIN}" @8.8.8.8 2>/dev/null | head -1 || nslookup "${DOMAIN}" 2>/dev/null | awk '/^Address: / { print $2 }' | tail -1 || echo "")

if [[ -n "${PUBLIC_IP}" && -n "${DNS_IP}" ]]; then
    if [[ "${PUBLIC_IP}" != "${DNS_IP}" ]]; then
        warn "DNS mismatch! Domain ${DOMAIN} resolves to ${DNS_IP} but this server's public IP is ${PUBLIC_IP}."
        warn "Certbot may fail if DNS doesn't point to this server."
        warn "Continue? (Ctrl+C to abort, or wait 5 seconds to proceed)"
        sleep 5
    else
        log "DNS OK: ${DOMAIN} → ${DNS_IP} matches server IP."
    fi
else
    warn "Could not verify DNS. Continuing anyway..."
fi

# ============================================================
# STEP 2: Backup current Nginx config
# ============================================================
log "Step 2/9: Backing up Nginx config..."

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/crawlweb_${TIMESTAMP}.conf"

cp "${NGINX_SITE}" "${BACKUP_FILE}"
log "Backup saved to: ${BACKUP_FILE}"

# Keep only the last 10 backups
ls -1t "${BACKUP_DIR}"/crawlweb_*.conf 2>/dev/null | tail -n +11 | xargs -r rm -f
log "Old backups cleaned (kept last 10)."

# ============================================================
# STEP 3: Open firewall ports 80 & 443
# ============================================================
log "Step 3/9: Configuring firewall..."

if command -v ufw &>/dev/null; then
    ufw allow 80/tcp >/dev/null 2>&1 || true
    ufw allow 443/tcp >/dev/null 2>&1 || true
    log "UFW: ports 80 and 443 allowed."
else
    warn "UFW not found. Ensure ports 80 and 443 are open in AWS Security Group."
fi

# ============================================================
# STEP 4: Install Certbot + nginx plugin
# ============================================================
log "Step 4/9: Installing Certbot..."

if ! command -v certbot &>/dev/null; then
    apt-get update -y
    apt-get install -y certbot python3-certbot-nginx
    log "Certbot installed."
else
    log "Certbot already installed: $(certbot --version 2>&1)"
fi

# ============================================================
# STEP 5: Ensure Nginx is running (Certbot --nginx needs it)
# ============================================================
log "Step 5/9: Ensuring Nginx is running..."

# Write a temporary HTTP-only config so Certbot can verify domain
# (in case current config is broken)
nginx -t 2>/dev/null || {
    warn "Current Nginx config has errors. Restoring from backup..."
    # Try the most recent backup
    LATEST_BACKUP=$(ls -1t "${BACKUP_DIR}"/crawlweb_*.conf 2>/dev/null | head -1)
    if [[ -n "${LATEST_BACKUP}" && -f "${LATEST_BACKUP}" ]]; then
        cp "${LATEST_BACKUP}" "${NGINX_SITE}"
        nginx -t || err "Restored config also fails. Manual intervention needed."
    else
        err "No backup available. Manual intervention needed."
    fi
}

systemctl reload nginx 2>/dev/null || systemctl restart nginx || err "Cannot start Nginx."

# ============================================================
# STEP 6: Obtain or renew SSL certificate
# ============================================================
log "Step 6/9: Obtaining SSL certificate..."

CERT_PATH="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"

if [[ -f "${CERT_PATH}" ]]; then
    log "Certificate already exists for ${DOMAIN}."
    log "Checking expiry and performing renewal if needed..."

    # Check expiry
    EXPIRY=$(openssl x509 -enddate -noout -in "${CERT_PATH}" 2>/dev/null | cut -d= -f2)
    log "Current certificate expires: ${EXPIRY}"

    # Attempt renewal (will skip if not due)
    certbot renew --cert-name "${DOMAIN}" --quiet 2>/dev/null && \
        log "Certificate renewed (or was still valid)." || \
        log "Certificate renewal not needed yet."

    # Re-check after potential renewal
    EXPIRY=$(openssl x509 -enddate -noout -in "${CERT_PATH}" 2>/dev/null | cut -d= -f2)
    log "Certificate expiry after check: ${EXPIRY}"
else
    log "Requesting new certificate for ${DOMAIN}..."

    certbot certonly \
        --nginx \
        --non-interactive \
        --agree-tos \
        --email "${EMAIL}" \
        --domains "${DOMAIN}" \
        || err "Certbot failed to obtain certificate. Check: certbot certonly --nginx -d ${DOMAIN}"

    log "Certificate obtained successfully!"
fi

# Verify certificate files exist
if [[ ! -f "${CERT_PATH}" ]]; then
    err "Certificate file not found after certbot run: ${CERT_PATH}"
fi

log "Certificate: ${CERT_PATH}"
log "Private key: /etc/letsencrypt/live/${DOMAIN}/privkey.pem"

# ============================================================
# STEP 7: Write new Nginx config with HTTPS
# ============================================================
log "Step 7/9: Writing new Nginx configuration..."

# Generate Diffie-Hellman parameters if not exists (for stronger security)
DH_PARAM="/etc/letsencrypt/ssl-dhparams.pem"
if [[ ! -f "${DH_PARAM}" ]]; then
    log "Generating Diffie-Hellman parameters (this may take a minute)..."
    openssl dhparam -out "${DH_PARAM}" 2048 2>/dev/null || {
        warn "DH param generation failed. Using Certbot default."
        DH_PARAM="/etc/ssl/certs/dhparam.pem"
        if [[ ! -f "${DH_PARAM}" ]]; then
            DH_PARAM=""
        fi
    }
fi

cat > "${NGINX_SITE}" << 'NGINX_EOF'
# ============================================================
# CrawlWeb Nginx Configuration - HTTPS (Managed by enable_https.sh)
# ============================================================

# --- HTTP → HTTPS Redirect ---
server {
    listen 80;
    listen [::]:80;
    server_name __DOMAIN__;

    # Allow Certbot ACME challenge
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Redirect all other HTTP traffic to HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}

# --- HTTPS Server Block ---
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name __DOMAIN__;

    # --- SSL Certificate ---
    ssl_certificate     /etc/letsencrypt/live/__DOMAIN__/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/__DOMAIN__/privkey.pem;

    # --- SSL Configuration ---
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # --- OCSP Stapling ---
    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 8.8.8.8 8.8.4.4 valid=300s;
    resolver_timeout 5s;

    # --- SSL Session ---
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;
    ssl_session_tickets off;

    # --- DH Parameters ---
    __DH_PARAM_LINE__

    # --- Security Headers ---
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self';" always;

    # --- Frontend static files (React build) ---
    root __PROJECT_DIR__/client/app/build;
    index index.html;

    # --- Gzip compression ---
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;

    # --- Django API proxy ---
    location /api/ {
        proxy_pass http://127.0.0.1:__DJANGO_PORT__;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_connect_timeout 10s;
    }

    # --- React build static assets ---
    location /static/ {
        alias __PROJECT_DIR__/client/app/build/static/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # --- Django static files ---
    location /backend-static/ {
        alias __PROJECT_DIR__/server/crawlweb/staticfiles/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # --- Django media files (CV uploads etc.) ---
    location /media/ {
        alias __PROJECT_DIR__/server/crawlweb/media/;
        expires 7d;
    }

    # --- Django admin ---
    location /admin/ {
        proxy_pass http://127.0.0.1:__DJANGO_PORT__;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # --- React SPA fallback ---
    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX_EOF

# Replace placeholders
sed -i "s|__DOMAIN__|${DOMAIN}|g"                          "${NGINX_SITE}"
sed -i "s|__PROJECT_DIR__|${PROJECT_DIR}|g"                "${NGINX_SITE}"
sed -i "s|__DJANGO_PORT__|${DJANGO_PORT}|g"                "${NGINX_SITE}"

# DH param line
if [[ -n "${DH_PARAM}" && -f "${DH_PARAM}" ]]; then
    sed -i "s|__DH_PARAM_LINE__|ssl_dhparam ${DH_PARAM};|" "${NGINX_SITE}"
else
    sed -i "s|__DH_PARAM_LINE__|# ssl_dhparam not configured|" "${NGINX_SITE}"
fi

log "Nginx config written to: ${NGINX_SITE}"

# ============================================================
# STEP 8: Test & reload Nginx, restart services
# ============================================================
log "Step 8/9: Testing and reloading services..."

# Test Nginx config
if ! nginx -t 2>&1; then
    err "Nginx configuration test failed! Restoring backup..."
    LATEST_BACKUP=$(ls -1t "${BACKUP_DIR}"/crawlweb_*.conf 2>/dev/null | head -1)
    if [[ -n "${LATEST_BACKUP}" ]]; then
        cp "${LATEST_BACKUP}" "${NGINX_SITE}"
        nginx -t && systemctl reload nginx
        log "Restored previous config from: ${LATEST_BACKUP}"
    fi
    err "HTTPS setup failed. Nginx config was restored from backup."
fi

# Reload Nginx (no downtime)
systemctl reload nginx 2>/dev/null || systemctl restart nginx
log "Nginx reloaded."

# Restart backend & scraper services
systemctl restart crawlweb-backend 2>/dev/null && \
    log "crawlweb-backend restarted." || \
    warn "Failed to restart crawlweb-backend. Check: systemctl status crawlweb-backend"

systemctl restart crawlweb-scraper 2>/dev/null && \
    log "crawlweb-scraper restarted." || \
    warn "Failed to restart crawlweb-scraper. Check: systemctl status crawlweb-scraper"

# Check service statuses
echo ""
log "--- Service Status ---"
for svc in nginx crawlweb-backend crawlweb-scraper mongod; do
    if systemctl is-active --quiet "${svc}" 2>/dev/null; then
        echo -e "  ${GREEN}✅${NC} ${svc}: running"
    else
        echo -e "  ${RED}❌${NC} ${svc}: NOT running"
        warn "${svc} is not running!"
    fi
done
echo ""

# ============================================================
# STEP 9: Verify HTTPS & set up auto-renew
# ============================================================
log "Step 9/9: Verification and auto-renew setup..."

# Wait for Nginx to fully reload
sleep 2

# Test HTTPS endpoint
log "Testing HTTPS endpoint..."
HTTPS_CODE=$(curl -sk -o /dev/null -w "%{http_code}" "https://127.0.0.1" 2>/dev/null || echo "000")
if [[ "${HTTPS_CODE}" =~ ^(200|301|302)$ ]]; then
    log "✅ HTTPS endpoint responds: HTTP ${HTTPS_CODE}"
else
    warn "HTTPS endpoint returned: HTTP ${HTTPS_CODE} (may need a moment to start)"
fi

# Test HSTS header
log "Checking HSTS header..."
HSTS=$(curl -sk -I "https://127.0.0.1" 2>/dev/null | grep -i "strict-transport-security" || echo "")
if [[ -n "${HSTS}" ]]; then
    log "✅ HSTS header present: ${HSTS}"
else
    warn "HSTS header not detected. Check Nginx config."
fi

# Test HTTP → HTTPS redirect
log "Testing HTTP → HTTPS redirect..."
REDIRECT_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1" 2>/dev/null || echo "000")
if [[ "${REDIRECT_CODE}" == "301" || "${REDIRECT_CODE}" == "302" ]]; then
    log "✅ HTTP → HTTPS redirect working (HTTP ${REDIRECT_CODE})"
else
    warn "HTTP redirect returned: ${REDIRECT_CODE} (expected 301)"
fi

# --- Auto-renew setup ---
log "Setting up auto-renew..."

# Prefer systemd timer (modern approach)
if systemctl list-unit-files | grep -q "certbot.timer"; then
    systemctl enable certbot.timer 2>/dev/null || true
    systemctl start certbot.timer 2>/dev/null || true
    log "✅ Certbot systemd timer enabled."
else
    # Fallback: create a custom systemd timer
    cat > /etc/systemd/system/crawlweb-certbot-renew.service << 'EOF'
[Unit]
Description=Certbot renewal for CrawlWeb
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/bin/certbot renew --quiet --deploy-hook "systemctl reload nginx"
EOF

    cat > /etc/systemd/system/crawlweb-certbot-renew.timer << 'EOF'
[Unit]
Description=Run certbot renewal twice daily for CrawlWeb

[Timer]
OnCalendar=*-*-* 02,14:30:00
RandomizedDelaySec=3600
Persistent=true

[Install]
WantedBy=timers.target
EOF

    systemctl daemon-reload
    systemctl enable crawlweb-certbot-renew.timer
    systemctl start crawlweb-certbot-renew.timer
    log "✅ Custom certbot renewal timer created and started."
    log "   Timer: crawlweb-certbot-renew.timer"
    log "   Runs twice daily at 02:30 and 14:30 (with random delay)"
fi

# Verify renewal dry-run
log "Running renewal dry-run test..."
if certbot renew --dry-run --quiet 2>/dev/null; then
    log "✅ Certbot renewal dry-run succeeded."
else
    warn "Certbot renewal dry-run failed. Auto-renew may not work. Check: certbot renew --dry-run"
fi

# ============================================================
# Summary
# ============================================================
log "============================================"
log "HTTPS Setup Complete!"
log "============================================"
echo ""
echo -e "${CYAN}Access:${NC}"
echo "  Frontend: https://${DOMAIN}"
echo "  API:      https://${DOMAIN}/api/"
echo "  Admin:    https://${DOMAIN}/admin/"
echo ""
echo -e "${CYAN}Certificate:${NC}"
echo "  Path:     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
EXPIRY_DATE=$(openssl x509 -enddate -noout -in "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" 2>/dev/null | cut -d= -f2 || echo "unknown")
echo "  Expires:  ${EXPIRY_DATE}"
echo ""
echo -e "${CYAN}Auto-renew:${NC}"
echo "  Check:    systemctl list-timers | grep cert"
echo "  Dry-run:  sudo certbot renew --dry-run"
echo ""
echo -e "${CYAN}Backup:${NC}"
echo "  Nginx:    ${BACKUP_FILE}"
echo "  Restore:  sudo cp ${BACKUP_FILE} ${NGINX_SITE} && sudo nginx -t && sudo systemctl reload nginx"
echo ""
echo -e "${CYAN}Logs:${NC}"
echo "  This script: ${LOG_FILE}"
echo "  Nginx:       tail -f /var/log/nginx/error.log"
echo "  Backend:     journalctl -u crawlweb-backend -f"
echo "  Scraper:     journalctl -u crawlweb-scraper -f"
echo ""
echo -e "${CYAN}Verify:${NC}"
echo "  curl -I https://${DOMAIN}"
echo "  sudo ./deploy/check_https.sh"
echo ""
echo -e "${YELLOW}Django HTTPS Settings (manual steps):${NC}"
echo "  Add to settings.py:"
echo "    SECURE_SSL_REDIRECT = True"
echo "    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')"
echo "    SESSION_COOKIE_SECURE = True"
echo "    CSRF_COOKIE_SECURE = True"
echo "    CORS_ALLOWED_ORIGINS = [\"https://${DOMAIN}\", ...]"
echo ""
echo "  Full guide: docs/ENABLE_HTTPS.md"
echo ""
log "Done! Open https://${DOMAIN} in your browser."