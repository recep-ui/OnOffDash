# OnOffDash V2 — Network & Device Monitoring Solution

OnOffDash V2 is a unified network, hardware, printer, and inventory management platform designed for enterprise environments.

## Repository Overview

```
OnOffDash_V2/
├── .github/
│   └── workflows/
│       └── ci.yml                 # Automated CI (backend test, frontend build, python test, docker validate)
├── AUDIT_REPORT.md                # Full architectural, security & reliability audit findings (P0 - P3)
├── SECURITY_MIGRATION.md          # Credential rotation and sanitization guide
├── SECURITY.md                    # Security policy & reporting procedures
├── PRODUCTION_CHECKLIST.md        # Pre-deployment production readiness verification
└── network-monitor/               # Core Application
    ├── backend/                   # Node.js / Express / Socket.IO / MSSQL API
    ├── frontend/                  # React 19 / Vite 8 Dashboard
    ├── agent/                     # Windows Client System Information & Inventory Agent
    ├── services/
    │   ├── pdf-service/           # FastAPI PDF Tools Microservice
    │   └── file-service/          # FastAPI File & Image Tools Microservice
    ├── docker-compose.yml         # Production hardened compose setup (isolated internal services)
    └── docker-compose.override.yml.example # Optional local dev port mapping
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
