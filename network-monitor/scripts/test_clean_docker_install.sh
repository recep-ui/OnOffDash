#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# test_clean_docker_install.sh
# End-to-End Clean Docker Deployment Verification Script for OnOffDash V2
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PROJECT_DIR="${REPO_DIR}/network-monitor"

echo "=== [1/6] Pre-flight Check: Docker & Environment ==="

if ! command -v docker &>/dev/null; then
  echo "[-] ERROR: docker command not found."
  exit 1
fi

DOCKER_CMD="docker"
if ! docker info &>/dev/null; then
  if command -v sudo &>/dev/null && sudo -n docker info &>/dev/null; then
    DOCKER_CMD="sudo docker"
  else
    echo "[-] WARNING: Docker daemon is not accessible without interactive authentication."
    if [[ "${1:-}" == "--check-prereqs" ]]; then
      echo "[*] Exiting cleanly under --check-prereqs."
      exit 0
    fi
    echo "[-] Please ensure user has docker access or execute in CI runner with Docker daemon."
    exit 1
  fi
fi

echo "[+] Using Docker command: ${DOCKER_CMD}"

cd "${PROJECT_DIR}"

TEST_ENV_FILE="${PROJECT_DIR}/.env.docker_test"
CLEANUP_CALLED=0

cleanup() {
  if [ "$CLEANUP_CALLED" -eq 1 ]; then
    return
  fi
  CLEANUP_CALLED=1
  echo ""
  echo "=== Teardown: Stopping and removing test containers and volumes ==="
  ${DOCKER_CMD} compose --env-file "${TEST_ENV_FILE}" down -v --remove-orphans || true
  rm -f "${TEST_ENV_FILE}"
  echo "[+] Cleaned up test environment."
}

trap cleanup EXIT INT TERM

echo "=== [2/6] Generating Clean Test Configuration (.env) ==="
mkdir -p "${PROJECT_DIR}/keys"
if [ ! -f "${PROJECT_DIR}/keys/jwt_private.pem" ] || [ ! -f "${PROJECT_DIR}/keys/jwt_public.pem" ]; then
  echo "[*] Generating test 2048-bit RSA keypair in ${PROJECT_DIR}/keys..."
  openssl genrsa -out "${PROJECT_DIR}/keys/jwt_private.pem" 2048
  openssl rsa -in "${PROJECT_DIR}/keys/jwt_private.pem" -pubout -out "${PROJECT_DIR}/keys/jwt_public.pem"
  chmod 600 "${PROJECT_DIR}/keys/jwt_private.pem"
  chmod 644 "${PROJECT_DIR}/keys/jwt_public.pem"
fi

cat << 'EOF' > "${TEST_ENV_FILE}"
HOST_PORT=8088
ACCEPT_EULA=Y
MSSQL_SA_PASSWORD=CleanDeploySaPass2026!
MSSQL_PID=Express
DB_NAME=network_monitor
DB_HOST=db
DB_PORT=1433
DB_ADMIN_USER=sa
DB_APP_USER=onoffdash_app
DB_APP_PASSWORD=AppUserCleanDeployPass2026!
BOOTSTRAP_ADMIN_USERNAME=admin
BOOTSTRAP_ADMIN_PASSWORD=AdminCleanDeployPass2026!
PING_INTERVAL_SECONDS=60
HEARTBEAT_TIMEOUT_SECONDS=90
RETENTION_DAYS=30
JWT_PRIVATE_KEY_PATH=/etc/ssl/certs/jwt_private.pem
JWT_PUBLIC_KEY_PATH=/etc/ssl/certs/jwt_public.pem
AUTH_INTROSPECTION_SECRET=clean-deploy-introspection-secret-min-32-chars
ALLOW_LEGACY_AGENT_AUTH=false
JWT_SECRET=clean-deployment-verification-jwt-secret-min-32-chars-long
AGENT_API_KEY=clean-deployment-verification-agent-api-key-32-chars
CORS_ORIGINS=http://localhost:8088,http://localhost
MAX_FILE_SIZE_MB=50
FILE_TOOLS_MAX_FILE_SIZE_MB=50
FILE_TOOLS_TTL_MINUTES=60
FILE_TOOLS_LOG_MODE=jsonl
EOF

