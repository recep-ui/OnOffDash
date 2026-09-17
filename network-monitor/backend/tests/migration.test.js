const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { runMigrations, ensureBootstrapAdmin } = require('../db/migrations');

describe('Database Migrations & Bootstrap Admin Decoupling', () => {
    it('should export both runMigrations and ensureBootstrapAdmin as independent functions', () => {
        assert.strictEqual(typeof runMigrations, 'function', 'runMigrations must be a function');
        assert.strictEqual(typeof ensureBootstrapAdmin, 'function', 'ensureBootstrapAdmin must be a function');
    });

    it('ensureBootstrapAdmin should reject bootstrap password shorter than 8 characters', async () => {
        const originalUser = process.env.BOOTSTRAP_ADMIN_USERNAME;
        const originalPass = process.env.BOOTSTRAP_ADMIN_PASSWORD;

        process.env.BOOTSTRAP_ADMIN_USERNAME = 'admin';
        process.env.BOOTSTRAP_ADMIN_PASSWORD = 'short'; // < 8 chars

        let loggedError = '';
        const originalConsoleError = console.error;
        console.error = (...args) => {
            loggedError = args.join(' ');
        };

        // Mock pool to simulate empty users table
        const { pool } = require('../db/connection');
        const originalConnect = pool.connect;
        pool.connect = async () => ({
            query: async () => ({ rows: [{ count: 0 }] }),
            release: () => {}
        });

        try {
            await ensureBootstrapAdmin();
            assert.ok(loggedError.includes('at least 8 characters'), 'Should log warning about password length');
        } finally {
            console.error = originalConsoleError;
            pool.connect = originalConnect;
            if (originalUser) process.env.BOOTSTRAP_ADMIN_USERNAME = originalUser;
            else delete process.env.BOOTSTRAP_ADMIN_USERNAME;
            if (originalPass) process.env.BOOTSTRAP_ADMIN_PASSWORD = originalPass;
            else delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
        }
    });

    it('ensureBootstrapAdmin should do nothing if users already exist', async () => {
        const { pool } = require('../db/connection');
        const originalConnect = pool.connect;
        let queryCount = 0;

        pool.connect = async () => ({
            query: async (text) => {
                queryCount++;
                return { rows: [{ count: 5 }] }; // 5 users already exist
            },
            release: () => {}
        });

        try {
            await ensureBootstrapAdmin();
            // Should have only run the SELECT COUNT query and returned immediately
            assert.strictEqual(queryCount, 1, 'Should only check user count and exit');
        } finally {
            pool.connect = originalConnect;
        }
    });
});
