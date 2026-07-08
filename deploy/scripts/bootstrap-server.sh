#!/usr/bin/env bash
set -euo pipefail

# One-time bootstrap for the staging/demo server.
# Run as root or with sudo on the target VM.

DEPLOY_USER="${DEPLOY_USER:-deploy}"
DEPLOY_PATH="${STAGING_DEPLOY_PATH:-/opt/agent-canvas}"
APP_PORT="${APP_PORT:-3000}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
fi

if ! command -v curl >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update && apt-get install -y curl
  elif command -v yum >/dev/null 2>&1; then
    yum install -y curl
  fi
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin is required."
  exit 1
fi

if ! id "${DEPLOY_USER}" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "${DEPLOY_USER}"
fi

usermod -aG docker "${DEPLOY_USER}"
mkdir -p "${DEPLOY_PATH}"
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${DEPLOY_PATH}"

if command -v ufw >/dev/null 2>&1; then
  ufw allow "${APP_PORT}/tcp" || true
fi

cat <<EOF

Bootstrap complete.

Next steps:
1. Add the GitLab deploy user's SSH public key to /home/${DEPLOY_USER}/.ssh/authorized_keys
2. Configure GitLab CI/CD variables (see docs/DEPLOYMENT.md)
3. Push to main or feature/mcp-app-widget-host to trigger deploy

Deploy path: ${DEPLOY_PATH}
App port: ${APP_PORT}

EOF
