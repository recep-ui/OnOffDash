# ONOFFDASH V2 — COMPREHENSIVE ARCHITECTURAL & SECURITY AUDIT REPORT

**Author:** Software Architect & Security Engineering Lead  
**Date:** September 17, 2026  
**Status:** Audit Complete — Remediation Plan Ready  
**Repository:** `https://github.com/recep-ui/OnOffDash.git`  
**Target Codebase:** `network-monitor/`

---

## 1. Executive Summary

A comprehensive architectural, security, reliability, and code-quality audit was performed on **OnOffDash V2**. The system provides real-time LAN device monitoring, SNMP/HTTP printer monitoring, a Windows endpoint telemetry agent, and two auxiliary microservices for PDF and file transformations.

While the application features modern UI aesthetics and real-time Socket.IO communication, the audit revealed **12 Critical (P0)** security vulnerabilities and design flaws, along with multiple **High (P1)** and **Medium (P2)** issues. Most notably:
1. Live secrets and passwords are committed in tracked `.env` files.
2. The Windows Agent auto-updater downloads an unsigned `.exe` over HTTP and executes it as `NT AUTHORITY\SYSTEM` with zero checksum or signature validation.
3. Backend mutation endpoints completely lack server-side Role-Based Access Control (RBAC).
4. Auxiliary Python microservices (PDF and File Tools) accept unauthenticated requests and perform unverified base64 decoding rather than cryptographic JWT signature validation.
5. Critical functional defects exist: agent software inventory upload fails due to missing user JWT, and the frontend notification system fails to initialize because `socket` is undefined in `NotificationProvider`.

---

## 2. Findings Classification Matrix

| ID | Category | Severity | Description | Status |
|---|---|---|---|---|
| **P0-01** | Secret Security | **P0 Critical** | Live credentials committed in tracked `.env` and `backend/.env` | Resolved (Verified) |
| **P0-02** | Auth Security | **P0 Critical** | Hardcoded JWT secret fallback in `middleware/auth.js` | Resolved (Verified) |
| **P0-03** | Credential Security | **P0 Critical** | Default admin (`admin / <DEFAULT_BOOTSTRAP_PASSWORD>`) seeded automatically | Resolved (Verified) |
| **P0-04** | Token Exposure | **P0 Critical** | JWT token passed via URL query parameter (`?token=...`) | Resolved (Verified) |
| **P0-05** | Authorization | **P0 Critical** | Missing server-side RBAC on all mutation endpoints | Resolved (Verified) |
| **P0-06** | Endpoint Auth | **P0 Critical** | Anonymous `/api/heartbeat` endpoint accepts arbitrary telemetry | Resolved (Verified) |
| **P0-07** | Functional Bug | **P0 Critical** | Agent `POST /api/software` blocked by User JWT middleware | Resolved (Verified) |
| **P0-08** | Realtime Security | **P0 Critical** | Socket.IO allows anonymous connection with wildcard CORS | Resolved (Verified) |
| **P0-09** | Supply Chain / RCE | **P0 Critical** | Agent updater executes unverified `.exe` as Windows `SYSTEM` | Resolved (Verified) |
| **P0-10** | Service Auth | **P0 Critical** | PDF & File microservices bypass JWT signature verification | Resolved (Verified) |
| **P0-11** | Infrastructure | **P0 Critical** | Database & internal microservice ports exposed to host | Resolved (Verified) |
| **P0-12** | Privilege Principle | **P0 Critical** | Runtime microservices and backend connect as MSSQL `sa` | Resolved (Verified) |
| **P1-01** | Functional Bug | **P1 High** | `NotificationProvider` receives `undefined` socket (alarms dead) | Resolved (Verified) |
| **P1-02** | Auth Hardening | **P1 High** | No rate limiting or brute-force throttling on `/api/auth/login` | Resolved (Verified) |
| **P1-03** | Database Health | **P1 High** | Rapid table bloat: `device_status_logs` written on every heartbeat | Resolved (Verified) |
| **P1-04** | Data Integrity | **P1 High** | Monolithic `migrations.js` without `schema_migrations` tracking | Resolved (Verified) |
| **P1-05** | Input Validation | **P1 High** | Excel import lacks schema validation, bounds check, and transactions | Resolved (Verified) |
| **P1-06** | Performance | **P1 High** | Unbounded database queries without server-side pagination limits | Resolved (Verified) |
| **P1-07** | Information Leak | **P1 High** | Query parameters with sensitive data logged on SQL errors | Resolved (Verified) |
| **P1-08** | Repo Cleanliness | **P1 High** | 38MB compiled Windows binary `OnOffDash_Agent.exe` tracked in Git | Resolved (Verified) |
| **P2-01** | Frontend Architecture | **P2 Medium** | Fragmented auth state; missing centralized `AuthProvider` | Resolved (Verified) |
| **P2-02** | Configuration | **P2 Medium** | Hardcoded corporate IP addresses (`10.0.80.110`, `10.0.80.113`) | Resolved (Verified) |
| **P2-03** | Export Security | **P2 Medium** | Spreadsheet Formula Injection vulnerability in Excel exports | Resolved (Verified) |
| **P2-04** | Supply Chain | **P2 Medium** | Python services use floating unpinned dependencies | Resolved (Verified) |
| **P2-05** | Observability | **P2 Medium** | Backend `/api/health` does not check database readiness | Resolved (Verified) |
| **P2-06** | Code Maintainability | **P2 Medium** | Large monolithic UI components mixing business & presentation | Resolved (Verified) |
| **P2-07** | Container Security | **P2 Medium** | Docker containers run as root without dropped capabilities | Resolved (Verified) |
| **P3-01** | Documentation | **P3 Improvement**| README references PostgreSQL & obsolete `start_agent.js` | Resolved (Verified) |
| **P3-02** | Architecture Hygiene | **P3 Improvement**| Unused TypeScript dependency and phantom `tsconfig.json` | Resolved (Verified) |
| **P3-03** | Quality Assurance | **P3 Improvement**| Zero automated unit/integration tests and missing CI workflow | Resolved (Verified) |
| **P3-04** | User Experience | **P3 Improvement**| Browser push notification permission requested on initial mount | Resolved (Verified) |


