# OnOffDash V2 — Strategic Roadmap

This document outlines the planned future enhancements and architectural evolution for OnOffDash V2 following the successful completion of the Phase 1–5 remediation.

---

## 1. Upcoming Capabilities

### SNMPv3 Enterprise Support
- **Full Credential Vault**: Support per-printer encrypted SNMPv3 credentials in MSSQL with AuthNoPriv, AuthPriv, SHA/SHA-256 auth, and AES-128/AES-256 privacy.
- **SNMP Trap Listener**: Asynchronous SNMP trap daemon for instantaneous printer event alerting (paper jam, cover open, empty toner) without polling latency.

### IPv6 IPAM Support
- **Dual-Stack Subnet Tracking**: Extend `ipamUtils.js` to parse IPv6 `/64` subnets, calculate prefix allocations, and monitor EUI-64 and SLAAC device addresses.
- **IPv6 Conflict Detection**: Detect duplicated link-local and global unicast addresses across managed networks.

### Cookie-Based Session Migration (Phase B)
- **HttpOnly Refresh Cookies**: Migrate JWT refresh tokens completely into `HttpOnly`, `SameSite=Strict`, `Secure` cookies with anti-CSRF double-submit protection.
- **In-Memory Access Tokens**: Maintain access tokens strictly in JavaScript heap memory, eliminating `localStorage` token persistence entirely.

### Multi-Tenant & RBAC Granularity
- **Site / Department Scoping**: Enable operators to be scoped to specific departments or physical buildings.
- **Audit Log Export**: Comprehensive compliance audit trail export for SOC2 and ISO 27001 readiness.

---

## 2. Deprecation Schedule

| Feature | Current Status | Deprecation Target | Removal Target |
|---|---|---|---|
| Legacy Shared `AGENT_API_KEY` | Deprecated (Header Warning) | v2.2.0 | v3.0.0 |
| HTTP Port 80 in Production | Deprecated (Redirected) | v2.2.0 | N/A (Redirect retained) |
| Hardcoded IPAM `/24` Fallback | Configurable Fallback | v2.3.0 | v3.0.0 |
