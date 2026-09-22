# Security Policy & Architecture — OnOffDash V2

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.3.x   | :white_check_mark: |
| 2.2.x   | :white_check_mark: |
| 2.1.x   | :white_check_mark: |
| < 2.1   | :x:                |

---

## 1. Security Architecture & Threat Model

### 1.1 Authentication & Session Lifecycle
* **Short-Lived In-Memory Access Tokens**: JWT access tokens are valid for 15 minutes and held exclusively in React JavaScript heap memory. Access tokens are **never stored in `localStorage` or `sessionStorage`** to prevent token theft via XSS.
* **HttpOnly Refresh Cookies**: Long-lived refresh sessions are managed via `HttpOnly`, `SameSite=Strict`, `Secure` cookies with database rotation tracking (`user_refresh_tokens`). The `/api/auth/refresh` endpoint silently rotates refresh tokens and issues fresh in-memory access tokens. Refresh tokens in `req.body` are strictly rejected.
* **Atomic Replay-Resistant Rotation & Family Revocation**: Refresh token rotation is executed within a database transaction using atomic conditional update (`WHERE id = @id AND revoked_at IS NULL`). Replay of an already rotated or revoked token immediately triggers token family revocation (`UPDATE user_refresh_tokens SET revoked_at = GETUTCDATE() WHERE family_id = @familyId`), terminating the compromised session.
* **Asymmetric RS256 JWT Support**: Access tokens are signed using private RSA keys and verified by downstream microservices using the public key or via the authoritative RFC 7662 introspection endpoint (`POST /api/auth/introspect`). Algorithm confusion attacks are prevented by strictly restricting verification to explicit allowed algorithms (`RS256`, with fallback to `HS256`).
* **Authoritative Multi-Instance Session Invalidation (`token_version`)**: Authoritative session freshness is enforced via `users.token_version` in MSSQL. A bounded in-memory cache with a 5-second TTL prevents database hammering while guaranteeing cross-instance revocation propagates within 5 seconds. Tokens missing or mismatching `token_version` are rejected immediately.
* **Password Change Restriction**: Users flagged with `must_change_password: true` are strictly blocked (403 `PASSWORD_CHANGE_REQUIRED`) from calling any API endpoints other than `/api/auth/me` and `/api/auth/change-password`.

### 1.2 Agent Identity & Telemetry Security
* **Zero-Trust Per-Device Credentials**: Telemetry authentication requires per-device credentials in format `agk_<keyId>.<secret>`. Secrets are stored only as SHA-256 hashes in `agent_credentials` and validated using `crypto.timingSafeEqual`. A filtered unique index (`uq_active_agent_credential_per_device`) guarantees at the database level that each device has at most one active credential.
* **Elimination of Shared-Key Bypass**: Legacy shared `AGENT_API_KEY` authentication is disabled by default. It can only be enabled explicitly during migration by setting `ALLOW_LEGACY_AGENT_AUTH=true`.
* **Authoritative Device Binding**: The authenticated device ID (`req.authenticatedDeviceId`) authoritatively determines device telemetry and software inventory scope. Telemetry submissions attempting to create new devices or spoof conflicting IP addresses are rejected with `403 Forbidden`.
* **Transactional Credential Rotation**: Enrollment and rotation in `POST /api/agent/enroll` and `/api/agent/rotate` execute within SQL transactions, ensuring atomic revocation of previous keys and generation of new credentials.
* **Bounded Payload Strings**: Heartbeat optional strings (`os_name`, `username`) are strictly bounded to database column lengths (<= 100 chars) to prevent memory and database exhaustion.

### 1.3 Windows Agent Updater Security
* **Binary Integrity**: Downloaded updater binaries are verified against SHA-256 digests and byte-size limits before execution.
* **Cryptographic Signatures**: Update manifests are signed with a 2048-bit RSA private key and verified on the client using an embedded public key (`rsa.verify`).
* **HTTPS Enforcement**: Agents refuse updates over unencrypted HTTP in production mode (`ALLOW_INSECURE_HTTP=false`).
* **Atomic Rollback**: If a binary update fails or fails verification, the previous binary is preserved.