---

## 3. Deep-Dive Vulnerability & Root Cause Analysis

### P0-01 & P0-02: Secret Exposure & Insecure JWT Secret Fallback
- **Location:** `network-monitor/.env`, `network-monitor/backend/.env`, `network-monitor/backend/middleware/auth.js` (Line 3).
- **Vulnerability:** `backend/middleware/auth.js` defines:
  ```javascript
  const JWT_SECRET = process.env.JWT_SECRET || 'on-off-dash-secret-key-2026';
  ```
  If `JWT_SECRET` is omitted or misconfigured, the backend silently falls back to a publicly known string, allowing anyone to forge administrative JWT tokens. Additionally, real SQL credentials (`DB_PASSWORD=[REDACTED]`, `DB_USER=[REDACTED]`) were previously tracked in git history.
  > [!WARNING]
  > Credential must be rotated because it existed in repository history.
- **Remediation:** Remove tracked `.env` files from Git index without rewriting historical commits. Enforce strict startup validation: if `JWT_SECRET` is missing or shorter than 32 characters, fail process startup with an explicit configuration error. Create clean `.env.example` templates. Document secret rotation in `SECURITY_MIGRATION.md`.

### P0-03: Default Admin Account (`admin / <DEFAULT_BOOTSTRAP_PASSWORD>`)
- **Location:** `network-monitor/backend/db/migrations.js` (Lines 308-317).
- **Vulnerability:** If the `users` table is empty, migration previously seeded `admin` with a hardcoded password.
- **Remediation:** Remove hardcoded credentials. Introduce a secure, one-time bootstrap mechanism via environment variables (`BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_PASSWORD`). If environment variables are absent and the table is empty, do not seed an insecure default account. Add a `must_change_password` column to enforce credential rotation on first login.

### P0-04: JWT Query Parameter Leakage
- **Location:** `backend/middleware/auth.js` (Lines 9-11), `frontend/src/components/*` (Export triggers).
- **Vulnerability:** `authenticateToken` accepts `req.query.token`. All frontend export buttons (`/api/devices/export?token=...`, `/api/maintenance/export?token=...`, etc.) pass JWT tokens in the URL. URLs are saved in browser history, proxy access logs, and referrer headers.
- **Remediation:** Remove `req.query.token` support from `authenticateToken`. Implement authenticated blob downloads (`downloadWithAuth`) using `Authorization: Bearer <token>` in `frontend/src/services/api.js`.

