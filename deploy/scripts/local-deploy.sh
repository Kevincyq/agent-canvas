#!/usr/bin/env bash
set -euo pipefail

# Local one-command deploy: rsync repo → staging server, upload .env.local, docker build/up on server.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

if [[ -f deploy/deploy.env ]]; then
  # shellcheck disable=SC1091
  source deploy/deploy.env
fi

STAGING_HOST="${STAGING_HOST:?Set STAGING_HOST in deploy/deploy.env}"
STAGING_USER="${STAGING_USER:-ubuntu}"
STAGING_DEPLOY_PATH="${STAGING_DEPLOY_PATH:-/home/ubuntu/agent_canvas}"
SSH_KEY="${SSH_KEY:-./agent-canvas-staging-deploy}"
STAGING_URL="${STAGING_URL:-https://dralk-demo.tcljd.com}"
APP_PORT="${APP_PORT:-3000}"
IMAGE_TAG="${IMAGE_TAG:-agent-canvas:staging}"
ENV_FILE="${ENV_FILE:-.env.local}"

SSH_OPTS=(-o BatchMode=yes -o StrictHostKeyChecking=accept-new)
if [[ -f "${SSH_KEY}" ]]; then
  SSH_OPTS+=(-i "${SSH_KEY}")
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}. Create it from .env.example before deploying."
  exit 1
fi

echo "==> Syncing code to ${STAGING_USER}@${STAGING_HOST}:${STAGING_DEPLOY_PATH}"
ssh "${SSH_OPTS[@]}" "${STAGING_USER}@${STAGING_HOST}" "mkdir -p '${STAGING_DEPLOY_PATH}'"

rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'out' \
  --exclude 'dist' \
  --exclude 'coverage' \
  --exclude 'openai-agents-js' \
  --exclude '.env' \
  --exclude '.env.local' \
  --exclude '.env.*.local' \
  --exclude 'agent-canvas-staging-deploy' \
  --exclude 'agent-canvas-staging-deploy.pub' \
  --exclude 'deploy/deploy.env' \
  -e "ssh ${SSH_OPTS[*]}" \
  ./ "${STAGING_USER}@${STAGING_HOST}:${STAGING_DEPLOY_PATH}/"

echo "==> Uploading runtime env from ${ENV_FILE}"
{
  echo "NODE_ENV=production"
  echo "PORT=3000"
  echo "HOSTNAME=0.0.0.0"
  cat "${ENV_FILE}"
} | ssh "${SSH_OPTS[@]}" "${STAGING_USER}@${STAGING_HOST}" "cat > '${STAGING_DEPLOY_PATH}/.env'"

echo "==> Building and restarting on server"
ssh "${SSH_OPTS[@]}" "${STAGING_USER}@${STAGING_HOST}" \
  "STAGING_DEPLOY_PATH='${STAGING_DEPLOY_PATH}' APP_PORT='${APP_PORT}' IMAGE_TAG='${IMAGE_TAG}' bash '${STAGING_DEPLOY_PATH}/deploy/scripts/server-deploy.sh'"

echo "==> Done"
echo "Open: ${STAGING_URL}"
echo "Health: ${STAGING_URL}/api/health"
