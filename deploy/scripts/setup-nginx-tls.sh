#!/usr/bin/env bash
set -euo pipefail

# Configure nginx reverse proxy + Let's Encrypt TLS for Agent Canvas staging.
# Usage:
#   DOMAIN=agent-canvas-demo.example.com EMAIL=you@example.com bash setup-nginx-tls.sh

DOMAIN="${DOMAIN:?DOMAIN is required}"
EMAIL="${EMAIL:-}"
APP_PORT="${APP_PORT:-3000}"
CONF_SRC="${CONF_SRC:-/home/ubuntu/agent_canvas/deploy/nginx/agent-canvas.conf.example}"
CONF_DST="/etc/nginx/sites-available/agent-canvas"
WWW_ROOT="/var/www/html"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo DOMAIN=... EMAIL=... bash $0"
  exit 1
fi

if [[ ! -f "${CONF_SRC}" ]]; then
  echo "Missing nginx template: ${CONF_SRC}"
  exit 1
fi

mkdir -p "${WWW_ROOT}/.well-known/acme-challenge"
chown -R www-data:www-data "${WWW_ROOT}"

sed "s/__DOMAIN__/${DOMAIN}/g; s/127.0.0.1:3000/127.0.0.1:${APP_PORT}/g" \
  "${CONF_SRC}" > "${CONF_DST}"

ln -sfn "${CONF_DST}" /etc/nginx/sites-enabled/agent-canvas

# Prefer only our site config; disable default welcome site if present.
if [[ -L /etc/nginx/sites-enabled/default ]]; then
  rm -f /etc/nginx/sites-enabled/default
fi

nginx -t
systemctl reload nginx

CERTBOT_ARGS=(--nginx -d "${DOMAIN}" --redirect --non-interactive --agree-tos)
if [[ -n "${EMAIL}" ]]; then
  CERTBOT_ARGS+=(--email "${EMAIL}")
else
  CERTBOT_ARGS+=(--register-unsafely-without-email)
fi

echo "Requesting Let's Encrypt certificate for ${DOMAIN}..."
certbot "${CERTBOT_ARGS[@]}"

nginx -t
systemctl reload nginx

echo
echo "TLS ready: https://${DOMAIN}/"
echo "Update GitLab CI variable STAGING_PUBLIC_URL=https://${DOMAIN}"
echo "Keep app listening only on 127.0.0.1:${APP_PORT} behind nginx."