### P0-05: Missing Server-Side Role-Based Access Control (RBAC)
- **Location:** `backend/routes/devices.js`, `printers.js`, `maintenance.js`, `actions.js`, `phoneDirectory.js`, `ipam.js`, `software.js`.
- **Vulnerability:** `requireRole('admin')` was only wired to user management in `routes/auth.js`. All other mutation routes (POST, PUT, DELETE, Excel import) are protected only by `authenticateToken`. Any user with a `viewer` token can delete devices, alter printer records, or upload files.
- **Remediation:** Implement a role hierarchy (`admin`, `operator`, `viewer`). Enforce route-level RBAC:
  - `viewer`: Read-only (`GET`, export).
  - `operator`: Operational mutation (`POST`, `PUT`, import).
  - `admin`: Full control (`DELETE`, user management, system configs).

### P0-06 & P0-07: Insecure & Broken Agent Communication Protocol
- **Location:** `backend/routes/heartbeat.js`, `backend/routes/software.js`, `backend/server.js`, `agent/agent.js`.
- **Vulnerability:**
  - `POST /api/heartbeat` is completely anonymous. Any entity on the LAN can inject false metrics and rogue devices.
  - `server.js` applied `authenticateToken` (User JWT) to all of `/api/software`. When the agent transmits inventory via `POST /api/software`, the request fails with HTTP 401.
- **Remediation:** Separate User authentication from Agent authentication.
  - Establish `AGENT_API_KEY` (transmitted via `X-Agent-Key` header with timing-safe comparison).
  - Protect `POST /api/heartbeat` and `POST /api/software` with `authenticateAgent`.
  - Protect `GET /api/software/:deviceId` with standard `authenticateToken`.

### P0-08: Unauthenticated Socket.IO with Wildcard CORS
- **Location:** `backend/server.js` (Lines 32-37, 66-72).
- **Vulnerability:** Socket.IO server initializes with `cors: { origin: '*' }` and no authentication middleware. Any anonymous client can connect and intercept live hardware telemetry and alarm broadcasts.
- **Remediation:** Implement `io.use()` JWT authentication in Express. Reject unauthorized connections. Configure Socket.IO CORS from `CORS_ORIGINS`. Pass token during handshake from frontend (`io(origin, { auth: { token } })`).

### P0-09: Unverified Agent Executable Execution as SYSTEM (RCE Hazard)
- **Location:** `agent/updater.js` (Lines 42-106).
- **Vulnerability:** The Windows Agent runs as `NT AUTHORITY\SYSTEM`. `updater.js` fetches `/api/agent/download` without validating SHA-256 hashes, file sizes, or digital signatures, and immediately executes it via Windows Task Scheduler.
- **Remediation:**
  - Server provides version manifest with `version`, `sha256`, `size`, and signature.
  - Agent computes SHA-256 and validates binary size before replacement.
  - If validation fails, update is aborted and previous binary remains untouched with rollback support.

### P0-10: Auxiliary Microservices (PDF & File Tools) JWT Bypass
- **Location:** `services/pdf-service/app/utils/logger.py`, `services/file-service/app/utils/logger.py`, routers.
- **Vulnerability:** Both FastAPI services decode the JWT payload using `base64.b64decode` purely to extract `user_id` for logging, with zero signature or expiration verification. Endpoint operations have no authentication dependency.
- **Remediation:** Install `pyjwt[crypto]`. Implement a centralized FastAPI security dependency `require_authenticated_user` that cryptographically verifies signature against `JWT_SECRET`, checks expiration, and returns the claims. Protect all processing and download endpoints.

### P0-11 & P0-12: Docker Network & Database SA Hardening
- **Location:** `network-monitor/docker-compose.yml`.
- **Vulnerability:** Ports `1433`, `3001`, `8001`, `8002` are exposed directly to the host. Backend and microservices connect to MSSQL using the `sa` superuser account.
- **Remediation:**
  - In production compose, publish only port `80` (Nginx). Route backend, pdf-service, file-service, and db exclusively through an internal isolated bridge network (`network_monitor_net`).
  - Introduce application database user (`DB_APP_USER` / `DB_APP_PASSWORD`) with `db_datareader`, `db_datawriter`, `db_ddladmin` roles, separating runtime traffic from bootstrap `sa` credentials.

