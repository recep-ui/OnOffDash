# OnOffDash V2 — Changelog

All notable changes and architectural/security improvements across OnOffDash V2 are documented in this file.

---

## [2.3.0] - September 2026 — Post-Remediation Security Hardening Pass

### P0 — Python Microservice Dependencies Vulnerability Remediation
- Upgraded `pdf-service` and `file-service` dependencies to patched upstream releases:
  - `fastapi==0.141.1`, `starlette==1.6.0`, `python-multipart==0.0.32`
  - `pypdf==6.19.0`, `pillow==12.3.0`, `pyjwt==2.14.0`, `cryptography==50.0.1`
- Fully resolved all CVEs; pipeline achieves 0 vulnerabilities under `pip-audit` without bypasses or ignores.

### P1 — Elimination of Legacy Agent Auth Bypass & Authoritative Binding
- Disabled legacy shared `AGENT_API_KEY` authentication by default, requiring explicit `ALLOW_LEGACY_AGENT_AUTH=true`.
- Bound telemetry strictly to `req.authenticatedDeviceId`, preventing rogue device creation or IP impersonation.
- Created filtered unique index `uq_active_agent_credential_per_device` in MSSQL ensuring at most one active key per device.
- Wrapped agent enrollment and rotation in SQL transactions.

### P1 — Authoritative Multi-Instance Distributed Token Revocation
- Enforced `token_version` claim requirement across all access tokens (rejection on missing or mismatching claim).
- Integrated bounded 5-second session cache querying MSSQL `users.token_version` to guarantee distributed cross-instance revocation within 5s while preventing database hammering.
- Invalidates sessions immediately upon password change, admin role modification, or user deletion.

### P1 — Asymmetric RS256 JWT Migration & Token Introspection
- Implemented RS256 asymmetric signing in backend with public-key verification across microservices.
- Added RFC 7662 token introspection endpoint (`POST /api/auth/introspect`) and public key endpoint (`GET /api/auth/public-key`).
- Restricted allowed verification algorithms to prevent algorithm confusion attacks.

### P1 — Atomic Replay-Resistant Refresh Token Rotation
- Refresh token rotation executed within an MSSQL transaction with atomic conditional update (`WHERE id = @id AND revoked_at IS NULL`).
- Added unique index `UQ_user_refresh_tokens_token_hash` on `user_refresh_tokens(token_hash)`.
- Replay detection immediately revokes the entire token family via `family_id`.
- Removed `req.body.refreshToken` fallback, enforcing strictly `HttpOnly`, `SameSite=Strict`, `Secure` cookies.

### P2 — Document-Layer Content Security Policy at Nginx
- Configured document-layer CSP header in `frontend/nginx.conf` and `frontend/nginx.prod-ssl.conf` aligned with backend Helmet policy.

### P2 — Resource Exhaustion & Path Traversal Defenses (PDF & Image Services)
- Bounded PDF previews to maximum 50 pages (`MAX_PREVIEW_PAGES`) and safe rendering dimensions (4000px, 16 megapixels).
- Enforced Pillow decompression bomb limits (`MAX_IMAGE_PIXELS = 25,000,000`), image dimension bounds (5000px), and parameter clamping.
- Hardened file downloads against directory traversal (`os.path.realpath` under `OUTPUT_DIR`) and enforced file ownership.

### P2 — Supply Chain & Container Security Hardening
- Pinned all GitHub Actions in `.github/workflows/ci.yml` to full, immutable commit SHAs with version comments.
- Configured least-privilege job permissions (`contents: read`) and timeouts across all CI jobs.
- Added `.github/dependabot.yml` for automated dependency updates across npm, pip, and actions.
- Hardened Docker Compose runtime with `no-new-privileges: true` and `cap_drop: ALL`.

---

## [2.2.0] - September 2026

### P0 — Broken XLSX Dependency Removal & ExcelJS Migration
- Completely removed `require('xlsx')` from `routes/printers.js`.
- Migrated all Excel import and export endpoints (printers, toner stock, toner replacements) to use `exceljs` via `utils/excelHelper.js`.
- Preserved Turkish column normalization, formula injection protections (CWE-1236), upload bounds, and error handling.
- Backend boots cleanly after `npm ci` without missing spreadsheet modules.

### P1 — Decoupled Heartbeat vs Network Reachability Architecture
- Strict separation between network reachability (`devices.status`) and agent health (`devices.agent_status`).
- Agent heartbeat route manages `agent_installed`, `agent_status`, `last_heartbeat_at`, and emits `agent:statusChanged`.
- Heartbeat does NOT mutate network reachability or falsely emit `device:statusChanged`.
- `PingService` remains solely responsible for ICMP reachability and network status transitions.
- Newly enrolled devices default to `offline` network state until verified by ICMP ping.

