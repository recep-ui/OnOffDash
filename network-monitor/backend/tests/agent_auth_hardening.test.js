const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

const { authenticateAgent } = require('../middleware/agentAuth');
const { pool } = require('../db/connection');

describe('Agent Authentication Hardening Suite', () => {
    const originalQuery = pool.query;
    const originalAllowLegacy = process.env.ALLOW_LEGACY_AGENT_AUTH;
    const originalServerKey = process.env.AGENT_API_KEY;

    beforeEach(() => {
        pool.query = originalQuery;
        delete process.env.ALLOW_LEGACY_AGENT_AUTH;
        process.env.AGENT_API_KEY = 'test-server-agent-key-min-32-chars-long-12345';
    });

    it('1. should reject legacy shared AGENT_API_KEY when ALLOW_LEGACY_AGENT_AUTH is disabled (default)', async () => {
        const req = {
            headers: {
                'x-agent-key': 'test-server-agent-key-min-32-chars-long-12345'
            }
        };
        let status = null;
        let responseJson = null;
        const res = {
            status: (s) => {
                status = s;
                return {
                    json: (j) => { responseJson = j; }
                };
            }
        };
        let nextCalled = false;

        await authenticateAgent(req, res, () => { nextCalled = true; });

        assert.strictEqual(nextCalled, false);
        assert.strictEqual(status, 401);
        assert.ok(responseJson.error.includes('devre dışı bırakılmıştır'));
    });

    it('2. should allow legacy shared AGENT_API_KEY only when ALLOW_LEGACY_AGENT_AUTH is explicitly true', async () => {
        process.env.ALLOW_LEGACY_AGENT_AUTH = 'true';

        const req = {
            headers: {
                'x-agent-key': 'test-server-agent-key-min-32-chars-long-12345'
            }
        };
        const headers = {};
        const res = {
            setHeader: (k, v) => { headers[k] = v; },
            status: () => ({ json: () => {} })
        };
        let nextCalled = false;

        await authenticateAgent(req, res, () => { nextCalled = true; });

        assert.strictEqual(nextCalled, true);
        assert.strictEqual(req.isAgent, true);
        assert.strictEqual(req.isLegacyAgent, true);
        assert.ok(headers['X-Agent-Auth-Warning'].includes('Deprecated'));
    });

    it('3. should authenticate valid per-device credentials and set authenticatedDeviceId and agentKeyId', async () => {
        const keyId = 'agk_12345678abcdef';
        const secret = 'super-secret-key-for-agent-device-10';
        const secretHash = crypto.createHash('sha256').update(secret).digest('hex');

        pool.query = async (text, params) => {
            if (text.includes('agent_credentials') && text.includes('SELECT')) {
                assert.strictEqual(params[0], keyId);
                return {
                    rows: [{
                        id: 1,
                        device_id: 42,
                        key_id: keyId,
                        key_hash: secretHash,
                        is_revoked: 0
                    }]
                };
            }
            return { rows: [] };
        };

        const req = {
            headers: {
                'x-agent-key': `${keyId}.${secret}`
            }
        };
        const res = { status: () => ({ json: () => {} }) };
        let nextCalled = false;

        await authenticateAgent(req, res, () => { nextCalled = true; });

        assert.strictEqual(nextCalled, true);
        assert.strictEqual(req.isAgent, true);
        assert.strictEqual(req.authenticatedDeviceId, 42);
        assert.strictEqual(req.agentKeyId, keyId);
    });

    it('4. should reject revoked per-device key', async () => {
        const keyId = 'agk_revoked123';
        const secret = 'valid-secret-string';
        const secretHash = crypto.createHash('sha256').update(secret).digest('hex');

        pool.query = async (text) => {
            if (text.includes('agent_credentials') && text.includes('SELECT')) {
                return {
                    rows: [{
                        id: 2,
                        device_id: 42,
                        key_id: keyId,
                        key_hash: secretHash,
                        is_revoked: 1
                    }]
                };
            }
            return { rows: [] };
        };

        const req = {
            headers: {
                'x-agent-key': `${keyId}.${secret}`
            }
        };
        let status = null;
        let responseJson = null;
        const res = {
            status: (s) => {
                status = s;
                return { json: (j) => { responseJson = j; } };
            }
        };
        let nextCalled = false;

        await authenticateAgent(req, res, () => { nextCalled = true; });

        assert.strictEqual(nextCalled, false);
        assert.strictEqual(status, 401);
        assert.ok(responseJson.error.includes('iptal edilmiştir'));
    });

    it('5. should reject malformed per-device credentials', async () => {
        const testCases = [
            'agk_',
            'agk_invalid',
            'agk_no_secret.',
            'agk_key_without_dot_or_secret'
        ];

        for (const badKey of testCases) {
            const req = { headers: { 'x-agent-key': badKey } };
            let status = null;
            const res = {
                status: (s) => {
                    status = s;
                    return { json: () => {} };
                }
            };
            let nextCalled = false;

            await authenticateAgent(req, res, () => { nextCalled = true; });

            assert.strictEqual(nextCalled, false, `Failed on badKey: ${badKey}`);
            assert.strictEqual(status, 401);
        }
    });

    it('6. should reject invalid per-device secret (hash mismatch)', async () => {
        const keyId = 'agk_hashmismatch';
        const realSecret = 'correct-secret-123';
        const realHash = crypto.createHash('sha256').update(realSecret).digest('hex');

        pool.query = async () => ({
            rows: [{
                id: 3,
                device_id: 15,
                key_id: keyId,
                key_hash: realHash,
                is_revoked: 0
            }]
        });

        const req = {
            headers: {
                'x-agent-key': `${keyId}.wrong-attacker-secret`
            }
        };
        let status = null;
        const res = {
            status: (s) => {
                status = s;
                return { json: () => {} };
            }
        };
        let nextCalled = false;

        await authenticateAgent(req, res, () => { nextCalled = true; });

        assert.strictEqual(nextCalled, false);
        assert.strictEqual(status, 401);
    });
});