### P1-01: Disconnected Notification Hook
- **Location:** `frontend/src/hooks/useSocket.js`, `frontend/src/components/Dashboard.jsx`.
- **Vulnerability:** `Dashboard.jsx` does `const { connected, on, off, socket } = useSocket()`. However, `useSocket.js` returned `{ connected, on, off }`. `NotificationProvider` checks `if (!socket) return;` and never binds any event listeners.
- **Remediation:** Create a unified `SocketContext` (`SocketProvider`) exposing `{ socket, connected, on, off }`. Wrap the application tree so `NotificationProvider` and dashboard consume the exact same authenticated socket.

### P1-03: Rapid Database Bloat in `device_status_logs`
- **Location:** `backend/routes/heartbeat.js` (Lines 56-60).
- **Vulnerability:** An `INSERT INTO device_status_logs` was executed on every 30-second heartbeat regardless of whether the device changed state.
- **Remediation:** Only write to `device_status_logs` when a genuine transition occurs (`online -> offline`, `offline -> online`).

---

## 4. Architectural Target State

```
                      +------------------------------------------+
                      |         CLIENT BROWSER / AGENT           |
                      +------------------------------------------+
                                     |            | (X-Agent-Key)
                        (JWT Bearer) |            v
                                     |     +---------------+
                                     |     | Windows Agent |
                                     |     +---------------+
                                     v            |
                       +-------------------------------+
                       |   NGINX REVERSE PROXY (:80)   |
                       +-------------------------------+
                         /             |             \
      /api/, /socket.io/ |    /api/pdf |   /api/file |
                         v             v             v
       +--------------------+  +-------------+  +--------------+
       |   Express Backend  |  | PDF Service |  | File Service |
       |  (RBAC + RateLimit)|  | (FastAPI+JWT|  | (FastAPI+JWT)|
       +--------------------+  +-------------+  +--------------+
                         \             |             /
                          v            v            v
                       +-------------------------------+
                       |     MSSQL DATABASE (:1433)    |
                       |  (Isolated internal network)  |
                       +-------------------------------+
```

---

## 5. Phased Remediation Plan

- **Phase 1: Critical Security (P0)**
  - Secret & environment cleansing (`.gitignore`, `.env.example`, `SECURITY_MIGRATION.md`).
  - Removal of default admin and JWT fallback.
  - Query parameter token elimination and secure blob downloads.
  - Agent authentication (`X-Agent-Key`) and software inventory unblocking.
  - Socket.IO authentication and CORS restriction.
  - Python microservices cryptographic JWT verification.
  - Route-level RBAC enforcement.
  - Docker network isolation (port exposure restriction).
- **Phase 2: Functional Bug Fixes (P0/P1)**
  - `SocketProvider` unification and `NotificationProvider` activation.
  - Agent auto-update SHA-256 verification and rollback guard.
- **Phase 3: Reliability & Data Health (P1/P2)**
  - Heartbeat status log transition optimization.
  - Migration tracking table (`schema_migrations`).
  - Excel import transaction safety and formula injection escaping.
  - Database error logging sanitization.
- **Phase 4: Engineering Quality & Testing (P1/P3)**
  - Automated testing suite (Backend Supertest/Jest, Frontend Vitest, Python Pytest).
  - GitHub Actions CI workflow (`.github/workflows/ci.yml`).
  - Docker non-root user and capability hardening.
- **Phase 5: Maintainability & Docs (P2/P3)**
  - Centralized frontend `AuthProvider`.
  - Canonical documentation alignment (`SECURITY.md`, `PRODUCTION_CHECKLIST.md`, updated `README.md`).
  - Elimination of phantom TypeScript artifacts.

---

## 6. Verification & Acceptance Criteria

1. Anonymous request to any `/api/*` endpoint (except login, health, agent update version) returns 401.
2. `viewer` role attempting `POST /api/devices` or `DELETE /api/devices/:id` returns 403.
3. Socket.IO connection without token is rejected.
4. Agent heartbeat and software upload with valid `X-Agent-Key` succeed with HTTP 200.
5. Python microservices reject unsigned or expired JWTs with HTTP 401.
6. Offline device, paper jam, and low toner trigger immediate visual and audio alerts in UI.
7. Agent updater aborts installation if downloaded binary SHA-256 mismatches manifest.
8. Only port 80 is exposed in production `docker-compose.yml`.
9. All automated test suites pass cleanly.
