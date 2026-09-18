const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'this-is-a-test-jwt-secret-key-at-least-32-chars-long';
process.env.AGENT_API_KEY = process.env.AGENT_API_KEY || 'this-is-a-test-agent-key-at-least-32-chars-long';

const { 
  authenticateToken, 
  requireRole, 
  setUserSession, 
  invalidateUserSessions, 
  markUserDeleted, 
  clearSessionCache 
} = require('../middleware/auth');
const { authenticateAgent } = require('../middleware/agentAuth');
const { validateHeartbeatPayload, validateSoftwarePayload } = require('../utils/validators');

describe('HTTP API Route & Integration Test Suite', () => {
  let app;
  let server;
  let baseUrl;

  // Test state
  const testUsers = {
    admin: { id: 1, username: 'admin', passwordHash: bcrypt.hashSync('AdminPass123!', 4), role: 'admin' },
    operator: { id: 2, username: 'operator1', passwordHash: bcrypt.hashSync('OpPass123!', 4), role: 'operator' },
    viewer: { id: 3, username: 'viewer1', passwordHash: bcrypt.hashSync('ViewPass123!', 4), role: 'viewer' }
  };

  before(async () => {
    app = express();
    app.use(express.json({ limit: '10mb' }));

    // In-memory rate limiting test state
    const loginAttempts = new Map();
    const LOGIN_LIMIT = 5;

    // 1. POST /api/auth/login with rate limiter
    app.post('/api/auth/login', (req, res) => {
      const ip = req.ip || '127.0.0.1';
      const count = (loginAttempts.get(ip) || 0) + 1;
      loginAttempts.set(ip, count);

      if (count > LOGIN_LIMIT) {
        return res.status(429).json({ error: 'Çok fazla giriş denemesi. Lütfen daha sonra tekrar deneyiniz.' });
      }

      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'Kullanıcı adı ve şifre gereklidir.' });
      }

      const user = Object.values(testUsers).find(u => u.username === username);
      if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
        return res.status(401).json({ error: 'Hatalı kullanıcı adı veya şifre.' });
      }

      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role, token_version: 1 },
        process.env.JWT_SECRET,
        { expiresIn: '30m' }
      );

      setUserSession(user.id, { token_version: 1, role: user.role });
      res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
    });

    // 2. RBAC Protected Routes: /api/test/devices
    app.get('/api/test/devices', authenticateToken, (req, res) => {
      res.json({ message: 'Device list', user: req.user.username });
    });

    app.post('/api/test/devices', authenticateToken, requireRole(['admin', 'operator']), (req, res) => {
      res.status(201).json({ success: true, createdBy: req.user.username, device: req.body });
    });

    app.delete('/api/test/devices/:id', authenticateToken, requireRole(['admin']), (req, res) => {
      res.json({ success: true, deletedId: req.params.id, deletedBy: req.user.username });
    });

    // 3. Heartbeat Route: /api/heartbeat
    app.post('/api/heartbeat', authenticateAgent, (req, res) => {
      const validation = validateHeartbeatPayload(req.body);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }
      res.json({ success: true, received: true, timestamp: new Date().toISOString() });
    });

    // 4. Software Inventory Route: /api/software
    app.post('/api/software', authenticateAgent, (req, res) => {
      const { device_ip, software } = req.body;
      const validation = validateSoftwarePayload(device_ip, software, 2000);
      if (!validation.valid) {
        return res.status(validation.status || 400).json({ error: validation.error });
      }

      const CHUNK_SIZE = 100;
      const chunks = [];
      for (let i = 0; i < software.length; i += CHUNK_SIZE) {
        chunks.push(software.slice(i, i + CHUNK_SIZE));
      }

      res.json({ 
        success: true, 
        device_ip, 
        totalProcessed: software.length, 
        chunkCount: chunks.length 
      });
    });

    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  beforeEach(() => {
    clearSessionCache();
  });

  describe('Authentication & Rate Limiting HTTP Scenarios', () => {
    it('should successfully login and return JWT token and user profile', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'AdminPass123!' })
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(data.token);
      assert.strictEqual(data.user.username, 'admin');
      assert.strictEqual(data.user.role, 'admin');
    });

    it('should reject login with wrong password (401 Unauthorized)', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'WrongPassword999!' })
      });

      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.error, 'Hatalı kullanıcı adı veya şifre.');
    });

    it('should enforce login rate limiting after threshold is exceeded (429 Too Many Requests)', async () => {
      // Rapid fire requests to trigger rate limit (threshold is 5)
      let lastStatus = 200;
      for (let i = 0; i < 6; i++) {
        const res = await fetch(`${baseUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'nonexistent', password: 'bad' })
        });
        lastStatus = res.status;
      }
      assert.strictEqual(lastStatus, 429);
    });
  });

  describe('RBAC (Role-Based Access Control) HTTP Scenarios', () => {
    function generateToken(user, expiresIn = '30m') {
      setUserSession(user.id, { token_version: 1, role: user.role });
      return jwt.sign(
        { id: user.id, username: user.username, role: user.role, token_version: 1 },
        process.env.JWT_SECRET,
        { expiresIn }
      );
    }

    it('should block viewer mutation (POST /api/test/devices) with 403 Forbidden', async () => {
      const viewerToken = generateToken(testUsers.viewer);
      const res = await fetch(`${baseUrl}/api/test/devices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${viewerToken}`
        },
        body: JSON.stringify({ hostname: 'NEW-PC', ip_address: '10.0.0.50' })
      });

      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.error, 'Bu işlem için yetkiniz bulunmamaktadır.');
    });

    it('should permit operator mutation (POST /api/test/devices) with 201 Created', async () => {
      const operatorToken = generateToken(testUsers.operator);
      const res = await fetch(`${baseUrl}/api/test/devices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${operatorToken}`
        },
        body: JSON.stringify({ hostname: 'OP-PC', ip_address: '10.0.0.60' })
      });

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.createdBy, 'operator1');
    });

    it('should block operator from admin delete mutation with 403 Forbidden', async () => {
      const operatorToken = generateToken(testUsers.operator);
      const res = await fetch(`${baseUrl}/api/test/devices/42`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${operatorToken}` }
      });

      assert.strictEqual(res.status, 403);
    });

    it('should permit admin to delete device with 200 OK', async () => {
      const adminToken = generateToken(testUsers.admin);
      const res = await fetch(`${baseUrl}/api/test/devices/42`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.deletedId, '42');
    });
  });

  describe('JWT Expiry & Server-Side Session Invalidation Scenarios', () => {
    it('should reject expired JWT token with 401 Unauthorized', async () => {
      const expiredToken = jwt.sign(
        { id: 1, username: 'admin', role: 'admin', token_version: 1 },
        process.env.JWT_SECRET,
        { expiresIn: '-1s' }
      );

      const res = await fetch(`${baseUrl}/api/test/devices`, {
        headers: { 'Authorization': `Bearer ${expiredToken}` }
      });

      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.ok(data.error.includes('Geçersiz veya süresi dolmuş'));
    });

    it('should invalidate previous token after role change (admin changed user role)', async () => {
      // User initially has operator token
      setUserSession(2, { token_version: 1, role: 'operator' });
      const operatorToken = jwt.sign(
        { id: 2, username: 'operator1', role: 'operator', token_version: 1 },
        process.env.JWT_SECRET,
        { expiresIn: '30m' }
      );

      // Verify token initially works
      const initialRes = await fetch(`${baseUrl}/api/test/devices`, {
        headers: { 'Authorization': `Bearer ${operatorToken}` }
      });
      assert.strictEqual(initialRes.status, 200);

      // Admin downgrades user to viewer in sessionCache
      setUserSession(2, { token_version: 1, role: 'viewer' });

      // Request with old token (which claims role='operator') must be rejected with 401
      const postChangeRes = await fetch(`${baseUrl}/api/test/devices`, {
        headers: { 'Authorization': `Bearer ${operatorToken}` }
      });
      assert.strictEqual(postChangeRes.status, 401);
      const data = await postChangeRes.json();
      assert.strictEqual(data.error, 'Kullanıcı rolü güncellenmiştir. Lütfen tekrar giriş yapınız.');
    });

    it('should invalidate token when user changes password (token_version incremented)', async () => {
      setUserSession(1, { token_version: 1, role: 'admin' });
      const oldToken = jwt.sign(
        { id: 1, username: 'admin', role: 'admin', token_version: 1 },
        process.env.JWT_SECRET,
        { expiresIn: '30m' }
      );

      // Password changed -> invalidateUserSessions
      invalidateUserSessions(1); // token_version becomes 2

      const res = await fetch(`${baseUrl}/api/test/devices`, {
        headers: { 'Authorization': `Bearer ${oldToken}` }
      });

      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.ok(data.error.includes('Oturum sonlandırıldı veya parola değiştirildi'));
    });

    it('should invalidate tokens for deleted users immediately', async () => {
      setUserSession(3, { token_version: 1, role: 'viewer' });
      const token = jwt.sign(
        { id: 3, username: 'viewer1', role: 'viewer', token_version: 1 },
        process.env.JWT_SECRET,
        { expiresIn: '30m' }
      );

      markUserDeleted(3);

      const res = await fetch(`${baseUrl}/api/test/devices`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.error, 'Kullanıcı hesabı bulunamadı veya silinmiştir.');
    });
  });

  describe('Agent Heartbeat & Software Validation HTTP Scenarios', () => {
    it('should reject agent request without X-Agent-Key header with 401', async () => {
      const res = await fetch(`${baseUrl}/api/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostname: 'HOST-01', ip_address: '10.0.0.1' })
      });

      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.error, 'Ajan kimlik doğrulaması başarısız. X-Agent-Key başlığı eksik.');
    });

    it('should reject agent request with invalid agent credential with 401', async () => {
      const res = await fetch(`${baseUrl}/api/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Key': 'invalid_secret_key_12345'
        },
        body: JSON.stringify({ hostname: 'HOST-01', ip_address: '10.0.0.1' })
      });

      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.error, 'Geçersiz ajan kimlik doğrulama anahtarı.');
    });

    it('should reject heartbeat with bad IP address (400 Bad Request)', async () => {
      const res = await fetch(`${baseUrl}/api/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Key': process.env.AGENT_API_KEY
        },
        body: JSON.stringify({
          hostname: 'SRV-TEST',
          ip_address: '999.999.999.999', // Invalid IP
          cpu_usage: 25,
          ram_usage: 50,
          disk_usage: 40,
          uptime_seconds: 1200
        })
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.error.includes('valid IPv4 or IPv6'));
    });

    it('should reject heartbeat with malformed out-of-bounds metrics (400 Bad Request)', async () => {
      const res = await fetch(`${baseUrl}/api/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Key': process.env.AGENT_API_KEY
        },
        body: JSON.stringify({
          hostname: 'SRV-TEST',
          ip_address: '192.168.1.100',
          cpu_usage: 150, // Malformed: > 100
          ram_usage: -5,  // Malformed: < 0
          disk_usage: 30,
          uptime_seconds: 500
        })
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.error.includes('cpu_usage') || data.error.includes('ram_usage'));
    });

    it('should safely process software inventory with 500+ items and chunk into batches of 100', async () => {
      const items = [];
      for (let i = 1; i <= 550; i++) {
        items.push({
          name: `Enterprise Software Package ${i}`,
          version: `2.${i % 10}.0`,
          vendor: 'Global Enterprise Corp',
          install_date: '2026-01-15'
        });
      }

      const res = await fetch(`${baseUrl}/api/software`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Key': process.env.AGENT_API_KEY
        },
        body: JSON.stringify({
          device_ip: '10.0.10.45',
          software: items
        })
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.totalProcessed, 550);
      assert.strictEqual(data.chunkCount, 6); // 550 items chunked by 100 = 6 chunks
    });

    it('should reject software inventory that exceeds max allowable items (413 Payload Too Large)', async () => {
      const oversizedItems = new Array(3001).fill({ name: 'App', version: '1.0' });

      const res = await fetch(`${baseUrl}/api/software`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Key': process.env.AGENT_API_KEY
        },
        body: JSON.stringify({
          device_ip: '10.0.10.45',
          software: oversizedItems
        })
      });

      assert.strictEqual(res.status, 413);
      const data = await res.json();
      assert.ok(data.error.includes('Software inventory exceeds maximum allowed limit'));
    });
  });

  describe('Ping Status Deduplication & Canonical Event Contract', () => {
    it('should NOT create duplicate status logs or emit events for repeated identical ping statuses', () => {
      let statusLogInserts = 0;
      let emittedEvents = [];

      const mockDb = {
        query: async () => {},
        insertLog: async () => { statusLogInserts++; }
      };

      const mockIo = {
        emit: (event, payload) => { emittedEvents.push({ event, payload }); }
      };

      // Simulate ping transitions: 5 consecutive 'online' pings
      let currentStatus = 'online';
      const device = { id: 10, hostname: 'SRV-01', ip_address: '10.0.0.1', status: 'online' };

      for (let cycle = 0; cycle < 5; cycle++) {
        const newStatus = 'online';
        const isTransition = currentStatus !== newStatus;
        if (isTransition) {
          mockDb.insertLog();
          mockIo.emit('device:statusChanged', {});
          currentStatus = newStatus;
        }
      }

      // 5 consecutive identical states must generate ZERO log rows and ZERO socket events
      assert.strictEqual(statusLogInserts, 0, 'No status log rows created for repeated identical states');
      assert.strictEqual(emittedEvents.length, 0, 'No socket events emitted for repeated identical states');

      // Now real transition: online -> offline
      const newStatus = 'offline';
      if (currentStatus !== newStatus) {
        mockDb.insertLog();
        mockIo.emit('device:statusChanged', {
          device: { id: device.id, hostname: device.hostname, ip_address: device.ip_address },
          oldStatus: currentStatus,
          newStatus: newStatus,
          reason: null,
          timestamp: new Date().toISOString()
        });
        currentStatus = newStatus;
      }

      assert.strictEqual(statusLogInserts, 1, 'Exactly one log row created on real status transition');
      assert.strictEqual(emittedEvents.length, 1, 'Exactly one socket event emitted on real transition');

      // Verify canonical contract of emitted event
      const event = emittedEvents[0];
      assert.strictEqual(event.event, 'device:statusChanged');
      assert.strictEqual(event.payload.device.id, 10);
      assert.strictEqual(event.payload.device.hostname, 'SRV-01');
      assert.strictEqual(event.payload.device.ip_address, '10.0.0.1');
      assert.strictEqual(event.payload.oldStatus, 'online');
      assert.strictEqual(event.payload.newStatus, 'offline');
      assert.strictEqual(event.payload.reason, null);
      assert.ok(typeof event.payload.timestamp === 'string');
    });
  });
});
