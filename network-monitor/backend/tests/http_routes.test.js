const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'this-is-a-test-jwt-secret-key-at-least-32-chars-long';
process.env.AGENT_API_KEY = process.env.AGENT_API_KEY || 'this-is-a-test-agent-key-at-least-32-chars-long';

// Import REAL application and router infrastructure
const { app } = require('../server');
const { pool } = require('../db/connection');
const { 
    clearSessionCache, 
    setUserSession, 
    invalidateUserSessions, 
    markUserDeleted,
    verifyAccessToken,
    signAccessToken
} = require('../middleware/auth');
const { parseCidr, ipToLong, longToIp } = require('../utils/ipamUtils');

describe('Real Production Route Integration Test Suite', () => {
    let server;
    let baseUrl;
    const emittedEvents = [];

    // In-memory test state
    let testUsers = [];
    let testDevices = [];
    let testCredentials = [];
    let testRefreshTokens = [];
    let testSoftware = [];

    // Mock IO attached to production app
    const mockIo = {
        emit(event, data) {
            emittedEvents.push({ event, data });
        },
        sockets: {
            sockets: new Map()
        },
        disconnectUser(userId) {}
    };

    before(async () => {
        app.set('io', mockIo);

        // Intercept pool.query with in-memory SQL mock engine
        const mockQueryFn = async (text, params = []) => {
            const sql = text.trim();
            const upper = sql.toUpperCase();

            // 1. Users queries
            if (upper.includes('FROM USERS WHERE USERNAME =')) {
                const username = params[0];
                const found = testUsers.filter(u => u.username === username);
                return { rows: found, rowCount: found.length };
            }

            if (upper.includes('FROM USERS WHERE ID =')) {
                const id = parseInt(params[0], 10);
                const found = testUsers.filter(u => u.id === id);
                return { rows: found, rowCount: found.length };
            }

            if (upper.includes('UPDATE USERS SET') && upper.includes('PASSWORD_HASH')) {
                const newHash = params[0];
                const id = parseInt(params[1], 10);
                const u = testUsers.find(x => x.id === id);
                if (u) {
                    u.password_hash = newHash;
                    u.must_change_password = 0;
                    u.token_version = (u.token_version || 1) + 1;
                    return { rows: [u], rowCount: 1 };
                }
                return { rows: [], rowCount: 0 };
            }

            if (upper.includes('UPDATE USERS SET') && upper.includes('ROLE =')) {
                const role = params[0];
                const id = parseInt(params[1], 10);
                const u = testUsers.find(x => x.id === id);
                if (u) {
                    u.role = role;
                    u.token_version = (u.token_version || 1) + 1;
                    return { rows: [u], rowCount: 1 };
                }
                return { rows: [], rowCount: 0 };
            }

            if (upper.includes('DELETE FROM USERS')) {
                const id = parseInt(params[0], 10);
                const idx = testUsers.findIndex(x => x.id === id);
                if (idx !== -1) {
                    const removed = testUsers.splice(idx, 1)[0];
                    return { rows: [{ username: removed.username }], rowCount: 1 };
                }
                return { rows: [], rowCount: 0 };
            }

            // 2. Refresh tokens
            if (upper.includes('INSERT INTO USER_REFRESH_TOKENS')) {
                const [userId, tokenHash, tokenVersion] = params;
                const rec = {
                    id: testRefreshTokens.length + 1,
                    user_id: userId,
                    token_hash: tokenHash,
                    token_version: tokenVersion,
                    expires_at: new Date(Date.now() + 7 * 86400 * 1000),
                    revoked_at: null
                };
                testRefreshTokens.push(rec);
                return { rows: [rec], rowCount: 1 };
            }

            if (upper.includes('FROM USER_REFRESH_TOKENS R') && upper.includes('WHERE R.TOKEN_HASH =')) {
                const hash = params[0];
                const session = testRefreshTokens.find(r => r.token_hash === hash);
                if (!session) return { rows: [], rowCount: 0 };
                const u = testUsers.find(x => x.id === session.user_id);
                if (!u) return { rows: [], rowCount: 0 };
                return {
                    rows: [{
                        id: session.id,
                        user_id: session.user_id,
                        token_version: session.token_version,
                        expires_at: session.expires_at,
                        revoked_at: session.revoked_at,
                        uid: u.id,
                        username: u.username,
                        role: u.role,
                        current_token_version: u.token_version,
                        must_change_password: u.must_change_password
                    }],
                    rowCount: 1
                };
            }

            if (upper.includes('UPDATE USER_REFRESH_TOKENS SET REVOKED_AT = GETDATE()')) {
                if (upper.includes('WHERE ID =')) {
                    const id = params[0];
                    const s = testRefreshTokens.find(x => x.id === id);
                    if (s) s.revoked_at = new Date();
                } else if (upper.includes('WHERE TOKEN_HASH =')) {
                    const hash = params[0];
                    const s = testRefreshTokens.find(x => x.token_hash === hash);
                    if (s) s.revoked_at = new Date();
                } else if (upper.includes('WHERE USER_ID =')) {
                    const uid = params[0];
                    testRefreshTokens.filter(x => x.user_id === uid).forEach(s => s.revoked_at = new Date());
                }
                return { rows: [], rowCount: 1 };
            }

            // 3. Devices
            if (upper.includes('FROM DEVICES WHERE IP_ADDRESS =')) {
                const ip = params[0]?.trim();
                const found = testDevices.filter(d => d.ip_address === ip);
                return { rows: found, rowCount: found.length };
            }

            if (upper.includes('FROM DEVICES WHERE ID =')) {
                const id = parseInt(params[0], 10);
                const found = testDevices.filter(d => d.id === id);
                return { rows: found, rowCount: found.length };
            }

            if (upper.includes('SELECT IP_ADDRESS FROM DEVICES')) {
                return { rows: testDevices.map(d => ({ ip_address: d.ip_address })), rowCount: testDevices.length };
            }

            if (upper.includes('SELECT ID, HOSTNAME, IP_ADDRESS, MAC_ADDRESS, DEPARTMENT, STATUS FROM DEVICES')) {
                return { rows: testDevices, rowCount: testDevices.length };
            }

            if (upper.includes('MERGE INTO DEVICES')) {
                const [hostname, ip_address, mac_address, os_name, username] = params;
                let existing = testDevices.find(d => d.ip_address === ip_address);
                if (existing) {
                    existing.hostname = hostname;
                    if (mac_address) existing.mac_address = mac_address;
                    if (os_name) existing.os_name = os_name;
                    if (username) existing.username = username;
                    existing.agent_installed = 1;
                    existing.agent_status = 'online';
                    existing.last_heartbeat_at = new Date();
                    return { rows: [existing], rowCount: 1 };
                } else {
                    const created = {
                        id: testDevices.length + 1,
                        hostname,
                        ip_address,
                        mac_address: mac_address || null,
                        os_name: os_name || '',
                        username: username || '',
                        agent_installed: 1,
                        agent_status: 'online',
                        status: 'offline', // Neutral default
                        last_heartbeat_at: new Date()
                    };
                    testDevices.push(created);
                    return { rows: [created], rowCount: 1 };
                }
            }

            if (upper.includes('UPDATE DEVICES SET')) {
                const id = parseInt(params[4], 10);
                const existing = testDevices.find(d => d.id === id);
                if (existing) {
                    existing.hostname = params[0];
                    if (params[1]) existing.mac_address = params[1];
                    if (params[2]) existing.os_name = params[2];
                    if (params[3]) existing.username = params[3];
                    existing.agent_installed = 1;
                    existing.agent_status = 'online';
                    existing.last_heartbeat_at = new Date();
                    return { rows: [existing], rowCount: 1 };
                }
                return { rows: [], rowCount: 0 };
            }

            // 4. Agent credentials
            if (upper.includes('FROM AGENT_CREDENTIALS WHERE KEY_ID =')) {
                const keyId = params[0];
                const found = testCredentials.filter(c => c.key_id === keyId);
                return { rows: found, rowCount: found.length };
            }

            if (upper.includes('FROM AGENT_CREDENTIALS WHERE DEVICE_ID =')) {
                const devId = params[0];
                const found = testCredentials.filter(c => c.device_id === devId);
                return { rows: found, rowCount: found.length };
            }

            if (upper.includes('UPDATE AGENT_CREDENTIALS SET LAST_USED_AT = GETDATE()')) {
                return { rows: [], rowCount: 1 };
            }

            if (upper.includes('INSERT INTO AGENT_CREDENTIALS')) {
                const [device_id, key_id, key_hash] = params;
                const rec = { id: testCredentials.length + 1, device_id, key_id, key_hash, is_revoked: false };
                testCredentials.push(rec);
                return { rows: [rec], rowCount: 1 };
            }

            // 5. Heartbeats & Software & Printers
            if (upper.includes('INSERT INTO HEARTBEATS')) {
                return { rows: [{ id: 1 }], rowCount: 1 };
            }

            if (upper.includes('DELETE FROM DEVICE_SOFTWARE WHERE DEVICE_ID =')) {
                const devId = params[0];
                testSoftware = testSoftware.filter(s => s.device_id !== devId);
                return { rows: [], rowCount: 1 };
            }

            if (upper.includes('INSERT INTO DEVICE_SOFTWARE')) {
                return { rows: [], rowCount: 1 };
            }

            if (upper.includes('FROM PRINTERS')) {
                return { rows: [], rowCount: 0 };
            }

            return { rows: [], rowCount: 0 };
        };
        mockQueryFn.isMocked = true;
        pool.query = mockQueryFn;

        pool.connect = async () => ({
            query: async (t, p) => pool.query(t, p),
            release: () => {}
        });

        // Start listening on dynamic port
        server = http.createServer(app);
        await new Promise((resolve) => {
            server.listen(0, '127.0.0.1', () => {
                const port = server.address().port;
                baseUrl = `http://127.0.0.1:${port}`;
                resolve();
            });
        });
    });

    after(async () => {
        if (server) {
            await new Promise(r => server.close(r));
        }
    });

    beforeEach(() => {
        clearSessionCache();
        emittedEvents.length = 0;
        testSoftware = [];
        testRefreshTokens = [];

        testUsers = [
            {
                id: 1,
                username: 'admin',
                password_hash: bcrypt.hashSync('AdminPass123!', 4),
                role: 'admin',
                token_version: 1,
                must_change_password: 0
            },
            {
                id: 2,
                username: 'operator',
                password_hash: bcrypt.hashSync('OperatorPass123!', 4),
                role: 'operator',
                token_version: 1,
                must_change_password: 0
            }
        ];

        testDevices = [
            {
                id: 1,
                hostname: 'workstation-a',
                ip_address: '10.0.80.50',
                status: 'offline',
                agent_status: 'offline'
            },
            {
                id: 2,
                hostname: 'workstation-b',
                ip_address: '10.0.80.51',
                status: 'offline',
                agent_status: 'offline'
            }
        ];

        const secretA = 'secret-device-a-12345';
        const hashA = crypto.createHash('sha256').update(secretA).digest('hex');

        testCredentials = [
            {
                id: 1,
                device_id: 1,
                key_id: 'agk_devA',
                key_hash: hashA,
                is_revoked: false
            },
            {
                id: 2,
                device_id: 2,
                key_id: 'agk_revoked',
                key_hash: 'somehash',
                is_revoked: true
            }
        ];
    });

    describe('1. Startup & Module Import Verification', () => {
        it('backend boots successfully after npm ci and exports app and server', () => {
            const serverExports = require('../server');
            assert.ok(serverExports.app);
            assert.ok(serverExports.server);
        });

        it('printer router loads without missing dependencies (xlsx was migrated to exceljs)', () => {
            assert.doesNotThrow(() => {
                require('../routes/printers');
            });
        });
    });

    describe('2. Authentication & Persistent JWT Revocation', () => {
        it('should login and return short-lived access token and set HttpOnly refresh cookie', async () => {
            const res = await fetch(`${baseUrl}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: 'admin', password: 'AdminPass123!' })
            });

            assert.equal(res.status, 200);
            const data = await res.json();
            assert.ok(data.token, 'Must return JWT token');
            assert.equal(data.user.username, 'admin');

            const cookieHeader = res.headers.get('set-cookie');
            assert.ok(cookieHeader, 'Must set Set-Cookie header');
            assert.ok(cookieHeader.includes('HttpOnly'), 'Cookie must be HttpOnly');
            assert.ok(cookieHeader.includes('SameSite=Strict'), 'Cookie must be SameSite=Strict');
            assert.ok(cookieHeader.includes('refreshToken='), 'Cookie must contain refreshToken');
        });

        it('should reject expired JWT access token', async () => {
            const expiredToken = signAccessToken(
                { id: 1, username: 'admin', role: 'admin', token_version: 1 },
                { expiresIn: '-1s' }
            );

            const res = await fetch(`${baseUrl}/api/devices`, {
                headers: { 'Authorization': `Bearer ${expiredToken}` }
            });
            assert.equal(res.status, 401);
            const data = await res.json();
            assert.ok(data.error.includes('doldu') || data.error.includes('süresi'));
        });

        it('should reject token with token_version mismatch against DB', async () => {
            const oldToken = signAccessToken(
                { id: 1, username: 'admin', role: 'admin', token_version: 1 },
                { expiresIn: '15m' }
            );

            // Increment DB token_version to 2
            testUsers[0].token_version = 2;

            const res = await fetch(`${baseUrl}/api/devices`, {
                headers: { 'Authorization': `Bearer ${oldToken}` }
            });
            assert.equal(res.status, 401);
        });

        it('should keep old token invalid after authentication cache clear / server restart simulation', async () => {
            const oldToken = signAccessToken(
                { id: 1, username: 'admin', role: 'admin', token_version: 1 },
                { expiresIn: '15m' }
            );

            // User changes password in DB -> token_version becomes 2
            testUsers[0].token_version = 2;

            // Simulate process restart or cache reset
            clearSessionCache();

            // Reuse old token -> must still query DB and return 401!
            const res = await fetch(`${baseUrl}/api/devices`, {
                headers: { 'Authorization': `Bearer ${oldToken}` }
            });
            assert.equal(res.status, 401);
        });

        it('should reject access token for deleted user even if JWT is valid', async () => {
            const userToken = signAccessToken(
                { id: 1, username: 'admin', role: 'admin', token_version: 1 },
                { expiresIn: '15m' }
            );

            // Delete user from DB
            testUsers = [];
            clearSessionCache();

            const res = await fetch(`${baseUrl}/api/devices`, {
                headers: { 'Authorization': `Bearer ${userToken}` }
            });
            assert.equal(res.status, 401);
        });

        it('should reject token when user role has been changed in DB', async () => {
            const adminToken = signAccessToken(
                { id: 1, username: 'admin', role: 'admin', token_version: 1 },
                { expiresIn: '15m' }
            );

            // Role changed to viewer in DB
            testUsers[0].role = 'viewer';
            clearSessionCache();

            const res = await fetch(`${baseUrl}/api/devices`, {
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });
            assert.equal(res.status, 401);
        });

        it('Socket.IO auth shared validation rejects old token version', async () => {
            const oldToken = signAccessToken(
                { id: 1, username: 'admin', role: 'admin', token_version: 1 },
                { expiresIn: '15m' }
            );

            testUsers[0].token_version = 2;
            clearSessionCache();

            await assert.rejects(async () => {
                await verifyAccessToken(oldToken);
            }, { status: 401 });
        });
    });

    describe('3. Heartbeat & Network Status Separation', () => {
        it('should reject heartbeat with oversized or invalid optional string fields', async () => {
            const oversizedOs = 'A'.repeat(105);
            const res = await fetch(`${baseUrl}/api/heartbeat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Agent-Key': 'agk_devA.secret-device-a-12345'
                },
                body: JSON.stringify({
                    hostname: 'host-1',
                    ip_address: '10.0.80.50',
                    os_name: oversizedOs
                })
            });
            assert.equal(res.status, 400);
        });

        it('heartbeat changes agent_status to online but leaves network status offline and does NOT emit device:statusChanged', async () => {
            // Initial state: device 1 has status=offline, agent_status=offline
            assert.equal(testDevices[0].status, 'offline');
            assert.equal(testDevices[0].agent_status, 'offline');

            const res = await fetch(`${baseUrl}/api/heartbeat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Agent-Key': 'agk_devA.secret-device-a-12345'
                },
                body: JSON.stringify({
                    hostname: 'workstation-a',
                    ip_address: '10.0.80.50',
                    os_name: 'Windows 11',
                    cpu_usage: 25,
                    ram_usage: 40
                })
            });

            assert.equal(res.status, 200);

            // Database state verification
            assert.equal(testDevices[0].status, 'offline', 'Network status MUST remain offline');
            assert.equal(testDevices[0].agent_status, 'online', 'Agent status MUST become online');

            // Socket.IO event assertions
            const agentStatusEvent = emittedEvents.find(e => e.event === 'agent:statusChanged');
            assert.ok(agentStatusEvent, 'agent:statusChanged MUST be emitted');
            assert.equal(agentStatusEvent.data.newStatus, 'online');

            const deviceStatusEvent = emittedEvents.find(e => e.event === 'device:statusChanged');
            assert.equal(deviceStatusEvent, undefined, 'device:statusChanged MUST NOT be emitted by heartbeat');
        });
    });

    describe('4. Per-Device Agent Credential Impersonation Protections', () => {
        it('Device A key -> Device A telemetry -> accepted', async () => {
            const res = await fetch(`${baseUrl}/api/heartbeat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Agent-Key': 'agk_devA.secret-device-a-12345'
                },
                body: JSON.stringify({
                    hostname: 'workstation-a',
                    ip_address: '10.0.80.50'
                })
            });
            assert.equal(res.status, 200);
        });

        it('Device A key -> Device B telemetry -> 403 Forbidden', async () => {
            const res = await fetch(`${baseUrl}/api/heartbeat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Agent-Key': 'agk_devA.secret-device-a-12345'
                },
                body: JSON.stringify({
                    hostname: 'workstation-b',
                    ip_address: '10.0.80.51' // Belongs to Device B
                })
            });
            assert.equal(res.status, 403);
        });

        it('Device A key -> unknown IP -> 403 Forbidden (prevents silent device creation)', async () => {
            const res = await fetch(`${baseUrl}/api/heartbeat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Agent-Key': 'agk_devA.secret-device-a-12345'
                },
                body: JSON.stringify({
                    hostname: 'unknown-device',
                    ip_address: '10.0.80.99' // Unknown IP not matching Device A
                })
            });
            assert.equal(res.status, 403);
        });

        it('revoked agent key is rejected with 401', async () => {
            const res = await fetch(`${baseUrl}/api/heartbeat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Agent-Key': 'agk_revoked.anysecret'
                },
                body: JSON.stringify({
                    hostname: 'workstation-b',
                    ip_address: '10.0.80.51'
                })
            });
            assert.equal(res.status, 401);
        });

        it('malformed agent key is rejected with 401', async () => {
            const res = await fetch(`${baseUrl}/api/heartbeat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Agent-Key': 'agk_malformed_no_dot_or_secret'
                },
                body: JSON.stringify({
                    hostname: 'workstation-a',
                    ip_address: '10.0.80.50'
                })
            });
            assert.equal(res.status, 401);
        });
    });

    describe('5. Software Inventory Batching', () => {
        it('accepts 500+ software items cleanly under the 2000 limit', async () => {
            const softwareList = [];
            for (let i = 1; i <= 600; i++) {
                softwareList.push({ name: `App_${i}`, version: `1.${i}.0` });
            }

            const res = await fetch(`${baseUrl}/api/software`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Agent-Key': 'agk_devA.secret-device-a-12345'
                },
                body: JSON.stringify({
                    device_ip: '10.0.80.50',
                    software: softwareList
                })
            });

            assert.equal(res.status, 200);
            const data = await res.json();
            assert.equal(data.count, 600);
        });
    });

    describe('6. Printer Scan Conflict', () => {
        it('returns 409 Conflict when printer scan is already running', async () => {
            const adminToken = signAccessToken(
                { id: 1, username: 'admin', role: 'admin', token_version: 1 },
                { expiresIn: '15m' }
            );

            // Mock monitor service with isScanning = true
            app.set('printerMonitorService', {
                isScanning: true,
                scanAllPrinters: () => {}
            });

            const res = await fetch(`${baseUrl}/api/printers/scan`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${adminToken}`,
                    'Content-Type': 'application/json'
                }
            });

            assert.equal(res.status, 409);
        });
    });

    describe('7. IPAM CIDR Implementation', () => {
        it('correctly calculates /24 CIDR', () => {
            const info = parseCidr('192.168.1.0/24');
            assert.equal(info.usableHosts, 254);
            assert.equal(info.firstUsableIp, '192.168.1.1');
            assert.equal(info.lastUsableIp, '192.168.1.254');
        });

        it('correctly calculates /23 CIDR spanning both third octets', () => {
            const info = parseCidr('10.0.80.0/23');
            assert.equal(info.usableHosts, 510);
            assert.equal(info.firstUsableIp, '10.0.80.1');
            assert.equal(info.lastUsableIp, '10.0.81.254');
        });

        it('correctly calculates /30, /31, /32 CIDRs', () => {
            const p30 = parseCidr('192.168.1.0/30');
            assert.equal(p30.usableHosts, 2);
            assert.equal(p30.firstUsableIp, '192.168.1.1');
            assert.equal(p30.lastUsableIp, '192.168.1.2');

            const p31 = parseCidr('192.168.1.0/31');
            assert.equal(p31.usableHosts, 2); // RFC 3021
            assert.equal(p31.firstUsableIp, '192.168.1.0');
            assert.equal(p31.lastUsableIp, '192.168.1.1');

            const p32 = parseCidr('192.168.1.5/32');
            assert.equal(p32.usableHosts, 1);
            assert.equal(p32.firstUsableIp, '192.168.1.5');
            assert.equal(p32.lastUsableIp, '192.168.1.5');
        });

        it('/suggest accepts real /23 CIDR and returns host in second block when first block full', async () => {
            const adminToken = signAccessToken(
                { id: 1, username: 'admin', role: 'admin', token_version: 1 },
                { expiresIn: '15m' }
            );

            // Populate all 10.0.80.1 through 10.0.80.255 as occupied
            testDevices = [];
            for (let i = 1; i <= 255; i++) {
                testDevices.push({ ip_address: `10.0.80.${i}`, status: 'online' });
            }

            const res = await fetch(`${baseUrl}/api/ipam/suggest?subnet=10.0.80.0/23`, {
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });

            assert.equal(res.status, 200);
            const data = await res.json();
            // Must suggest next host in 10.0.81.x block!
            assert.equal(data.suggestedIp, '10.0.81.0');
        });

        it('/suggest returns 400 for invalid CIDR and IPv6', async () => {
            const adminToken = signAccessToken(
                { id: 1, username: 'admin', role: 'admin', token_version: 1 },
                { expiresIn: '15m' }
            );

            const resInvalid = await fetch(`${baseUrl}/api/ipam/suggest?subnet=not-a-cidr`, {
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });
            assert.equal(resInvalid.status, 400);

            const resIpv6 = await fetch(`${baseUrl}/api/ipam/suggest?subnet=2001:db8::1`, {
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });
            assert.equal(resIpv6.status, 400);
            const dataIpv6 = await resIpv6.json();
            assert.equal(dataIpv6.supported, false);
        });
    });
});
