#!/usr/bin/env bash
# ============================================================
# CrawlWeb - Production Deployment Script for AWS EC2 (Ubuntu)
# ============================================================
# Usage:
#   chmod +x deploy/deploy.sh
#   sudo ./deploy/deploy.sh
#
# This script:
#   1. Installs system packages (Nginx, Python, Node.js, MongoDB)
#   2. Sets up the project directory
#   3. Creates Python venv and installs backend + scraper deps
#   4. Builds React frontend (with API URL replacement)
#   5. Runs Django collectstatic
#   6. Configures systemd services (backend + scraper)
#   7. Configures Nginx reverse proxy (HTTP)
#   8. Opens firewall ports
# ============================================================

set -euo pipefail

# ----------------------- Configuration -----------------------
PROJECT_DIR="/opt/crawlweb"
REPO_URL="https://github.com/chibaongunguoi/crawlweb_django.git"
BRANCH="main"
DOMAIN_OR_IP="${EC2_PUBLIC_IP:-$(curl -s http://checkip.amazonaws.com || echo 'YOUR_EC2_IP')}"
DJANGO_PORT=8000
SCRAPER_PORT=37001
NGINX_HTTP_PORT=80
MONGO_DB="pbl4_db"

# ----------------------- Colors -----------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ----------------------- Pre-checks -----------------------
if [[ $EUID -ne 0 ]]; then
    err "This script must be run as root. Use: sudo ./deploy.sh"
fi

log "Starting deployment for CrawlWeb..."
log "Domain/IP: ${DOMAIN_OR_IP}"
log "Project directory: ${PROJECT_DIR}"

# ============================================================
# STEP 1: System packages
# ============================================================
log "Step 1/8: Installing system packages..."

apt-get update -y
apt-get upgrade -y
apt-get install -y \
    curl wget git \
    build-essential \
    python3 python3-pip python3-venv python3-dev \
    nginx \
    certbot python3-certbot-nginx \
    gnupg

# ============================================================
# STEP 2: MongoDB 8.0
# ============================================================
log "Step 2/8: Installing MongoDB 8.0..."

if ! command -v mongod &>/dev/null; then
    curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | \
        gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor

    echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multimedya" > /etc/apt/sources.list.d/mongodb-org-8.0.list 2>/dev/null || \
    echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/8.0 multiverse" > /etc/apt/sources.list.d/mongodb-org-8.0.list

    apt-get update -y
    apt-get install -y mongodb-org

    systemctl daemon-reload
    systemctl enable mongod
    systemctl start mongod
    log "MongoDB installed and started."
else
    log "MongoDB already installed, skipping."
fi

# Wait for MongoDB to be ready
sleep 3
if mongosh --eval "db.runCommand({ping:1})" --quiet 2>/dev/null || mongo --eval "db.runCommand({ping:1})" --quiet 2>/dev/null; then
    log "MongoDB is running."
else
    warn "MongoDB may not be running. Check: systemctl status mongod"
fi

# ============================================================
# STEP 3: Node.js 20 (LTS)
# ============================================================
log "Step 3/8: Installing Node.js 20 LTS..."

if ! command -v node &>/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    log "Node.js $(node -v) installed."
else
    log "Node.js $(node -v) already installed."
fi

# ============================================================
# STEP 4: Clone / Update Project
# ============================================================
log "Step 4/8: Setting up project..."

if [[ -d "${PROJECT_DIR}/.git" ]]; then
    log "Project already exists, pulling latest..."
    cd "${PROJECT_DIR}"
    git fetch origin
    git checkout "${BRANCH}"
    git pull origin "${BRANCH}"
else
    log "Cloning project..."
    mkdir -p "$(dirname "${PROJECT_DIR}")"
    git clone -b "${BRANCH}" "${REPO_URL}" "${PROJECT_DIR}"
    cd "${PROJECT_DIR}"
fi

