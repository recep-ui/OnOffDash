const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('Query Conversion & Parameter Redaction', () => {
    it('should correctly convert $1, $2 parameter placeholders to MSSQL @p1, @p2', () => {
        const pgText = 'SELECT * FROM devices WHERE hostname = $1 AND ip_address = $2';
        const mssqlText = pgText.replace(/\$(\d+)/g, '@p$1');
        assert.strictEqual(mssqlText, 'SELECT * FROM devices WHERE hostname = @p1 AND ip_address = @p2');
    });

    it('should handle multiple digit placeholders like $10, $11', () => {
        const pgText = 'INSERT INTO table VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)';
        const mssqlText = pgText.replace(/\$(\d+)/g, '@p$1');
        assert.strictEqual(mssqlText, 'INSERT INTO table VALUES (@p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9, @p10, @p11)');
    });

    it('should mask password parameters when logging query errors', () => {
        function maskParams(query, params) {
            const lower = query.toLowerCase();
            if (lower.includes('password') || lower.includes('token') || lower.includes('secret')) {
                return params.map(p => typeof p === 'string' ? '***REDACTED***' : p);
            }
            return params;
        }

        const query = 'UPDATE users SET password_hash = $1 WHERE username = $2';
        const params = ['super-secret-password-or-hash', 'admin'];
        const masked = maskParams(query, params);

        assert.strictEqual(masked[0], '***REDACTED***');
        assert.strictEqual(masked[1], '***REDACTED***');
    });
});
