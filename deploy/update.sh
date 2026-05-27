#!/usr/bin/env bash
# ============================================================
# CrawlWeb - Quick Update Script (Code only, no infra changes)
# ============================================================
# Usage:
#   chmod +x deploy/update.sh
#   sudo ./deploy/update.sh
#
# This script:
#   1. Pulls latest code from GitHub
#   2. Installs updated dependencies (backend + frontend)
#   3. Re-builds frontend
#   4. Runs collectstatic
#   5. Restarts services
# ============================================================

set -euo pipefail

PROJECT_DIR="/opt/crawlweb"
BRANCH="linux"
DOMAIN="itjobs.ddns.net"

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

if [[ ! -d "${PROJECT_DIR}/.git" ]]; then
    err "Project not found at ${PROJECT_DIR}. Run deploy.sh first."
fi

cd "${PROJECT_DIR}"

# Keep git metadata writable by the normal SSH user.
# This fixes: error: cannot open '.git/FETCH_HEAD': Permission denied
REAL_USER="${SUDO_USER:-ubuntu}"
if id "${REAL_USER}" &>/dev/null; then
    chown -R "${REAL_USER}:${REAL_USER}" "${PROJECT_DIR}/.git" 2>/dev/null || true
    log "Fixed .git ownership for user: ${REAL_USER}"
else
    warn "User ${REAL_USER} not found; git commands will run as root."
fi

run_as_real_user() {
    if id "${REAL_USER}" &>/dev/null; then
        sudo -u "${REAL_USER}" -H "$@"
    else
        "$@"
    fi
}

# ============================================================
# STEP 1: Pull latest code
# ============================================================
log "Step 1/5: Pulling latest code from GitHub..."

# Save current commit for rollback reference
CURRENT_COMMIT=$(run_as_real_user git rev-parse HEAD)
echo "${CURRENT_COMMIT}" > /tmp/crawlweb_last_commit
log "Current commit: ${CURRENT_COMMIT} (saved for rollback)"

run_as_real_user git fetch origin
run_as_real_user git checkout "${BRANCH}"
run_as_real_user git pull origin "${BRANCH}"

NEW_COMMIT=$(run_as_real_user git rev-parse HEAD)
log "Updated to commit: ${NEW_COMMIT}"

# ============================================================
# STEP 2: Update Python dependencies
# ============================================================
log "Step 2/5: Updating Python dependencies..."

cd "${PROJECT_DIR}/server"
source myworld/bin/activate
pip install --upgrade pip
pip install -r requirements.txt --quiet
deactivate

# Update scraper dependencies if needed
if [[ -f "${PROJECT_DIR}/server/scraper/requirements.txt" ]]; then
    cd "${PROJECT_DIR}/server/scraper"
    source venv/bin/activate
    pip install -r requirements.txt --quiet
    deactivate
fi

# ============================================================
# STEP 3: Update frontend dependencies and build
# ============================================================
log "Step 3/5: Building frontend..."

cd "${PROJECT_DIR}/client/app"
npm install --silent
npm run build

# ============================================================
# STEP 4: Django maintenance
# ============================================================
log "Step 4/5: Django collectstatic..."

cd "${PROJECT_DIR}/server"
source myworld/bin/activate
cd "${PROJECT_DIR}/server/crawlweb"
python manage.py collectstatic --noinput 2>/dev/null || warn "collectstatic skipped (may not be configured)"
deactivate

# ============================================================
# STEP 5: Restart services
# ============================================================
log "Step 5/5: Restarting services..."

systemctl restart crawlweb-backend
systemctl restart crawlweb-scraper
systemctl restart nginx

# ============================================================
# Verification
# ============================================================
sleep 2
log "============================================"
log "Update complete!"
log "============================================"
echo ""
echo "  Previous commit: ${CURRENT_COMMIT:0:8}"
echo "  Current commit:  ${NEW_COMMIT:0:8}"
echo ""
echo "  Frontend: http://${DOMAIN}"
echo "  API:      http://${DOMAIN}/api/"
echo ""
echo "  Service status:"
systemctl is-active crawlweb-backend && echo "  ✅ Backend: running" || echo "  ❌ Backend: FAILED"
systemctl is-active crawlweb-scraper && echo "  ✅ Scraper: running" || echo "  ❌ Scraper: FAILED"
systemctl is-active nginx && echo "  ✅ Nginx: running" || echo "  ❌ Nginx: FAILED"
echo ""

# Quick health check
if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1 | grep -q "200"; then
    log "✅ Site is accessible at http://${DOMAIN}"
else
    warn "Site may need a moment. Check: curl http://127.0.0.1"
fi

# Keep repo usable for future manual git pull by ubuntu user
if id "${REAL_USER}" &>/dev/null; then
    chown -R "${REAL_USER}:${REAL_USER}" "${PROJECT_DIR}/.git" 2>/dev/null || true
fi

log "Done!"
