# ONOFFDASH V2 — SECURITY MIGRATION & SECRET ROTATION GUIDE

## 1. Overview & Immediate Warning

During the security audit, it was determined that previous repository commits contained live or hardcoded credentials:
- **MSSQL Database Passwords** (Previously committed `sa` password and local `gkn` account password).
- **JWT Signing Secret** (Previously committed default key `on-off-dash-secret-key-2026`).
- **Default Administrative Credentials** (`admin` / `admin123` hardcoded in migrations).

All `.env` files have now been permanently removed from Git tracking and added to `.gitignore`. **However, because Git commit history was preserved (to prevent breaking clones and remote tracking), any credentials that existed in previous commits MUST be rotated immediately in all staging and production environments.**

---

## 2. Required Secret Rotation Steps

### A. Rotate Microsoft SQL Server Passwords
1. Connect to SQL Server using `sqlcmd` or SSMS as administrator:
   ```sql
   ALTER LOGIN [sa] WITH PASSWORD = 'NewStrongPasswordHere!';
   ```
2. If using the dedicated application account `gkn` or `app_user`:
   ```sql
   ALTER LOGIN [app_user] WITH PASSWORD = 'NewStrongAppPasswordHere!';
   ```
3. Update `.env` files (`network-monitor/.env` and `network-monitor/backend/.env`) with the new passwords.

### B. Rotate JWT Signing Secret
1. Generate a cryptographically secure random 64-character hex secret:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Set this value as `JWT_SECRET` in:
   - `network-monitor/.env`
   - `network-monitor/backend/.env`
   - Microservices environments
3. **Impact:** Rotating `JWT_SECRET` invalidates all existing active user sessions, requiring users to log in again.

### C. Configure Shared Agent API Key
1. Generate a cryptographically secure key for Windows Agent communication:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Set this value as `AGENT_API_KEY` in:
   - Backend `.env`
   - Agent `.env` on all monitored workstations
3. **Impact:** Agents without the matching `AGENT_API_KEY` will receive HTTP 401 on `/api/heartbeat` and `/api/software`.

### D. Rotate Existing User Passwords
1. Any user accounts created with default `admin123` passwords must be updated immediately via the UI profile / user management or SQL:
   ```sql
   -- Password change should be performed through the application's bcrypt hash
   ```
2. Enable `must_change_password` for unprivileged or freshly bootstrapped users.

---

## 3. Production Environment Checklist

- [ ] `.env` files are not tracked in Git (`git ls-files | grep '\.env'` returns only `.env.example`).
- [ ] No hardcoded passwords remain in source files.
- [ ] New SQL passwords are in effect on the database server.
- [ ] New `JWT_SECRET` is applied across backend and Python microservices.
- [ ] `AGENT_API_KEY` is distributed to Windows endpoints.
- [ ] Default `admin123` password is changed.
