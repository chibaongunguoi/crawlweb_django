#!/usr/bin/env bash
# ============================================================
# CrawlWeb - Update/Deploy Code on Production Server
# ============================================================
# Usage:
#   chmod +x deploy/update.sh
#   sudo ./deploy/update.sh              # deploy latest from current branch
#   sudo ./deploy/update.sh <commit_hash>  # rollback to specific commit
# ============================================================

set -euo pipefail

PROJECT_DIR="/opt/crawlweb"
COMMIT="${1:-}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[UPDATE]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

if [[ $EUID -ne 0 ]]; then
    err "This script must be run as root. Use: sudo ./update.sh"
fi

cd "${PROJECT_DIR}"

# Save current commit for rollback
PREVIOUS_COMMIT=$(git rev-parse HEAD)
log "Current commit: ${PREVIOUS_COMMIT}"
echo "${PREVIOUS_COMMIT}" > /tmp/crawlweb_last_commit

if [[ -n "${COMMIT}" ]]; then
    log "Rolling back to commit: ${COMMIT}"
    git checkout "${COMMIT}"
else
    log "Pulling latest changes..."
    git fetch origin
    CURRENT_BRANCH=$(git branch --show-current)
    git pull origin "${CURRENT_BRANCH}"
fi

CURRENT_COMMIT=$(git rev-parse HEAD)
log "Now at commit: ${CURRENT_COMMIT}"

# --- Backend ---
log "Updating backend..."
cd "${PROJECT_DIR}/server"
source myworld/bin/activate
pip install -r requirements.txt -q
python manage.py collectstatic --noinput
deactivate

# --- Scraper ---
log "Updating scraper..."
cd "${PROJECT_DIR}/server/scraper"
source venv/bin/activate
pip install -r requirements.txt -q
deactivate

# --- Frontend ---
log "Rebuilding frontend..."
cd "${PROJECT_DIR}/client/app"
npm install --silent
npm run build

# --- Restart services ---
log "Restarting services..."
systemctl restart crawlweb-backend
systemctl restart crawlweb-scraper
systemctl reload nginx

sleep 3

# --- Verify ---
BACKEND_STATUS=$(systemctl is-active crawlweb-backend 2>/dev/null || echo "inactive")
SCRAPER_STATUS=$(systemctl is-active crawlweb-scraper 2>/dev/null || echo "inactive")

if [[ "${BACKEND_STATUS}" == "active" && "${SCRAPER_STATUS}" == "active" ]]; then
    log "✅ Update complete! All services running."
    log "Backend: ${BACKEND_STATUS} | Scraper: ${SCRAPER_STATUS}"
else
    warn "Some services may not be running:"
    warn "  Backend: ${BACKEND_STATUS}"
    warn "  Scraper: ${SCRAPER_STATUS}"
    warn "Check logs: journalctl -u crawlweb-backend -n 50"
fi

echo ""
log "To rollback to previous commit, run:"
echo "  sudo ./update.sh ${PREVIOUS_COMMIT}"