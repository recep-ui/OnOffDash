const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

process.env.JWT_SECRET = 'this-is-a-test-jwt-secret-key-at-least-32-chars-long';
process.env.NODE_ENV = 'test';

const { signAccessToken, verifyAccessToken, getPublicKey, isAsymmetric } = require('../middleware/auth');
const authRouter = require('../routes/auth');

describe('Refresh Token Rotation & Introspection Hardening', () => {
    describe('1. Cookie-only Refresh Token Contract', () => {
        it('should strictly reject refresh requests where token is only provided in body', async () => {
            // Find router layer for POST /refresh
            const refreshRoute = authRouter.stack.find(s => s.route && s.route.path === '/refresh' && s.route.methods.post);
            assert.ok(refreshRoute, 'POST /refresh route must exist');

            const req = {
                cookies: {}, // No cookie!
                body: { refreshToken: 'malicious-injected-body-token' }
            };
            let statusCode = null;
            let responseData = null;
            const res = {
                status: (code) => {
                    statusCode = code;
                    return {
                        json: (data) => { responseData = data; }
                    };
                },
                clearCookie: () => {}
            };

            // Call handler
            const handler = refreshRoute.route.stack[0].handle;
            await handler(req, res);

            assert.strictEqual(statusCode, 401);
            assert.strictEqual(responseData.code, 'NO_REFRESH_TOKEN');
        });

        it('should reject refresh requests when cookies are undefined', async () => {
            const refreshRoute = authRouter.stack.find(s => s.route && s.route.path === '/refresh' && s.route.methods.post);
            const req = {
                body: {}
            };
            let statusCode = null;
            let responseData = null;
            const res = {
                status: (code) => {
                    statusCode = code;
                    return {
                        json: (data) => { responseData = data; }
                    };
                },
                clearCookie: () => {}
            };

            const handler = refreshRoute.route.stack[0].handle;
            await handler(req, res);

            assert.strictEqual(statusCode, 401);
            assert.strictEqual(responseData.code, 'NO_REFRESH_TOKEN');
        });
    });

    describe('2. Token Introspection Endpoint', () => {
        const validInternalKey = 'ci-test-introspection-secret-key-min-32-chars';

        it('should reject introspection when X-Internal-Service-Key is missing or wrong', async () => {
            const introspectRoute = authRouter.stack.find(s => s.route && s.route.path === '/introspect' && s.route.methods.post);
            assert.ok(introspectRoute, 'POST /introspect route must exist');

            const token = signAccessToken({ id: 99, username: 'testuser', role: 'admin', token_version: 1 });
            const reqMissing = {
                headers: {},
                body: { token }
            };
            let statusCode = 200;
            let responseData = null;
            const res = {
                status: (code) => {
                    statusCode = code;
                    return { json: (data) => { responseData = data; } };
                },
                json: (data) => { responseData = data; }
            };

            const handler = introspectRoute.route.stack[0].handle;
            await handler(reqMissing, res);
            assert.strictEqual(statusCode, 401);
            assert.strictEqual(responseData.active, false);

            const reqWrong = {
                headers: { 'x-internal-service-key': 'wrong-secret-key-that-does-not-match' },
                body: { token }
            };
            await handler(reqWrong, res);
            assert.strictEqual(statusCode, 401);
            assert.strictEqual(responseData.active, false);
        });

        it('should return valid=true for active token with token_version', async () => {
            const introspectRoute = authRouter.stack.find(s => s.route && s.route.path === '/introspect' && s.route.methods.post);
            assert.ok(introspectRoute, 'POST /introspect route must exist');

            const token = signAccessToken({ id: 99, username: 'testuser', role: 'admin', token_version: 1 });
            const req = {
                headers: { 'x-internal-service-key': validInternalKey },
                body: { token }
            };
            let statusCode = 200;
            let responseData = null;
            const res = {
                status: (code) => {
                    statusCode = code;
                    return { json: (data) => { responseData = data; } };
                },
                json: (data) => { responseData = data; }
            };

            const handler = introspectRoute.route.stack[0].handle;
            await handler(req, res);

            assert.strictEqual(statusCode, 200);
            assert.strictEqual(responseData.active, true);
            assert.strictEqual(responseData.sub, 99);
            assert.strictEqual(responseData.role, 'admin');
        });

        it('should return active=false when token has expired or is invalid', async () => {
            const introspectRoute = authRouter.stack.find(s => s.route && s.route.path === '/introspect' && s.route.methods.post);

            const req = {
                headers: { 'x-internal-service-key': validInternalKey },
                body: { token: 'invalid.jwt.token' }
            };
            let statusCode = 200;
            let responseData = null;
            const res = {
                status: (code) => {
                    statusCode = code;
                    return { json: (data) => { responseData = data; } };
                },
                json: (data) => { responseData = data; }
            };

            const handler = introspectRoute.route.stack[0].handle;
            await handler(req, res);

            assert.strictEqual(statusCode, 200);
            assert.strictEqual(responseData.active, false);
            assert.ok(responseData.error);
        });

        it('should return active=false when token is missing token_version claim', async () => {
            const introspectRoute = authRouter.stack.find(s => s.route && s.route.path === '/introspect' && s.route.methods.post);

            // Sign a token without token_version using standard jwt
            const token = jwt.sign(
                { id: 99, username: 'legacy_user', role: 'viewer' }, 
                process.env.JWT_SECRET,
                { issuer: 'onoffdash-auth', audience: 'onoffdash' }
            );
            const req = {
                headers: { 'x-internal-service-key': validInternalKey },
                body: { token }
            };
            let statusCode = 200;
            let responseData = null;
            const res = {
                status: (code) => {
                    statusCode = code;
                    return { json: (data) => { responseData = data; } };
                },
                json: (data) => { responseData = data; }
            };

            const handler = introspectRoute.route.stack[0].handle;
            await handler(req, res);

            assert.strictEqual(statusCode, 200);
            assert.strictEqual(responseData.active, false);
        });
    });

    describe('3. Public Key Endpoint for Microservices', () => {
        it('should handle public key request depending on symmetric/asymmetric mode', async () => {
            const pkRoute = authRouter.stack.find(s => s.route && s.route.path === '/public-key' && s.route.methods.get);
            assert.ok(pkRoute, 'GET /public-key route must exist');

            const req = {};
            let statusCode = 200;
            let sentData = null;
            const res = {
                status: (code) => { statusCode = code; return res; },
                type: () => res,
                send: (data) => { sentData = data; },
                json: (data) => { sentData = data; }
            };

            const handler = pkRoute.route.stack[0].handle;
            await handler(req, res);

            if (isAsymmetric()) {
                assert.strictEqual(statusCode, 200);
                assert.ok(typeof sentData === 'string' && sentData.includes('PUBLIC KEY'));
            } else {
                assert.strictEqual(statusCode, 404);
            }
        });
    });
});
