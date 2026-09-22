const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'this-is-a-test-jwt-secret-key-at-least-32-chars-long';
process.env.AGENT_API_KEY = 'this-is-a-test-agent-key-at-least-32-chars-long';
process.env.NODE_ENV = 'test';

const { authenticateToken, requireRole, ROLE_HIERARCHY } = require('../middleware/auth');
const { authenticateAgent } = require('../middleware/agentAuth');

describe('Authentication & Authorization Middleware', () => {
    describe('ROLE_HIERARCHY', () => {
        it('should correctly prioritize admin > operator > viewer', () => {
            assert.strictEqual(ROLE_HIERARCHY.admin > ROLE_HIERARCHY.operator, true);
            assert.strictEqual(ROLE_HIERARCHY.operator > ROLE_HIERARCHY.viewer, true);
        });
    });

    describe('requireRole middleware', () => {
        it('should allow admin when operator is required', () => {
            let nextCalled = false;
            const middleware = requireRole('operator');
            const req = { user: { role: 'admin' } };
            const res = { status: () => res, json: () => res };
            
            middleware(req, res, () => { nextCalled = true; });
            assert.strictEqual(nextCalled, true);
        });

        it('should allow operator when operator is required', () => {
            let nextCalled = false;
            const middleware = requireRole('operator');
            const req = { user: { role: 'operator' } };
            const res = { status: () => res, json: () => res };
            
            middleware(req, res, () => { nextCalled = true; });
            assert.strictEqual(nextCalled, true);
        });

        it('should reject viewer when operator is required', () => {
            let statusCalled = null;
            let jsonMessage = null;
            const middleware = requireRole('operator');
            const req = { user: { role: 'viewer' } };
            const res = {
                status: (code) => { statusCalled = code; return res; },
                json: (obj) => { jsonMessage = obj; return res; }
            };
            
            middleware(req, res, () => {});
            assert.strictEqual(statusCalled, 403);
            assert.strictEqual(typeof jsonMessage.error, 'string');
        });

        it('should reject non-admin when admin is required', () => {
            let statusCalled = null;
            const middleware = requireRole('admin');
            const req = { user: { role: 'operator' } };
            const res = {
                status: (code) => { statusCalled = code; return res; },
                json: () => res
            };
            
            middleware(req, res, () => {});
            assert.strictEqual(statusCalled, 403);
        });
    });

    describe('authenticateToken middleware', () => {
        it('should reject request without Bearer token', () => {
            let statusCode = null;
            const req = { headers: {} };
            const res = {
                status: (code) => { statusCode = code; return res; },
                json: () => res
            };

            authenticateToken(req, res, () => {});
            assert.strictEqual(statusCode, 401);
        });

        it('should authenticate valid Bearer token and attach user', () => {
            const validToken = jwt.sign({ id: 1, username: 'testuser', role: 'operator' }, process.env.JWT_SECRET);
            const req = { headers: { authorization: `Bearer ${validToken}` } };
            const res = { status: () => res, json: () => res };
            let nextCalled = false;

            authenticateToken(req, res, () => { nextCalled = true; });
            assert.strictEqual(nextCalled, true);
            assert.strictEqual(req.user.username, 'testuser');
            assert.strictEqual(req.user.role, 'operator');
        });

        it('should reject token from query string to prevent leakage in URLs', () => {
            const validToken = jwt.sign({ id: 1, username: 'testuser', role: 'admin' }, process.env.JWT_SECRET);
            const req = {
                headers: {},
                query: { token: validToken }
            };
            let statusCode = null;
            const res = {
                status: (code) => { statusCode = code; return res; },
                json: () => res
            };

            authenticateToken(req, res, () => {});
            assert.strictEqual(statusCode, 401);
        });
    });

    describe('authenticateAgent middleware', () => {
        it('should reject agent request without X-Agent-Key header', () => {
            let statusCode = null;
            const req = { headers: {} };
            const res = {
                status: (code) => { statusCode = code; return res; },
                json: () => res
            };

            authenticateAgent(req, res, () => {});
            assert.strictEqual(statusCode, 401);
        });

        it('should reject agent request with wrong key', () => {
            let statusCode = null;
            const req = { headers: { 'x-agent-key': 'wrong-key-that-does-not-match' } };
            const res = {
                status: (code) => { statusCode = code; return res; },
                json: () => res
            };

            authenticateAgent(req, res, () => {});
            assert.strictEqual(statusCode, 401);
        });

        it('should accept agent request with matching X-Agent-Key when legacy auth is allowed', () => {
            process.env.ALLOW_LEGACY_AGENT_AUTH = 'true';
            let nextCalled = false;
            const req = { headers: { 'x-agent-key': process.env.AGENT_API_KEY } };
            const res = { setHeader: () => {}, status: () => res, json: () => res };

            authenticateAgent(req, res, () => { nextCalled = true; });
            assert.strictEqual(nextCalled, true);
            delete process.env.ALLOW_LEGACY_AGENT_AUTH;
        });
    });
});
