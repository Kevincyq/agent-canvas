#!/usr/bin/env bash
set -euo pipefail

# Run on staging server after code sync. Builds image locally and restarts the app.
DEPLOY_PATH="${STAGING_DEPLOY_PATH:-/home/ubuntu/agent_canvas}"
APP_PORT="${APP_PORT:-3000}"
IMAGE_TAG="${IMAGE_TAG:-agent-canvas:staging}"
COMPOSE_FILE="${COMPOSE_FILE:-deploy/docker-compose.local.yml}"

cd "${DEPLOY_PATH}"

if [[ ! -f .env ]]; then
  echo "Missing ${DEPLOY_PATH}/.env (expected from local .env.local upload)"
  exit 1
fi

if [[ ! -f Dockerfile ]]; then
  echo "Missing Dockerfile in ${DEPLOY_PATH}"
  exit 1
fi

export APP_PORT
export IMAGE_TAG

echo "Building ${IMAGE_TAG} on server..."
docker compose -f "${COMPOSE_FILE}" build

echo "Starting container..."
docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans
docker compose -f "${COMPOSE_FILE}" ps

for attempt in $(seq 1 20); do
  if docker compose -f "${COMPOSE_FILE}" exec -T agent-canvas node -e "fetch('http://127.0.0.1:3000/api/health').then((response)=>process.exit(response.ok?0:1)).catch(()=>process.exit(1))"; then
    echo "Health check passed on attempt ${attempt}"
    docker image prune -f >/dev/null || true
    echo "Deploy finished: ${IMAGE_TAG}"
    exit 0
  fi
  sleep 3
done

echo "Health check failed after deploy"
docker compose -f "${COMPOSE_FILE}" logs --tail=80 agent-canvas || true
exit 1
