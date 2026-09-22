# OnOffDash V2 — Enterprise System Architecture

This document provides the definitive, authoritative description of the **OnOffDash V2** system architecture, data models, network boundaries, and security design.

---

## 1. High-Level Architecture & Topology

OnOffDash V2 is deployed as a coordinated multi-container architecture using Docker Compose. All client interactions and reverse proxy routing terminate at Nginx, keeping backend application and database ports completely unexposed to the host network.

```mermaid
graph TD
    User["User Browser / Client"] -->|HTTPS 443 / HTTP 80| Nginx["Nginx Reverse Proxy & Frontend"]
    Agent["Windows Endpoint Agent"] -->|HTTPS /api/heartbeat & /api/software| Nginx

    subgraph Docker Internal Bridge Network [Isolated Docker Bridge]
        Nginx -->|Proxy /api/ & /socket.io/| Backend["Backend (Node.js Express + Socket.IO)"]
        Nginx -->|Proxy /api/pdf/| PDFService["PDF Service (Python FastAPI)"]
        Nginx -->|Proxy /api/file-tools/| FileService["File Service (Python FastAPI)"]

        Backend -->|MSSQL TCP 1433 (app_user)| DB[("MSSQL 2022 Express")]
        PDFService -->|MSSQL TCP 1433 (app_user)| DB
        FileService -->|MSSQL TCP 1433 (app_user)| DB
        PDFService -.->|Authoritative Introspect /api/auth/introspect| Backend
        FileService -.->|Authoritative Introspect /api/auth/introspect| Backend
        DBInit["DB Init Container (sa)"] -.->|Bootstrap / Migrations| DB
    end

    Backend -->|ICMP Ping (concurrency: 25)| LAN["Monitored LAN Endpoints"]
    Backend -->|SNMP / Web Scraping (concurrency: 5)| Printers["Network Printers"]
```

---

## 2. Core Service Responsibilities

### 1. Database (`db` & `db-init`)
* **Technology:** Microsoft SQL Server 2022 Express.
* **Network Isolation:** Port `1433` is **strictly internal** to the Docker bridge network. It is **never published** to the host.
* **Least-Privilege Security:**
  - `sa` (system administrator) account is used solely by the ephemeral `db-init` container during initial setup and schema migration.
  - Runtime services (`backend`, `pdf-service`, `file-service`) connect exclusively using the restricted `onoffdash_app` user with DML permissions only.
* **Schema Integrities:**
  - `UQ_user_refresh_tokens_token_hash`: Unique index preventing duplicate refresh token hashes.
  - `IX_user_refresh_tokens_family_id`: Indexed token families for rapid revocation on replay attacks.
  - `uq_active_agent_credential_per_device`: Filtered unique index (`WHERE is_revoked = 0`) ensuring at most one active key per device.

### 2. Backend (`backend`)
* **Technology:** Node.js 20, Express 4, Socket.IO 4, MSSQL (`mssql` / `tedious`).
* **Responsibilities:**
  - REST API for authentication, device management, IPAM, and system diagnostics.
  - Asymmetric RS256 JWT issuance and RFC 7662 token introspection (`POST /api/auth/introspect`).
  - Atomic refresh token rotation with whole-family revocation on replay detection.
  - Authoritative distributed token revocation using bounded 5-second session cache backed by MSSQL `users.token_version`.
  - Real-time event broadcasting over Socket.IO with strict JWT authentication.
  - `PingService`: Delta-only status logging and ICMP polling with configurable concurrency (`PING_CONCURRENCY`).
  - `PrinterMonitorService`: SNMP polling (SNMPv1/v2c with SNMPv3 readiness) and atomic toner updates inside SQL transactions.
  - Per-device credential verification (`agk_<keyId>.<secret>`) with timing-safe comparison and authoritative device binding.
  - Graceful shutdown on `SIGTERM`/`SIGINT` closing HTTP, Socket.IO, intervals, and database pools cleanly.
* **Port:** `3001` (Internal only).

### 3. Frontend (`frontend`)
* **Technology:** React 19, Vite, Recharts, Lucide Icons, Vanilla CSS Design System.
* **Responsibilities:**
  - Real-time operations dashboard, device detail modals, IPAM visualizer, and print fleet monitor.
  - In-memory access token storage (no `localStorage` or `sessionStorage` token leakage).
  - Silent token refresh via HttpOnly cookies with automatic retry and loop breaking.
  - Document-layer Content-Security-Policy (CSP) enforced by Nginx.
* **Port:** `80` (HTTP development) / `443` (Production TLS).

### 4. Microservices (`pdf-service` & `file-service`)
* **Technology:** Python 3.11, FastAPI, PyMuPDF, pypdf, Pillow.
* **Responsibilities:**
  - PDF manipulation: merge, split, reorder, compress, watermark, preview thumbnails.
  - Image manipulation: resize, compress, PNG/JPG conversion.
  - Asymmetric RS256 JWT verification with authoritative revocation checks against MSSQL or backend `/api/auth/introspect`.
  - Resource exhaustion protection: bounded preview pages (max 50), dimension limits (max 4000/5000px), Pillow decompression bomb limits (`MAX_IMAGE_PIXELS = 25,000,000`).
  - Path traversal and ownership checks on all download operations.
* **Ports:** `8001` (PDF), `8002` (File) (Internal only).

---

## 3. Network & Security Boundaries

1. **Edge Reverse Proxy**: All external traffic terminates at Nginx. Nginx handles TLS termination, adds document-layer CSP, HSTS, and frame-options headers, and reverse-proxies to internal Docker services.
2. **Docker Internal Bridge**: Inter-service communication (`backend` <-> `db`, `microservices` <-> `db`, `microservices` <-> `backend`) is strictly contained within the internal Docker bridge network. No internal ports are mapped to the host interface.
3. **Container Runtime Hardening**: Containers execute with `no-new-privileges: true`, `cap_drop: ALL`, and minimal capabilities (`NET_RAW` for ping).
