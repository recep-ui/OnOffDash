# Security Policy & Architecture — OnOffDash V2

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.1.x   | :white_check_mark: |
| 2.0.x   | :white_check_mark: |
| < 2.0   | :x:                |

---

## 1. Security Architecture & Threat Model

### 1.1 Authentication & Session Lifecycle
* **Short-Lived In-Memory Access Tokens**: JWT access tokens are valid for 15 minutes and held exclusively in React JavaScript heap memory. Access tokens are **never stored in `localStorage` or `sessionStorage`** to prevent token theft via XSS.
* **HttpOnly Refresh Cookies**: Long-lived refresh sessions are managed via `HttpOnly`, `SameSite=Strict`, `Secure` cookies with database rotation tracking (`user_refresh_tokens`). The `/api/auth/refresh` endpoint silently rotates refresh tokens and issues fresh in-memory access tokens.
* **Persistent Session Invalidation (`token_version`)**: Authoritative session validation is backed by `users.token_version` in MSSQL. Shared verification (`verifyAccessToken`) is enforced across both REST endpoints and Socket.IO connection handshakes. Tokens are permanently invalidated across server restarts and multi-instance deployments when:
  - A user changes their password.
  - An administrator modifies a user's RBAC role.
  - A user account is deleted.
* **Password Change Restriction**: Users flagged with `must_change_password: true` are strictly blocked (403 `PASSWORD_CHANGE_REQUIRED`) from calling any API endpoints other than `/api/auth/me` and `/api/auth/change-password`.

### 1.2 Agent Identity & Telemetry Security
* **Per-Device Hashed Credentials**: Supports unique per-agent credentials (`agk_<keyId>.<secret>`). Secrets are stored only as SHA-256 hashes in `agent_credentials`. Verification uses constant-time comparison (`crypto.timingSafeEqual`).
* **Authoritative Device Binding**: When per-device credentials are used, the authenticated device ID is authoritative. Telemetry submissions matching non-existent or conflicting device IPs are strictly rejected with `403 Forbidden`, closing device impersonation gaps and preventing unauthorized device creation.
* **Bounded Payload Strings**: Heartbeat optional strings (`os_name`, `username`) are strictly bounded to database column lengths (<= 100 chars) to prevent multi-megabyte payload abuse.
* **Backward Compatibility**: Legacy `AGENT_API_KEY` is supported during transition with a deprecation warning header (`X-Agent-Auth-Warning`).

### 1.3 Windows Agent Updater Security
* **Binary Integrity**: Downloaded updater binaries are verified against SHA-256 digests and byte-size limits before execution.
* **Cryptographic Signatures**: Update manifests are signed with a 2048-bit RSA private key and verified on the client using an embedded public key (`rsa.verify`).
* **HTTPS Enforcement**: Agents refuse updates over unencrypted HTTP in production mode (`ALLOW_INSECURE_HTTP=false`).
* **Atomic Rollback**: If a binary update fails or fails verification, the previous binary is preserved.

### 1.4 Database Least Privilege & Port Isolation
* **Least-Privilege Database Role**: Runtime microservices (`backend`, `pdf-service`, `file-service`) connect as `onoffdash_app` without `sysadmin` or `sa` privileges.
* **Host Port Isolation**: MSSQL port `1433`, backend port `3001`, and Python service ports `8001`/`8002` are **never published** to the host. Only Nginx port `80`/`443` is exposed.

### 1.5 Web Security Headers & CORS Policy
* **Content-Security-Policy (CSP)**: Strict Helmet configuration with `object-src 'none'`, `base-uri 'self'`, and `frame-ancestors 'none'`.
* **Fail-Closed CORS**: Wildcard CORS origins (`*`) are strictly forbidden in production across all services. Comma-separated `CORS_ORIGINS` is mandatory.
* **Injection Defenses**:
  - Parameterized MSSQL queries (`$1`, `$2` -> `@p1`, `@p2`).
  - Formula injection mitigation (CWE-1236) on all Excel/CSV exports (`sanitizeCell`).

### 1.6 Microservices Security (PDF & File Tools)
* **Enforced JWT Claim Validation**: PyJWT strictly enforces required expiration (`options={"require": ["exp"]}`) as well as identity (`id` or `sub`) and `role` claims. Missing expiration or identity attributes results in immediate HTTP 401 rejection.
* **Information Leakage Prevention**: Python services return generic JSON error responses with unique `request_id`s, suppressing internal exception traces from client responses.

---

## 2. Responsible Disclosure

If you discover a security vulnerability in this repository:
1. **Do NOT open public GitHub issues for security vulnerabilities.**
2. Report privately via the GitHub Security Advisories tab or system administrators.
3. Include reproduction steps, potential impact, and affected components.
