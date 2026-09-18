#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERTS_DIR="${SCRIPT_DIR}/../certs"

mkdir -p "${CERTS_DIR}"

if [ -f "${CERTS_DIR}/cert.pem" ] && [ -f "${CERTS_DIR}/key.pem" ]; then
    echo "SSL certificates already exist in ${CERTS_DIR}."
    exit 0
fi

echo "Generating self-signed TLS certificates for development/staging HTTPS testing..."
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "${CERTS_DIR}/key.pem" \
    -out "${CERTS_DIR}/cert.pem" \
    -subj "/C=TR/ST=Istanbul/L=Istanbul/O=OnOffDash/OU=IT/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

chmod 600 "${CERTS_DIR}/key.pem"
chmod 644 "${CERTS_DIR}/cert.pem"

echo "TLS certificates successfully generated in ${CERTS_DIR}."
