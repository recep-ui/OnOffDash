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
Network presence and agent health are decoupled:
* `devices.last_ping_at`: Updated exclusively by successful ICMP ping responses.
* `devices.last_heartbeat_at`: Updated exclusively by agent telemetry.
* `devices.agent_status`: `online` or `offline` based on `HEARTBEAT_TIMEOUT_SECONDS`.
If an endpoint responds to ping but its agent has stopped, the system correctly reports the network status as `online` and the agent status as `offline`.

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

---

## 4. Production Deployment & Networking

### Production HTTPS Deployment
Production deployments utilize `docker-compose.prod.yml` and `frontend/nginx.prod-ssl.conf`:
* Port `80`: Automatically redirects all traffic to HTTPS via `301 Moved Permanently`.
* Port `443`: Terminated with TLSv1.2/TLSv1.3, modern ciphers, and `Strict-Transport-Security` (HSTS).
* Reverse Proxy Security: Proxies set `X-Forwarded-Proto https` and pass sanitized headers to backend services.
