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

### 2. Backend (`backend`)
* **Technology:** Node.js 20, Express 4, Socket.IO 4, MSSQL (`mssql` / `tedious`).
* **Responsibilities:**
  - REST API for authentication, device management, IPAM, and system diagnostics.
  - Real-time event broadcasting over Socket.IO with strict JWT authentication.
  - `PingService`: Delta-only status logging and ICMP polling with configurable concurrency (`PING_CONCURRENCY`).
  - `PrinterMonitorService`: SNMP polling (SNMPv1/v2c with SNMPv3 readiness) and atomic toner updates inside SQL transactions.
  - Heartbeat & Software ingestion with per-device credentials and strict schema validation.
  - Graceful shutdown on `SIGTERM`/`SIGINT` closing HTTP, Socket.IO, intervals, and database pools cleanly.
* **Port:** `3001` (Internal only).

### 3. Frontend (`frontend`)
* **Technology:** React 19, Vite, Recharts, Lucide Icons, Vanilla CSS Design System.
* **Responsibilities:**
  - Real-time operations dashboard, device detail modals, IPAM visualizer, and print fleet monitor.
  - Glassmorphic, responsive UI with micro-animations and accessibility features.
  - Handled Socket.IO connection lifecycle with automatic token refresh and loop-breaking on authentication failure.
* **Port:** `80` (HTTP development) / `443` (Production TLS).

### 4. PDF Service (`pdf-service`)
* **Technology:** Python 3.11, FastAPI, PyPDF, PyMuPDF.
* **Responsibilities:** PDF merging, splitting, watermarking, compression, and page manipulation.
* **Port:** `8001` (Internal only).

### 5. File Service (`file-service`)
* **Technology:** Python 3.11, FastAPI, Pillow.
* **Responsibilities:** Image format conversion, CSV encoding normalization, batch renaming, and archive extraction.
* **Port:** `8002` (Internal only).

### 6. Windows Agent (`agent`)
* **Technology:** Node.js, `systeminformation`, `node-fetch`, `pkg`.
* **Responsibilities:** Collects endpoint metrics (CPU, RAM, Disk, Uptime) and software inventory (Registry, Appx, Windows Services) and transmits them securely over HTTPS. Includes RSA-signed auto-updater with SHA-256 binary validation.

---

## 3. Data Flow & Architectural Guarantees

### 1. Delta-Only Status Transitions
To prevent database log bloat, `device_status_logs` receives entries **only** when an actual state transition occurs (`online <-> offline`, `online <-> warning`). Consecutive identical states produce zero database writes and emit zero redundant socket events.

### 2. Canonical Socket.IO Event Contract
The system guarantees a uniform schema for all `device:statusChanged` events across producers (Ping, Heartbeat, Timeout) and consumers (Frontend toasts, table updates):

```json
{
  "device": {
    "id": 42,
    "hostname": "SRV-APP-01",
    "ip_address": "10.0.10.15"
  },
  "oldStatus": "online",
  "newStatus": "offline",
  "reason": null,
  "timestamp": "2026-09-18T14:30:00.000Z"
}
```
Notification deduplication keys use the real device ID (`offline-${device.id}`), ensuring concurrent failures of multiple devices generate independent notifications without suppression.

### 3. Separation of Network Ping from Agent Heartbeat
Network presence and agent health are strictly decoupled:
* `devices.status` & `devices.last_ping_at`: Managed exclusively by `PingService` based on ICMP ping reachability. Only `PingService` transitions emit `device:statusChanged`.
* `devices.agent_status` & `devices.last_heartbeat_at`: Managed exclusively by agent telemetry. Transitions emit `agent:statusChanged`.
* Heartbeat submissions do **not** mark network status as online or emit network transition events.
* Newly enrolled devices default to `offline` network state until verified by ICMP ping.

### 4. Scalable & Atomic Software Inventory Processing
Software inventory submissions are validated against a 2,000-item ceiling and inserted in atomic batches of 100 items within an explicit MSSQL transaction:
```sql
BEGIN TRANSACTION;
DELETE FROM device_software WHERE device_id = @deviceId;
-- Batch inserts (100 rows each)
COMMIT TRANSACTION;
```
If any batch fails, the transaction is automatically rolled back, preserving the previous software state without data loss.

### 5. Atomic Toner Database Updates
Printer toner updates use atomic transactions (`BEGIN` -> `DELETE` -> `INSERT` -> `COMMIT` / `ROLLBACK`) in both automatic monitoring scans and manual route updates.

### 6. Persistent Session Revocation & HttpOnly Refresh Architecture
* **In-Memory Access Tokens**: 15-minute access tokens stored exclusively in React memory, never persisted in `localStorage` or `sessionStorage` (XSS mitigation).
* **HttpOnly Refresh Cookies**: Controlled session renewal via `HttpOnly`, `SameSite=Strict`, `Secure` cookies with database rotation tracking (`user_refresh_tokens`).
* **Authoritative MSSQL `token_version`**: Token invalidation is persistent in MSSQL `users.token_version`. Shared validation logic (`verifyAccessToken`) ensures both HTTP requests and Socket.IO handshakes reject revoked tokens even across server restarts or cache resets.

### 7. Authoritative Per-Device Agent Credential Binding
* Per-device Agent keys (`agk_<keyId>.<secret>`) strictly bind telemetry to `authenticatedDeviceId`.
* Verifies submitted IP matches the credential-bound device; mismatching or unknown IPs are rejected with `403 Forbidden`, closing device impersonation gaps.

### 8. Fully CIDR-Aware IPv4 IPAM Architecture
* Subnets and available IP generation utilize 32-bit numerical calculations (`ipToLong`, `longToIp`).
* Arbitrary IPv4 CIDR blocks (`/22`, `/23`, `/24`, `/25`, `/30`, `/31`, `/32`) are supported accurately without octet-boundary assumptions.
* `/suggest` generates available hosts spanning multi-octet blocks (e.g., `10.0.80.0/23` covers `10.0.80.x` and `10.0.81.x`). Unsupported IPv6 requests return explicit HTTP 400.

### 9. Unified Spreadsheet Infrastructure (ExcelJS)
* Replaced the deprecated and removed `xlsx` library with `exceljs` across all printer and inventory import/export endpoints.
* Reuses `backend/utils/excelHelper.js` for cell sanitization (CWE-1236 mitigation), Turkish column normalization, and streaming parsing.

### 10. Least-Privilege Database Lifecycle
* **db-init container**: Exclusively holds SA credentials to perform DDL, run migrations, and seed bootstrap administrators.
* **backend runtime**: Connects strictly using restricted application credentials (`onoffdash_app`), validating schema existence without requiring SA or DDL privileges.

---

## 4. Production Deployment & Networking

### Production HTTPS Deployment
Production deployments utilize `docker-compose.prod.yml` and `frontend/nginx.prod-ssl.conf`:
* Port `80`: Automatically redirects all traffic to HTTPS via `301 Moved Permanently`.
* Port `443`: Terminated with TLSv1.2/TLSv1.3, modern ciphers, and `Strict-Transport-Security` (HSTS).
* Reverse Proxy Security: Proxies set `X-Forwarded-Proto https` and pass sanitized headers to backend services.