# ============================================================
# STEP 5: Create .env file
# ============================================================
log "Step 5/8: Setting up environment..."

if [[ ! -f "${PROJECT_DIR}/.env" ]]; then
    if [[ -f "${PROJECT_DIR}/.env.example" ]]; then
        cp "${PROJECT_DIR}/.env.example" "${PROJECT_DIR}/.env"
        
        # Auto-replace placeholders
        SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(50))")
        sed -i "s|CHANGE_ME_TO_A_RANDOM_STRING_50_CHARS|${SECRET_KEY}|g" "${PROJECT_DIR}/.env"
        sed -i "s|YOUR_EC2_PUBLIC_IP|${DOMAIN_OR_IP}|g" "${PROJECT_DIR}/.env"
        sed -i "s|http://YOUR_EC2_PUBLIC_IP|http://${DOMAIN_OR_IP}|g" "${PROJECT_DIR}/.env"
        
        log ".env created from .env.example with auto-generated SECRET_KEY."
        warn ">>> REVIEW and edit ${PROJECT_DIR}/.env if needed! <<<"
    else
        err ".env.example not found. Create .env manually."
    fi
else
    log ".env already exists, keeping current values."
fi

# Source .env for use in this script
set -a
source "${PROJECT_DIR}/.env" 2>/dev/null || true
set +a

# ============================================================
# STEP 6: Python Backend + Scraper Setup
# ============================================================
log "Step 6/8: Setting up Python environment..."

# --- Backend venv ---
cd "${PROJECT_DIR}/server"
python3 -m venv myworld
source myworld/bin/activate

# Upgrade pip
pip install --upgrade pip

# Install backend dependencies
pip install -r requirements.txt

# Install production server
pip install gunicorn

# Load test data if database is empty
JOB_COUNT=$(python -c "
import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'crawlweb.settings')
django.setup()
from api.models import JobDetail
print(JobDetail.objects.count())
" 2>/dev/null || echo "0")

if [[ "${JOB_COUNT}" == "0" ]]; then
    log "Database is empty, loading test data..."
    if [[ -f "load_test_data.py" ]]; then
        python manage.py shell < load_test_data.py 2>/dev/null || warn "Failed to load test data."
    fi
fi

# Collect static files
log "Running collectstatic..."
python manage.py collectstatic --noinput

deactivate

# --- Scraper venv ---
cd "${PROJECT_DIR}/server/scraper"
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
deactivate

log "Python environments ready."

# ============================================================
# STEP 7: Build React Frontend
# ============================================================
log "Step 7/8: Building React frontend..."

cd "${PROJECT_DIR}/client/app"

# Install dependencies
npm install

# Build production bundle with dynamic API URL
# The build will use relative URLs by default, and Nginx will proxy /api
npm run build

log "Frontend built to client/app/build/"

# ============================================================
# STEP 8: Configure Systemd + Nginx
# ============================================================
log "Step 8/8: Configuring services..."

# --- Django Backend Service ---
cat > /etc/systemd/system/crawlweb-backend.service << EOF
[Unit]
Description=CrawlWeb Django Backend (Gunicorn)
After=network.target mongod.service
Requires=mongod.service

[Service]
Type=notify
User=root
Group=root
WorkingDirectory=${PROJECT_DIR}/server
Environment="PATH=${PROJECT_DIR}/server/myworld/bin"
EnvironmentFile=${PROJECT_DIR}/.env
ExecStart=${PROJECT_DIR}/server/myworld/bin/gunicorn \\
    crawlweb.wsgi:application \\
    --bind 127.0.0.1:${DJANGO_PORT} \\
    --workers 3 \\
    --timeout 120 \\
    --access-logfile /var/log/crawlweb-backend-access.log \\
    --error-logfile /var/log/crawlweb-backend-error.log
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# --- Scraper Service ---
cat > /etc/systemd/system/crawlweb-scraper.service << EOF
[Unit]
Description=CrawlWeb Scraper Service (FastAPI/Uvicorn)
After=network.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=${PROJECT_DIR}/server/scraper
Environment="PATH=${PROJECT_DIR}/server/scraper/venv/bin"
EnvironmentFile=${PROJECT_DIR}/.env
ExecStart=${PROJECT_DIR}/server/scraper/venv/bin/python -m uvicorn \\
    src.main:app \\
    --host 127.0.0.1 \\
    --port ${SCRAPER_PORT}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# --- Nginx Config ---
