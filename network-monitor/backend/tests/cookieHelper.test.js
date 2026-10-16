const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { setRefreshTokenCookie, clearRefreshTokenCookie } = require('../utils/cookieHelper');
const { validateConfig } = require('../utils/configValidator');

describe('Refresh cookie transport policy', () => {
    let savedEnv;
    beforeEach(() => {
        savedEnv = { NODE_ENV: process.env.NODE_ENV, COOKIE_SECURE: process.env.COOKIE_SECURE };
    });
    afterEach(() => {
        for (const [key, value] of Object.entries(savedEnv)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    });

    for (const { mode, setting, secure } of [
        { mode: 'production', setting: 'false', secure: false },
        { mode: 'production', setting: 'true', secure: true },
        { mode: 'production', setting: undefined, secure: true },
        { mode: 'development', setting: undefined, secure: false },
        { mode: 'development', setting: 'true', secure: true }
    ]) {
        it(`uses Secure=${secure} for set and clear with NODE_ENV=${mode}, COOKIE_SECURE=${setting}`, () => {
            process.env.NODE_ENV = mode;
            if (setting === undefined) delete process.env.COOKIE_SECURE;
            else process.env.COOKIE_SECURE = setting;

            let header;
            const res = { setHeader: (name, value) => { header = value; } };
            setRefreshTokenCookie(res, 'test-refresh-token');
            assert.equal(header.split('; ').includes('Secure'), secure);
            assert.ok(header.includes('Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age=604800'));

            clearRefreshTokenCookie(res);
            assert.equal(header.split('; ').includes('Secure'), secure);
            assert.ok(header.startsWith('refreshToken=;'));
            assert.ok(header.includes('Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age=0'));
        });
    }

    it('rejects a misspelled COOKIE_SECURE setting at production startup', () => {
        process.env.NODE_ENV = 'production';
        process.env.COOKIE_SECURE = 'flase';
        assert.throws(() => validateConfig({ exitOnError: false }), /COOKIE_SECURE must be true or false/);
    });
});
