# OnOffDash V2 — Network & Device Monitoring Solution

OnOffDash V2 is a unified network, hardware, printer, and inventory management platform designed for enterprise environments.

## Repository Overview

```
OnOffDash_V2/
├── .github/
│   └── workflows/
│       └── ci.yml                 # Automated CI (audits, vitest, backend test, python test, docker)
├── ARCHITECTURE.md                # Definitive production system architecture & topology
├── SECURITY.md                    # Security architecture, controls, threat model & disclosure
├── ROADMAP.md                     # Upcoming capabilities (SNMPv3, IPv6, HttpOnly cookies)
├── CHANGELOG.md                   # Complete record of Phase 1 - Phase 5 improvements
├── AUDIT_REPORT.md                # Archived audit findings (all resolved)
├── SECURITY_MIGRATION.md          # Credential rotation and sanitization guide
├── PRODUCTION_CHECKLIST.md        # Pre-deployment production readiness verification
└── network-monitor/               # Core Application
    ├── backend/                   # Node.js / Express / Socket.IO / MSSQL API (93 tests)
    ├── frontend/                  # React 19 / Vite Dashboard (23 Vitest component tests)
    ├── agent/                     # Windows Client Agent & Auto-Updater (12 tests)
    ├── services/
    │   ├── pdf-service/           # FastAPI PDF Tools Microservice (8 tests)
    │   └── file-service/          # FastAPI File & Image Tools Microservice (12 tests)
    ├── docker-compose.yml         # Local HTTP development compose setup
    ├── docker-compose.prod.yml    # Production HTTPS / TLS compose override
    └── docs/archive/              # Archived legacy planning and audit documents
```

## Quick Start (Docker)

1. Setup environment variables:
   ```bash
   cd network-monitor
   cp .env.example .env
   cp backend/.env.example backend/.env
   ```
2. Set secure values for `MSSQL_SA_PASSWORD`, `JWT_SECRET` (min 32 chars), and `AGENT_API_KEY` (min 32 chars).
3. Start the containers:
   ```bash
   docker compose up -d --build
   ```
4. Access the web dashboard at `http://localhost` (Nginx proxies all traffic through port 80).

For detailed service setup, API documentation, and manual development instructions, see [network-monitor/README.md](network-monitor/README.md).