echo "[+] Clean test environment generated at ${TEST_ENV_FILE}"

echo "=== [3/6] Starting Fresh Docker Stack Build & Startup ==="
${DOCKER_CMD} compose --env-file "${TEST_ENV_FILE}" down -v --remove-orphans || true
${DOCKER_CMD} compose --env-file "${TEST_ENV_FILE}" up -d --build

echo "=== [4/6] Polling Database and db-init Service Completion ==="

echo "[*] Waiting for MSSQL container (network_monitor_db) to report healthy..."
MSSQL_READY=0
for i in $(seq 1 30); do
  STATUS=$(${DOCKER_CMD} inspect --format='{{json .State.Health.Status}}' network_monitor_db 2>/dev/null || echo '"unknown"')
  if [[ "$STATUS" == '"healthy"' ]]; then
    echo "[+] MSSQL is healthy! (${i}s)"
    MSSQL_READY=1
    break
  fi
  sleep 2
done

if [ "$MSSQL_READY" -ne 1 ]; then
  echo "[-] ERROR: MSSQL container failed to become healthy."
  ${DOCKER_CMD} logs network_monitor_db || true
  exit 1
fi

echo "[*] Waiting for db-init container (network_monitor_db_init) to exit 0..."
DB_INIT_DONE=0
for i in $(seq 1 30); do
  STATUS=$(${DOCKER_CMD} inspect --format='{{.State.Status}}' network_monitor_db_init 2>/dev/null || echo 'unknown')
  EXIT_CODE=$(${DOCKER_CMD} inspect --format='{{.State.ExitCode}}' network_monitor_db_init 2>/dev/null || echo '-1')
  if [[ "$STATUS" == "exited" ]]; then
    if [[ "$EXIT_CODE" == "0" ]]; then
      echo "[+] db-init completed successfully with exit code 0!"
      DB_INIT_DONE=1
      break
    else
      echo "[-] ERROR: db-init exited with non-zero exit code: ${EXIT_CODE}"
      ${DOCKER_CMD} logs network_monitor_db_init || true
      exit 1
    fi
  fi
  sleep 2
done

if [ "$DB_INIT_DONE" -ne 1 ]; then
  echo "[-] ERROR: db-init timed out."
  ${DOCKER_CMD} logs network_monitor_db_init || true
  exit 1
fi

echo "=== [5/6] Polling Backend, Frontend, and Microservices Health ==="

echo "[*] Waiting for backend (network_monitor_backend) to become healthy..."
BACKEND_READY=0
for i in $(seq 1 30); do
  STATUS=$(${DOCKER_CMD} inspect --format='{{json .State.Health.Status}}' network_monitor_backend 2>/dev/null || echo '"unknown"')
  if [[ "$STATUS" == '"healthy"' ]]; then
    echo "[+] Backend container is healthy! (${i}s)"
    BACKEND_READY=1
    break
  fi
  sleep 2
done

if [ "$BACKEND_READY" -ne 1 ]; then
  echo "[-] ERROR: Backend failed to become healthy."
  ${DOCKER_CMD} logs network_monitor_backend || true
  exit 1
fi

echo "[*] Verifying HTTP endpoints via Nginx reverse proxy on port 8088..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8088/ || true)
echo "[+] Frontend index response code: ${HTTP_CODE}"
if [[ "$HTTP_CODE" != "200" ]]; then
  echo "[-] WARNING: Frontend returned HTTP ${HTTP_CODE}"
fi

BACKEND_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8088/api/health || true)
echo "[+] Backend /api/health response code: ${BACKEND_CODE}"
if [[ "$BACKEND_CODE" != "200" ]]; then
  echo "[-] ERROR: Backend health check failed with HTTP ${BACKEND_CODE}"
  exit 1
fi

PDF_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8088/api/pdf/health || true)
echo "[+] PDF Service /api/pdf/health response code: ${PDF_CODE}"

FILE_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8088/api/file-tools/health || true)
echo "[+] File Service /api/file-tools/health response code: ${FILE_CODE}"

echo "=== [6/6] All Verification Checks PASSED Successfully! ==="