### P1 — Per-Device Agent Credential Binding & Hardened Enrollment
- Per-device credentials (`agk_<keyId>.<secret>`) strictly bind telemetry to `authenticatedDeviceId`.
- Validates submitted IP address against the device record; rejects attempts to report telemetry for unknown or mismatching IPs with `403 Forbidden`.
- Hardened `POST /api/agent/enroll` with integer validation, IP syntax checks, rotation support (`rotate: true`), and audit logging.
- Added `GET /api/agent/credentials` for operator inspection of credential metadata without exposing key secrets or hashes.
- Bounded optional heartbeat string fields (`os_name`, `username` <= 100 chars).

### P1 — Persistent JWT Revocation & Shared Socket.IO Authorization
- Migrated token invalidation to persistent `users.token_version` stored in MSSQL.
- Token invalidation survives server restarts, process crashes, and multi-instance deployments.
- Created shared `verifyAccessToken` function used identically by Express middleware and Socket.IO handshake authentication.
- Invalidates active sessions upon password changes, admin role modifications, or user account deletion.

### P1/P2 — HttpOnly Refresh Session Architecture & In-Memory Access Tokens
- Replaced `localStorage` access token storage with in-memory React state and automatic silent refresh.
- Access tokens are short-lived (15 minutes) and stored only in memory.
- Refresh tokens are stored in `HttpOnly`, `SameSite=Strict`, `Secure` cookies with database rotation tracking (`user_refresh_tokens`).
- Logout clears server-side refresh sessions and browser memory.

### P2 — Python JWT Claim Enforcement
- Configured PyJWT decoding with explicit `options={"require": ["exp"]}` across `pdf-service` and `file-service`.
- Rejects tokens lacking expiration or standard identity claims (`id`/`sub`, `role`) with HTTP 401.

### P2 — CIDR-Aware IPAM Subnet Calculations
- Replaced all legacy `/24` assumptions and string-based octet parsing in `routes/ipam.js` with 32-bit integer arithmetic (`ipToLong`, `longToIp`).
- Full support for arbitrary IPv4 CIDR blocks (`/22`, `/23`, `/24`, `/25`, `/26`, `/30`, `/31`, `/32`).
- `/suggest` generates available hosts across entire multi-octet subnets (e.g. `10.0.80.0/23` spanning both `10.0.80.x` and `10.0.81.x`).
- Added explicit controlled HTTP 400 rejection for unsupported IPv6 queries.

### P2 — Real Backend HTTP Route Testing & Startup Smoke Tests
- Replaced synthetic Express test reimplementations in `tests/http_routes.test.js` with real production route integration tests.
- Real routes execute against dynamic HTTP ports and a high-fidelity SQL mock engine.
- Added `tests/startup_smoke.test.js` verifying clean imports of `server.js` and all registered routers.

### P2 — DevSecOps & Enforced CI Pipeline
- Enforced Python `pip-audit` vulnerability scanning in `.github/workflows/ci.yml` without bypasses.
- Added ESLint to frontend (React, hooks, browser globals) and backend (Node.js, promises).
- Added Gitleaks secret scanning and Trivy container vulnerability scanning for all 4 microservice images.
- Decoupled runtime backend startup from SA database provisioning; runtime backend operates under least-privilege `onoffdash_app`.

---

## [2.1.0] - September 2026

### Phase 1 — Correctness
- **Device Status Log Bloat Prevention**: Switched status logging in `pingService.js` to delta-only transitions (`online <-> offline`, `online <-> warning`). Eliminated redundant inserts for repeated identical status observations.
- **Canonical Socket.IO Event Contract**: Standardized `device:statusChanged` payload across `PingService`, heartbeat routes, timeout monitors, and frontend `NotificationProvider`. Event contract schema: `{ device: { id, hostname, ip_address }, oldStatus, newStatus, reason, timestamp }`. Notification deduplication now operates on actual device ID `offline-${device.id}`, ensuring concurrent device failures produce distinct, independent notifications.
- **Separation of Ping Status from Agent Heartbeat**: Separated `last_seen` into `last_ping_at`, `last_heartbeat_at`, and `agent_status`. Backward-compatible schema migration implemented. Agent timeout logic now strictly monitors `last_heartbeat_at` independently of network ICMP ping responses.
- **Scalable Software Inventory Inserts**: Replaced monolithic SQL string generation with chunked 100-item batch inserts within an atomic SQL transaction. Guaranteed rollback if any batch fails, preventing device inventory corruption. Added payload validation and 2,000 item size limit.
- **Printer Scan Singleton Bug Fix**: Registered `PrinterMonitorService` as a singleton on the Express app (`app.set('printerMonitorService')`), preventing duplicate concurrent scans and returning `409 Conflict` when a scan is already running.

