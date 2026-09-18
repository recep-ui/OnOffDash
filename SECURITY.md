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
* **Short-Lived Access Tokens**: JWT access tokens are valid for 30 minutes. An authenticated `/api/auth/refresh` endpoint manages session renewals.
* **Server-Side Session Invalidation (`token_version`)**: In-memory and persistent `token_version` tracking guarantees instant token invalidation when:
  - A user changes their password.
  - An administrator modifies a user's RBAC role.
  - A user account is deleted.
* **Password Change Restriction**: Users flagged with `must_change_password: true` are strictly blocked (403 `PASSWORD_CHANGE_REQUIRED`) from calling any API endpoints other than `/api/auth/me` and `/api/auth/change-password`.

### 1.2 Agent Identity & Telemetry Security
* **Per-Device Hashed Credentials**: Supports unique per-agent credentials (`agk_<keyId>.<secret>`). Secrets are stored only as SHA-256 hashes in `agent_credentials`. Verification uses constant-time comparison (`crypto.timingSafeEqual`).
* **Cross-Device Telemetry Prevention**: Authenticated agents cannot report telemetry for other endpoints; the backend binds telemetry submissions to the authenticated device ID.
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
* **JWT Claim Validation**: Tokens must include valid `id` (or `sub`), `role`, and expiration `exp`.
* **Information Leakage Prevention**: Python services return generic JSON error responses with unique `request_id`s, suppressing internal exception traces from client responses.

---

## 2. Responsible Disclosure

If you discover a security vulnerability in this repository:
1. **Do NOT open public GitHub issues for security vulnerabilities.**
2. Report privately via the GitHub Security Advisories tab or system administrators.
3. Include reproduction steps, potential impact, and affected components.