cat > /etc/nginx/sites-available/crawlweb << EOF
server {
    listen ${NGINX_HTTP_PORT};
    server_name ${DOMAIN_OR_IP};

    # Frontend static files (React build)
    root ${PROJECT_DIR}/client/app/build;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;

    # Django API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:${DJANGO_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
        proxy_connect_timeout 10s;
    }

    # Django static files
    location /static/ {
        alias ${PROJECT_DIR}/server/staticfiles/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Django media files (CV uploads etc.)
    location /media/ {
        alias ${PROJECT_DIR}/server/media/;
        expires 7d;
    }

    # Django admin
    location /admin/ {
        proxy_pass http://127.0.0.1:${DJANGO_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # React SPA - serve index.html for all other routes
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

# Enable site, disable default
ln -sf /etc/nginx/sites-available/crawlweb /etc/nginx/sites-enabled/crawlweb
rm -f /etc/nginx/sites-enabled/default

# Test Nginx config
nginx -t || err "Nginx configuration test failed!"

# --- Firewall ---
if command -v ufw &>/dev/null; then
    ufw allow ${NGINX_HTTP_PORT}/tcp
    ufw allow 22/tcp
    ufw --force enable
    log "UFW firewall configured (ports 22, ${NGINX_HTTP_PORT})."
fi

# --- Start Services ---
systemctl daemon-reload
systemctl enable crawlweb-backend
systemctl enable crawlweb-scraper
systemctl restart crawlweb-backend
systemctl restart crawlweb-scraper
systemctl restart nginx

# ============================================================
# Verification
# ============================================================
log "============================================"
log "Deployment complete!"
log "============================================"
echo ""
echo -e "${CYAN}Services:${NC}"
echo "  Backend:  systemctl status crawlweb-backend"
echo "  Scraper:  systemctl status crawlweb-scraper"
echo "  Nginx:    systemctl status nginx"
echo "  MongoDB:  systemctl status mongod"
echo ""
echo -e "${CYAN}Access:${NC}"
echo "  Frontend: http://${DOMAIN_OR_IP}"
echo "  API:      http://${DOMAIN_OR_IP}/api/"
echo "  Admin:    http://${DOMAIN_OR_IP}/admin/"
echo ""
echo -e "${CYAN}Logs:${NC}"
echo "  Backend:  tail -f /var/log/crawlweb-backend-error.log"
echo "  Scraper:  journalctl -u crawlweb-scraper -f"
echo "  Nginx:    tail -f /var/log/nginx/error.log"
echo ""
echo -e "${CYAN}Useful commands:${NC}"
echo "  systemctl restart crawlweb-backend"
echo "  systemctl restart crawlweb-scraper"
echo "  systemctl restart nginx"
echo "  nginx -t"
echo ""

# Final check
sleep 3
if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:${NGINX_HTTP_PORT} | grep -q "200"; then
    log "✅ Frontend is accessible at http://${DOMAIN_OR_IP}"
else
    warn "Frontend may need a moment to start. Try: curl http://127.0.0.1"
fi

if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:${DJANGO_PORT}/api/jobs/search/ | grep -qE "200|301|302"; then
    log "✅ Backend API is responding."
else
    warn "Backend may still be starting. Check: systemctl status crawlweb-backend"
fi

log "Done! Open http://${DOMAIN_OR_IP} in your browser."