### Phase 2 — Security
- **Hardened Agent Input Validation**: Added centralized validation for `POST /api/heartbeat` and `POST /api/software` in `utils/validators.js`. Validates RFC hostnames, IPv4/IPv6 addresses, MAC addresses, numeric metric bounds (0–100% for CPU, RAM, Disk), and uptime values.
- **Per-Device Agent Authentication Infrastructure**: Introduced `agent_credentials` schema supporting unique per-device keys (`agk_<keyId>.<secret>`) with SHA-256 hashing. Prevents authenticated agents from impersonating other endpoints. Preserved backward compatibility with legacy `AGENT_API_KEY` via deprecation warning headers.
- **Server-Side JWT Session Invalidation**: Integrated instant session revocation with `token_version` tracking in `middleware/auth.js`. Tokens are immediately invalidated upon user password change, admin role modification, or account deletion. Reduced token lifetime to 30 minutes with `/api/auth/refresh` endpoint support.
- **Frontend Storage & Strict CSP**: Hardened Helmet Content-Security-Policy (`object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`). Introduced centralized token refresh and auth lifecycle handling.
- **Python Microservices Security Hardening**: Validated required JWT identity claims (`id`/`sub`, `role`, `exp`) in `pdf-service` and `file-service`. Replaced raw internal exception exposures (`detail=str(e)`) with sanitized generic error responses containing traceable request IDs.
- **Fail-Closed Production CORS**: Eliminated wildcard CORS origins (`*`) in production across Backend, PDF Service, and File Service. Mandatory comma-separated `CORS_ORIGINS` enforced at startup.

### Phase 3 — Reliability & Scale
- **Scan Concurrency Control**: Added bounded worker concurrency with `PING_CONCURRENCY` (default 25) and `PRINTER_SCAN_CONCURRENCY` (default 5). Implemented staggered scan start jitter (5–15ms, 10–30ms) and target locks (`activePings`, `activeScans`) to prevent thundering herd problems and duplicate simultaneous scans.
- **Atomic Toner Database Transactions**: Refactored toner updates to execute within explicit MSSQL transactions (`BEGIN` -> `DELETE` -> `INSERT` -> `COMMIT` / `ROLLBACK`) across both automatic scans and manual printer mutation routes.
- **Graceful Server Shutdown**: Added `SIGTERM` and `SIGINT` handlers in `server.js` to halt inbound HTTP connections, close Socket.IO, stop cron jobs and intervals, close the MSSQL pool cleanly, and bound exit timeouts to 10 seconds.
- **Socket.IO Reconnection Loop Prevention**: Configured socket client to halt reconnect loops upon authentication failure, attempt `/api/auth/refresh`, transition to clean logout state if refresh fails, and establish a clean connection once re-authenticated.

### Phase 4 — Testing & CI/CD
- **Real Frontend Component Tests**: Replaced mock tests with real Vitest + React Testing Library + jsdom suites for `AuthProvider`, `Login`, `ForceChangePassword`, `NotificationProvider`, `useSocket`, `api.js`, and `DeviceDetailModal`. Verified mandatory regression test for simultaneous offline notifications.
- **Comprehensive Backend HTTP Integration Tests**: Added real end-to-end HTTP route tests covering login, brute-force rate limiting (429), RBAC hierarchy (viewer 403, operator 201, admin delete), expired tokens, session invalidation, agent validation, and 500+ software inventory chunking.
- **Hardened CI/CD Pipeline**: Upgraded `.github/workflows/ci.yml` with `npm audit --audit-level=high` for Backend, Agent, and Frontend, `pip-audit` vulnerability scanning for Python services, Vitest and Vite production build checks, CodeQL SAST scanning, Docker Compose configuration validation, and clean installation smoke tests.

### Phase 5 — Configuration & Documentation
- **Configurable SNMP Community & Protocols**: Removed hardcoded `"public"` fallback in production. Added `SNMP_COMMUNITY` environment variable support and an extensible abstraction for SNMPv3 (auth/priv protocols and keys). Ensured SNMP credentials are never exposed in API output or server logs.
- **Configurable Low Toner Threshold**: Centralized toner threshold in `backend/utils/tonerConfig.js` (`LOW_TONER_THRESHOLD_PERCENT=10`, validated 1–100) and removed duplicate hardcoded `< 10%` logic across dashboard queries, printer monitor alerts, and notifications.
- **Production HTTPS Deployment Model**: Created `docker-compose.prod.yml`, `frontend/nginx.prod-ssl.conf` with HTTP-to-HTTPS redirect, HSTS, TLSv1.2/1.3, and modern ciphers, and a certificate generation helper script (`scripts/generate_self_signed_cert.sh`).
- **CIDR-Aware IPAM Network Model**: Implemented `backend/utils/ipamUtils.js` supporting `/24`, `/23`, `/22`, and arbitrary IPv4 CIDRs with accurate usable host calculations. Explicitly documented and flagged IPv6 as unsupported in this phase. Replaced hardcoded `10.0.80` with configurable `DEFAULT_SUBNET_PREFIX`.
- **Documentation Consolidation**: Archived outdated planning files into `network-monitor/docs/archive/`, updated `README.md`, `ARCHITECTURE.md`, `SECURITY.md`, and established `ROADMAP.md`.
