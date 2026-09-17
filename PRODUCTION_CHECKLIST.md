# Production Deployment Checklist — OnOffDash V2

Before deploying OnOffDash V2 to a production or corporate network environment, verify that each of the following security and operational criteria is satisfied.

---

## 1. Secrets & Authentication

- [ ] `.env` files are excluded from Git (`.gitignore` verified; no secret commits).
- [ ] `JWT_SECRET` is set to a cryptographically secure string of at least 32 characters.
- [ ] `AGENT_API_KEY` is set to a cryptographically secure string (min 32 chars) and matched in client agent configs.
- [ ] `MSSQL_SA_PASSWORD` is strong (at least 16 chars with uppercase, lowercase, numbers, and symbols).
- [ ] Initial administrator password (`BOOTSTRAP_ADMIN_PASSWORD`) changed immediately after first deployment.
- [ ] Rate limiting is active on `/api/auth/login` (10 attempts per 15 minutes).

---

## 2. Network & Port Hardening

- [ ] Reverse proxy (Nginx) is the only entry point listening on public/host ports (80 / 443).
- [ ] Direct host port bindings for `1433` (MSSQL), `3001` (Backend), `8001` (PDF), and `8002` (File) are disabled.
- [ ] TLS/SSL certificate configured on the reverse proxy or external load balancer.
- [ ] CORS is restricted to valid domains using `CORS_ORIGIN` (no `*` wildcard in production).
- [ ] Helmet security headers active on HTTP responses (`X-Frame-Options`, `X-Content-Type-Options`, HSTS).

---

## 3. Database & Storage

- [ ] MSSQL data volume (`mssqldata`) is backed up regularly.
- [ ] Connection pool parameters configured appropriately for expected load.
- [ ] Sensitive parameters (`password`, `token`, `secret`) are masked in query error logs.
- [ ] Log retention policy configured (`RETENTION_DAYS`, cleanup cron job active at 03:00 daily).
- [ ] Delta-only device status logging verified to prevent table bloating.

---

## 4. Agent & Microservices

- [ ] Windows Agent binaries compiled with matching `AGENT_API_KEY` and updated `SERVER_URL`.
- [ ] Agent updater verified to enforce SHA-256 integrity checks and automatic rollback on failure.
- [ ] PDF and File microservices require verified JWT Bearer tokens on all processing and download endpoints.
- [ ] Excel exports sanitize formulas starting with `=`, `+`, `-`, `@` to prevent CWE-1236 injection.

---

## 5. Monitoring & Health

- [ ] Liveness health check `/api/health` and readiness probe `/api/ready` monitored.
- [ ] Background ping intervals tuned for network scale (`PING_INTERVAL_SECONDS`).
- [ ] Printer SNMP community strings configured securely on network printers (default `public` changed if possible).
- [ ] CI pipeline (`.github/workflows/ci.yml`) passing on all checks.
