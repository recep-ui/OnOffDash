# OnOffDash V2 — Changelog

All notable changes and architectural/security improvements across OnOffDash V2 are documented in this file.

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