### 1.4 Database Least Privilege & Port Isolation
* **Least-Privilege Database Role**: Runtime microservices (`backend`, `pdf-service`, `file-service`) connect as `onoffdash_app` without `sysadmin` or `sa` privileges.
* **Host Port Isolation**: MSSQL port `1433`, backend port `3001`, and Python service ports `8001`/`8002` are **never published** to the host. Only Nginx port `80`/`443` is exposed.

### 1.5 Web Security Headers & CORS Policy
* **Document-Layer Content-Security-Policy (CSP)**: Nginx enforces strict document-layer CSP headers matching backend Helmet policies:
  ```nginx
  add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'self'; frame-ancestors 'none';" always;
  ```
* **Fail-Closed CORS**: Wildcard CORS origins (`*`) are strictly forbidden in production across all services. Comma-separated `CORS_ORIGINS` is mandatory.
* **Injection Defenses**:
  - Parameterized MSSQL queries (`$1`, `$2` -> `@p1`, `@p2`).
  - Formula injection mitigation (CWE-1236) on all Excel/CSV exports (`sanitizeCell`).

### 1.6 Microservices Security (PDF & File Tools)
* **Resource Bounds & DoS Prevention**:
  - PDF Previews: Bound to maximum 50 pages (`MAX_PREVIEW_PAGES`) and safe rendering dimensions (max 4000px, 16 megapixels).
  - Pillow Decompression Bomb Protection: `Image.MAX_IMAGE_PIXELS = 25_000_000` with dimensions capped at 5000px.
  - Strict parameter clamping: `scale_percent` (1-500%), `quality` (1-100%).
* **Path Traversal Defenses**:
  - Download endpoints strictly sanitize filenames, rejecting path traversal sequences (`..`, `/`, `\`, null bytes).
  - Paths are authoritatively verified using `os.path.realpath` against `OUTPUT_DIR`.
  - File ownership verification ensures users can only download files they generated.
* **Enforced JWT Claim Validation**: PyJWT strictly enforces required expiration (`options={"require": ["exp"]}`) as well as identity (`id` or `sub`), `role`, and `token_version` claims.
* **Information Leakage Prevention**: Python services return generic JSON error responses with unique `request_id`s, suppressing internal exception traces from client responses.

### 1.7 Supply Chain & CI/CD Hardening
* **Pinned Third-Party Actions**: All GitHub Actions are pinned to full, immutable commit SHAs with inline version comments to prevent supply-chain compromise.
* **Minimal Workflow Permissions**: All workflow jobs run with least-privilege permissions (`contents: read`).
* **Credentials Isolation**: Checkout actions specify `persist-credentials: false` to prevent token leakage in subsequent build steps.
* **Docker Container Hardening**: Production containers run with `no-new-privileges: true` and `cap_drop: ALL` (with minimal `NET_RAW` for ping).
* **Automated Dependency Audits**: Dependabot monitors npm, pip, and github-actions ecosystems weekly. Clean `pip-audit` and `npm audit --audit-level=high` gates are enforced in CI.

---

## 2. Recommended GitHub Repository Settings

For complete defense-in-depth, configure the following settings in the GitHub repository:

1. **Branch Protection Rules (`main` branch)**:
   - **Require pull request before merging** with at least 1 approving review.
   - **Require status checks to pass before merging**:
     - `Backend Quality & Security`
     - `Windows Agent Quality & Security`
     - `Frontend Quality, Tests & Build`
     - `Python Microservices Quality & Security`
     - `Secret Scanning (Gitleaks)`
     - `Security SAST (CodeQL)`
     - `Container Vulnerability Scanning (Trivy)`
     - `Docker Compose & Deployment Smoke Test`
   - **Require branches to be up to date before merging**.
   - **Require linear history** (squash or rebase merging).
   - **Do not allow bypassing the above settings**.
2. **Security & Analysis**:
   - **Dependabot alerts**: Enabled.
   - **Dependabot security updates**: Enabled.
   - **Secret scanning**: Enabled.
   - **Secret scanning push protection**: Enabled.
   - **Private vulnerability reporting**: Enabled.

---

## 3. Responsible Disclosure

If you discover a security vulnerability in this repository:
1. **Do NOT open public GitHub issues for security vulnerabilities.**
2. Report privately via the GitHub Security Advisories tab or system administrators.
3. Include reproduction steps, potential impact, and affected components.
