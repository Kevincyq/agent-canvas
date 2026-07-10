#!/usr/bin/env bash
set -euo pipefail

DEPLOY_PATH="${STAGING_DEPLOY_PATH:-/opt/agent-canvas}"
IMAGE_TAG="${IMAGE_TAG:?IMAGE_TAG is required}"
APP_PORT="${APP_PORT:-3000}"

mkdir -p "${DEPLOY_PATH}"
cd "${DEPLOY_PATH}"

write_env_file() {
  cat > .env <<EOF
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0

TURING_API_BASE=${TURING_API_BASE:-https://live-turing.cn.llm.tcljd.com/api/v1}
TURING_API_KEY=${TURING_API_KEY:-}
TURING_MODEL=${TURING_MODEL:-turing/gpt-5.5}

AZURE_STT_KEY=${AZURE_STT_KEY:-}
AZURE_STT_REGION=${AZURE_STT_REGION:-eastasia}
ASR_LANGUAGE_CODE=${ASR_LANGUAGE_CODE:-zh}

MCP_SERVER_URL=${MCP_SERVER_URL:-https://mcp.fluxink.ai/servers/d706699b03524ba6aa84423954c43f3f/mcp}
MCP_SERVER_NAME=${MCP_SERVER_NAME:-FluxInk TCL MCP}
MCP_AUTH_TOKEN=${MCP_AUTH_TOKEN:-}
MCP_TIMEOUT_MS=${MCP_TIMEOUT_MS:-60000}

FLUXINK_HWR_UI_RESOURCE_URI=${FLUXINK_HWR_UI_RESOURCE_URI:-ui://fluxink/fluxink-hwr-canvas.html}
PORTAL_FRAME_ANCESTOR_ORIGIN=${PORTAL_FRAME_ANCESTOR_ORIGIN:-}
EOF
}

write_env_file

if [[ -n "${CI_REGISTRY:-}" && -n "${CI_REGISTRY_USER:-}" && -n "${CI_REGISTRY_PASSWORD:-}" ]]; then
  echo "${CI_REGISTRY_PASSWORD}" | docker login -u "${CI_REGISTRY_USER}" --password-stdin "${CI_REGISTRY}"
fi

export IMAGE_TAG
export APP_PORT

docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --remove-orphans
docker compose -f docker-compose.yml ps

for attempt in $(seq 1 15); do
  if docker compose -f docker-compose.yml exec -T agent-canvas node -e "fetch('http://127.0.0.1:3000/api/health').then((response)=>process.exit(response.ok?0:1)).catch(()=>process.exit(1))"; then
    echo "Health check passed on attempt ${attempt}"
    break
  fi
  sleep 2
done

docker image prune -f >/dev/null

echo "Deploy finished: ${IMAGE_TAG}"
