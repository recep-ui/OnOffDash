const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { 
    isValidIPv4, 
    isValidIPv6, 
    isValidIP, 
    isValidMAC, 
    isValidHostname, 
    isValidPort, 
    sanitizePagination 
} = require('../utils/validators');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'this-is-a-test-jwt-secret-key-at-least-32-chars-long';
process.env.AGENT_API_KEY = process.env.AGENT_API_KEY || 'this-is-a-test-agent-key-at-least-32-chars-long';

const { authenticateToken } = require('../middleware/auth');
const { validateConfig } = require('../utils/configValidator');

describe('Integration & Security Infrastructure Tests', () => {
    describe('Input Validators', () => {
        it('should correctly validate IPv4 and IPv6 addresses', () => {
            assert.strictEqual(isValidIPv4('192.168.1.1'), true);
            assert.strictEqual(isValidIPv4('10.0.0.254'), true);
            assert.strictEqual(isValidIPv4('256.0.0.1'), false);
            assert.strictEqual(isValidIPv4('192.168.1'), false);
            assert.strictEqual(isValidIPv4('192.168.1.1; DROP TABLE'), false);

            assert.strictEqual(isValidIPv6('::1'), true);
            assert.strictEqual(isValidIPv6('2001:0db8:85a3:0000:0000:8a2e:0370:7334'), true);
            assert.strictEqual(isValidIPv6('invalid:ipv6:address'), false);

            assert.strictEqual(isValidIP('192.168.1.50'), true);
            assert.strictEqual(isValidIP('::1'), true);
            assert.strictEqual(isValidIP('not-an-ip'), false);
        });

        it('should correctly validate MAC addresses', () => {
            assert.strictEqual(isValidMAC('00:1A:2B:3C:4D:5E'), true);
            assert.strictEqual(isValidMAC('00-1A-2B-3C-4D-5E'), true);
            assert.strictEqual(isValidMAC('00:1a:2b:3c:4d:5e'), true);
            assert.strictEqual(isValidMAC('00:1A:2B:3C:4D'), false);
            assert.strictEqual(isValidMAC('00:1A:2B:3C:4D:5E:6F'), false);
            assert.strictEqual(isValidMAC('invalid-mac-address'), false);
        });

        it('should correctly validate hostnames and domain names', () => {
            assert.strictEqual(isValidHostname('server-01'), true);
            assert.strictEqual(isValidHostname('node.lan'), true);
            assert.strictEqual(isValidHostname('dc1.company.local'), true);
            assert.strictEqual(isValidHostname(''), false);
            assert.strictEqual(isValidHostname('-bad-host'), false);
            assert.strictEqual(isValidHostname('host name with space'), false);
            assert.strictEqual(isValidHostname('host<script>'), false);
        });

        it('should correctly validate network ports', () => {
            assert.strictEqual(isValidPort(80), true);
            assert.strictEqual(isValidPort(443), true);
            assert.strictEqual(isValidPort(65535), true);
            assert.strictEqual(isValidPort(0), false);
            assert.strictEqual(isValidPort(65536), false);
            assert.strictEqual(isValidPort(-1), false);
            assert.strictEqual(isValidPort('not-a-number'), false);
        });

        it('should sanitize pagination and clamp upper limit bounds to prevent DoS', () => {
            const normal = sanitizePagination({ page: '2', limit: '25' });
            assert.strictEqual(normal.page, 2);
            assert.strictEqual(normal.limit, 25);
            assert.strictEqual(normal.offset, 25);

            // Default fallback
            const empty = sanitizePagination({});
            assert.strictEqual(empty.page, 1);
            assert.strictEqual(empty.limit, 50);
            assert.strictEqual(empty.offset, 0);

            // DoS protection: Unbounded limit clamp
            const excessive = sanitizePagination({ limit: '999999999' });
            assert.strictEqual(excessive.limit, 500, 'Limit must be clamped to max 500');

            // Negative/zero input protection
            const negative = sanitizePagination({ page: '-5', limit: '0' });
            assert.strictEqual(negative.page, 1);
            assert.strictEqual(negative.limit, 50);
        });
    });

    describe('must_change_password Enforcement', () => {
        function createMockRes() {
            let statusCode = 200;
            let responseData = null;
            return {
                status: (code) => {
                    statusCode = code;
                    return {
                        json: (data) => { responseData = data; }
                    };
                },
                getStatusCode: () => statusCode,
                getData: () => responseData
            };
        }

        it('should block access to general routes with 403 PASSWORD_CHANGE_REQUIRED', () => {
            const activeSecret = process.env.JWT_SECRET;
            const expiredUserToken = jwt.sign(
                { id: 1, username: 'bootstrap_admin', role: 'admin', must_change_password: 1 },
                activeSecret
            );

            const req = {
                headers: { authorization: `Bearer ${expiredUserToken}` },
                originalUrl: '/api/devices',
                query: {}
            };
            const res = createMockRes();
            let nextCalled = false;
            authenticateToken(req, res, () => { nextCalled = true; });

            assert.strictEqual(nextCalled, false, 'Next should not be called');
            assert.strictEqual(res.getStatusCode(), 403, 'Must return HTTP 403');
            assert.strictEqual(res.getData()?.code, 'PASSWORD_CHANGE_REQUIRED');
        });

        it('should permit access to /api/auth/me when must_change_password is true', () => {
            const activeSecret = process.env.JWT_SECRET;
            const expiredUserToken = jwt.sign(
                { id: 1, username: 'bootstrap_admin', role: 'admin', must_change_password: 1 },
                activeSecret
            );

            const req = {
                headers: { authorization: `Bearer ${expiredUserToken}` },
                originalUrl: '/api/auth/me',
                query: {}
            };
            const res = createMockRes();
            let nextCalled = false;
            authenticateToken(req, res, () => { nextCalled = true; });

            assert.strictEqual(nextCalled, true, 'Next should be called for /api/auth/me');
            assert.strictEqual(req.user.must_change_password, 1);
        });

        it('should permit access to /api/auth/change-password when must_change_password is true', () => {
            const activeSecret = process.env.JWT_SECRET;
            const expiredUserToken = jwt.sign(
                { id: 1, username: 'bootstrap_admin', role: 'admin', must_change_password: 1 },
                activeSecret
            );

            const req = {
                headers: { authorization: `Bearer ${expiredUserToken}` },
                originalUrl: '/api/auth/change-password',
                query: {}
            };
            const res = createMockRes();
            let nextCalled = false;
            authenticateToken(req, res, () => { nextCalled = true; });

            assert.strictEqual(nextCalled, true, 'Next should be called for /api/auth/change-password');
        });
    });

    describe('ConfigValidator in Production Mode', () => {
        it('should reject placeholder or short JWT_SECRET in production', () => {
            const originalNodeEnv = process.env.NODE_ENV;
            const originalSecret = process.env.JWT_SECRET;
            const originalAgentKey = process.env.AGENT_API_KEY;
            const originalConsoleError = console.error;
            console.error = () => {};

            try {
                process.env.NODE_ENV = 'production';
                process.env.AGENT_API_KEY = 'valid_production_agent_api_key_123';
                process.env.JWT_SECRET = 'short_secret';

                assert.throws(() => {
                    validateConfig({ exitOnError: false });
                }, /JWT_SECRET must be at least 32 characters/);

                process.env.JWT_SECRET = 'ReplaceWithAStrongSecretKeyForJwtTokens2026';
                assert.throws(() => {
                    validateConfig({ exitOnError: false });
                }, /JWT_SECRET uses an insecure placeholder value/);
            } finally {
                console.error = originalConsoleError;
                if (originalNodeEnv) process.env.NODE_ENV = originalNodeEnv;
                else delete process.env.NODE_ENV;
                if (originalSecret) process.env.JWT_SECRET = originalSecret;
                else delete process.env.JWT_SECRET;
                if (originalAgentKey) process.env.AGENT_API_KEY = originalAgentKey;
                else delete process.env.AGENT_API_KEY;
            }
        });
    });
});
