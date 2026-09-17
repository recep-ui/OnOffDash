# Security Policy — OnOffDash V2

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.0.x   | :white_check_mark: |
| < 2.0   | :x:                |

---

## Reporting Vulnerabilities

If you discover a security vulnerability in this repository, please follow responsible disclosure guidelines. **Do NOT open public GitHub issues for security vulnerabilities.**

Instead, report the vulnerability privately via:
- GitHub Security Advisories tab, or
- Direct contact with the system administrators.

Include as much of the following information as possible:
1. Description of the vulnerability and its potential impact.
2. Step-by-step instructions or proof-of-concept to reproduce the behavior.
3. Affected components, endpoints, or versions.
4. Suggested remediation if available.

---

## Security Best Practices for Deployment

1. **Environment Variables**:
   - Never commit `.env` files into source control.
   - Set `JWT_SECRET` to a cryptographically random string of at least 32 characters (`openssl rand -base64 32`).
   - Set `AGENT_API_KEY` to a unique cryptographically random string (`openssl rand -hex 32`).
   - Set a strong SA password for MSSQL.
2. **Network Isolation**:
   - Do not expose MSSQL (1433) or microservice internal ports (3001, 8001, 8002) directly to the public internet.
   - Utilize reverse proxies (Nginx / Cloudflare / Traefik) with TLS/HTTPS certificates enabled.
3. **Password Security**:
   - Change default administrator credentials immediately on first login.
   - All passwords must adhere to minimum length and complexity policies.
4. **Secret Rotation**:
   - Refer to `SECURITY_MIGRATION.md` for rotating any past credentials or certificates.
