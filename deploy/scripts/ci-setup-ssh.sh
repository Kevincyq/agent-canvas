#!/usr/bin/env bash
set -euo pipefail

mkdir -p ~/.ssh
chmod 700 ~/.ssh

if [[ -n "${STAGING_SSH_PRIVATE_KEY_B64:-}" ]]; then
  echo "${STAGING_SSH_PRIVATE_KEY_B64}" | base64 -d > ~/.ssh/id_rsa
elif [[ -f "${STAGING_SSH_PRIVATE_KEY:-}" ]]; then
  cp "${STAGING_SSH_PRIVATE_KEY}" ~/.ssh/id_rsa
elif [[ -n "${STAGING_SSH_PRIVATE_KEY:-}" ]]; then
  printf '%s' "${STAGING_SSH_PRIVATE_KEY}" | tr -d '\r' > ~/.ssh/id_rsa
else
  echo "Missing STAGING_SSH_PRIVATE_KEY (File/Variable) or STAGING_SSH_PRIVATE_KEY_B64"
  exit 1
fi

chmod 600 ~/.ssh/id_rsa
ssh-keyscan -H "${STAGING_HOST}" >> ~/.ssh/known_hosts
