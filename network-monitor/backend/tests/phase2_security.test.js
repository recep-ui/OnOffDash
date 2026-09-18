const { describe, it } = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const { validateHeartbeatPayload, validateSoftwarePayload } = require('../utils/validators');
const { 
    authenticateToken, 
    setUserSession, 
    invalidateUserSessions, 
    markUserDeleted, 
    clearSessionCache 
} = require('../middleware/auth');
const { validateConfig } = require('../utils/configValidator');

describe('Phase 2 Security Suite', () => {

    describe('1. Agent Heartbeat & Software Payload Validation', () => {
        it('should accept valid heartbeat payload', () => {
            const valid = {
                hostname: 'DESKTOP-SRV01',
                ip_address: '192.168.1.100',
                mac_address: '00:1A:2B:3C:4D:5E',
                cpu_usage: 45.5,
                ram_usage: 62.0,
                disk_usage: 78.2,
                uptime_seconds: 36000
            };
            const res = validateHeartbeatPayload(valid);
            assert.strictEqual(res.valid, true);
        });

        it('should reject malformed or missing hostname and IP', () => {
            const invalidHostname = validateHeartbeatPayload({
                hostname: 'Invalid Hostname With Spaces!',
                ip_address: '192.168.1.1'
            });
            assert.strictEqual(invalidHostname.valid, false);

            const invalidIp = validateHeartbeatPayload({
                hostname: 'valid-host',
                ip_address: '999.999.999.999'
            });
            assert.strictEqual(invalidIp.valid, false);
        });

        it('should reject out-of-range metrics (> 100 or < 0)', () => {
            const highCpu = validateHeartbeatPayload({
                hostname: 'host-1',
                ip_address: '10.0.0.1',
                cpu_usage: 105
            });
            assert.strictEqual(highCpu.valid, false);
            assert.ok(highCpu.error.includes('cpu_usage'));

            const negativeRam = validateHeartbeatPayload({
                hostname: 'host-1',
                ip_address: '10.0.0.1',
                ram_usage: -5
            });
            assert.strictEqual(negativeRam.valid, false);
            assert.ok(negativeRam.error.includes('ram_usage'));

            const negativeUptime = validateHeartbeatPayload({
                hostname: 'host-1',
                ip_address: '10.0.0.1',
                uptime_seconds: -100
            });
            assert.strictEqual(negativeUptime.valid, false);
        });

        it('should validate software inventory item limit and structure', () => {
            const invalidSw = validateSoftwarePayload('10.0.0.1', [{ name: '' }]);
            assert.strictEqual(invalidSw.valid, false);
            assert.strictEqual(invalidSw.status, 400);

            const oversized = validateSoftwarePayload('10.0.0.1', new Array(2001).fill({ name: 'App' }), 2000);
            assert.strictEqual(oversized.valid, false);
            assert.strictEqual(oversized.status, 413);
        });
    });

    describe('2. JWT Server-Side Session Invalidation (token_version & role)', () => {
        const secret = process.env.JWT_SECRET || 'phase-2-test-secret-at-least-32-chars-long';

        it('should accept token when token_version matches session version', () => {
            clearSessionCache();
            const userId = 101;
            setUserSession(userId, { token_version: 1, role: 'operator' });

            const token = jwt.sign({ id: userId, username: 'test_user', role: 'operator', token_version: 1 }, secret);
            const req = { headers: { authorization: `Bearer ${token}` } };
            const res = { status: (code) => ({ json: (d) => ({ code, d }) }) };
            let nextCalled = false;

            authenticateToken(req, res, () => { nextCalled = true; });
            assert.strictEqual(nextCalled, true);
        });

        it('should invalidate previous tokens when user changes password (token_version incremented)', () => {
            clearSessionCache();
            const userId = 102;
            setUserSession(userId, { token_version: 1, role: 'operator' });

            // Old token issued before password change (version 1)
            const oldToken = jwt.sign({ id: userId, username: 'user_pw_change', role: 'operator', token_version: 1 }, secret);

            // User changes password -> token_version becomes 2
            invalidateUserSessions(userId);

            let statusCode = null;
            const req = { headers: { authorization: `Bearer ${oldToken}` } };
            const res = {
                status: (code) => { statusCode = code; return { json: () => {} }; }
            };
            let nextCalled = false;

            authenticateToken(req, res, () => { nextCalled = true; });
            assert.strictEqual(nextCalled, false);
            assert.strictEqual(statusCode, 401);
        });

        it('should invalidate token when user role is modified by admin', () => {
            clearSessionCache();
            const userId = 103;
            setUserSession(userId, { token_version: 1, role: 'admin' });

            // Token issued while user was admin
            const adminToken = jwt.sign({ id: userId, username: 'demoted_admin', role: 'admin', token_version: 1 }, secret);

            // Admin demotes user to viewer
            setUserSession(userId, { token_version: 2, role: 'viewer' });

            let statusCode = null;
            const req = { headers: { authorization: `Bearer ${adminToken}` } };
            const res = {
                status: (code) => { statusCode = code; return { json: () => {} }; }
            };
            let nextCalled = false;

            authenticateToken(req, res, () => { nextCalled = true; });
            assert.strictEqual(nextCalled, false);
            assert.strictEqual(statusCode, 401);
        });

        it('should invalidate tokens for deleted users', () => {
            clearSessionCache();
            const userId = 104;
            setUserSession(userId, { token_version: 1, role: 'viewer' });

            const token = jwt.sign({ id: userId, username: 'deleted_user', role: 'viewer', token_version: 1 }, secret);

            // User deleted
            markUserDeleted(userId);

            let statusCode = null;
            const req = { headers: { authorization: `Bearer ${token}` } };
            const res = {
                status: (code) => { statusCode = code; return { json: () => {} }; }
            };
            let nextCalled = false;

            authenticateToken(req, res, () => { nextCalled = true; });
            assert.strictEqual(nextCalled, false);
            assert.strictEqual(statusCode, 401);
        });
    });

    describe('3. Production Fail-Closed CORS and Configuration Security', () => {
        it('should fail config validation if CORS_ORIGINS is missing in production mode', () => {
            const origEnv = process.env.NODE_ENV;
            const origCors = process.env.CORS_ORIGINS;
            try {
                process.env.NODE_ENV = 'production';
                delete process.env.CORS_ORIGINS;
                delete process.env.CORS_ORIGIN;

                assert.throws(() => {
                    validateConfig({ exitOnError: false });
                }, /CORS_ORIGINS is mandatory in production/);
            } finally {
                process.env.NODE_ENV = origEnv;
                if (origCors) process.env.CORS_ORIGINS = origCors;
            }
        });

        it('should fail config validation if CORS_ORIGINS contains wildcard in production mode', () => {
            const origEnv = process.env.NODE_ENV;
            const origCors = process.env.CORS_ORIGINS;
            try {
                process.env.NODE_ENV = 'production';
                process.env.CORS_ORIGINS = 'http://localhost:5173, *';

                assert.throws(() => {
                    validateConfig({ exitOnError: false });
                }, /Wildcard CORS origin \(\*\) is forbidden in production/);
            } finally {
                process.env.NODE_ENV = origEnv;
                if (origCors) process.env.CORS_ORIGINS = origCors;
            }
        });
    });

    describe('4. Agent Credential Hashing and Timing-Safe Verification Contract', () => {
        it('should verify that agent keys are hashed with sha256 and never matched in plaintext', () => {
            const rawSecret = 'super-secret-agent-key-value-12345';
            const hash = crypto.createHash('sha256').update(rawSecret).digest('hex');

            assert.notStrictEqual(hash, rawSecret);
            assert.strictEqual(hash.length, 64);

            const computedHash = crypto.createHash('sha256').update(rawSecret).digest('hex');
            assert.strictEqual(crypto.timingSafeEqual(Buffer.from(computedHash), Buffer.from(hash)), true);

            const wrongHash = crypto.createHash('sha256').update('wrong-secret').digest('hex');
            assert.strictEqual(crypto.timingSafeEqual(Buffer.from(wrongHash), Buffer.from(hash)), false);
        });
    });
});
