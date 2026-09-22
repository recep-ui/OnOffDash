# Production Deployment Checklist — OnOffDash V2

Before deploying OnOffDash V2 to a production or corporate network environment, verify that each of the following security and operational criteria is satisfied.

---

## 1. Secrets & Authentication

- [ ] `.env` files are excluded from Git (`.gitignore` verified; no secret commits).
- [ ] Asymmetric RS256 2048-bit RSA keypair generated in `keys/` (`jwt_private.pem` 0600, `jwt_public.pem` 0644).
- [ ] Production environment variables configured: `JWT_PRIVATE_KEY_PATH` (backend), `JWT_PUBLIC_KEY_PATH` (backend, microservices).
- [ ] `AUTH_INTROSPECTION_SECRET` set to a cryptographically secure random string (at least 32 characters) shared between backend and Python microservices.
- [ ] `JWT_SECRET` is NOT used or relied upon in production (`NODE_ENV=production` fails closed if RSA keys missing).
- [ ] Per-device credentials (`agk_<keyId>.<secret>`) generated and deployed for all client agents.
- [ ] `ALLOW_LEGACY_AGENT_AUTH` is unset or explicitly set to `false` in production.
- [ ] `MSSQL_SA_PASSWORD` is strong (at least 16 chars with uppercase, lowercase, numbers, and symbols).
- [ ] Initial administrator password (`BOOTSTRAP_ADMIN_PASSWORD`) changed immediately after first deployment.
- [ ] Rate limiting is active on `/api/auth/login` (10 attempts per 15 minutes).
- [ ] Refresh tokens rotate atomically, fail closed on persistence errors, and are stored strictly in `HttpOnly`, `SameSite=Strict`, `Secure` cookies.

---

## 2. Network & Port Hardening

- [ ] Reverse proxy (Nginx) is the only entry point listening on public/host ports (80 / 443).
- [ ] Direct host port bindings for `1433` (MSSQL), `3001` (Backend), `8001` (PDF), and `8002` (File) are disabled.
- [ ] TLS/SSL certificate configured on the reverse proxy or external load balancer.
- [ ] CORS is restricted to valid domains using `CORS_ORIGINS` (no `*` wildcard in production).
- [ ] Document-layer Content-Security-Policy (CSP) active in Nginx and verified in browser console.
- [ ] Helmet security headers active on HTTP responses (`X-Frame-Options`, `X-Content-Type-Options`, HSTS).

---

## 3. Database & Storage

- [ ] MSSQL data volume (`mssqldata`) is backed up regularly.
- [ ] Database migration `012_security_hardening` executed:
  - Unique index `UQ_user_refresh_tokens_token_hash` created.
  - Filtered unique index `uq_active_agent_credential_per_device` created.
- [ ] Connection pool parameters configured appropriately for expected load.
- [ ] Sensitive parameters (`password`, `token`, `secret`) are masked in query error logs.
- [ ] Log retention policy configured (`RETENTION_DAYS`, cleanup cron job active at 03:00 daily).
- [ ] Delta-only device status logging verified to prevent table bloating.

---

## 4. Agent & Microservices

- [ ] Windows Agent binaries compiled with per-device credentials (`agk_<keyId>.<secret>`) and HTTPS `SERVER_URL`.
- [ ] Agent updater verified to enforce SHA-256 integrity checks, RSA manifest signature verification, and automatic rollback on failure.
- [ ] PDF and File microservices require verified JWT Bearer tokens with mandatory `token_version` claim.
- [ ] Microservice DoS protections active: max 50 preview pages, 25 megapixel Pillow decompression bomb threshold.
- [ ] Excel exports sanitize formulas starting with `=`, `+`, `-`, `@` to prevent CWE-1236 injection.

---

## 5. Container & Supply Chain Security

- [ ] Docker Compose runs with `security_opt: ["no-new-privileges:true"]` and `cap_drop: ["ALL"]`.
- [ ] CI pipeline (`.github/workflows/ci.yml`) passing on all checks with pinned third-party action SHAs.
- [ ] Dependabot active across npm, pip, and github-actions ecosystems.
- [ ] GitHub repository branch protection rules active on `main` branch.
- [ ] Liveness health check `/api/health` and readiness probe `/api/ready` monitored.
