const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeCellValue, sanitizeRow, sanitizeRows } = require('../utils/excelSanitizer');

describe('Excel Sanitizer (CWE-1236 Formula Injection Prevention)', () => {
    it('should prepend single quote to formula trigger characters', () => {
        assert.strictEqual(sanitizeCellValue('=1+1'), "'=1+1");
        assert.strictEqual(sanitizeCellValue('+cmd|/c calc'), "'+cmd|/c calc");
        assert.strictEqual(sanitizeCellValue('-123'), "'-123");
        assert.strictEqual(sanitizeCellValue('@SUM(A1:A10)'), "'@SUM(A1:A10)");
        assert.strictEqual(sanitizeCellValue('\tTAB_PREFIX'), "'\tTAB_PREFIX");
    });

    it('should leave safe values unchanged', () => {
        assert.strictEqual(sanitizeCellValue('Regular text'), 'Regular text');
        assert.strictEqual(sanitizeCellValue('192.168.1.1'), '192.168.1.1');
        assert.strictEqual(sanitizeCellValue(42), 42);
        assert.strictEqual(sanitizeCellValue(null), '');
        assert.strictEqual(sanitizeCellValue(undefined), '');
    });

    it('should sanitize entire rows', () => {
        const row = {
            hostname: '=SUM(1,2)',
            ip: '10.0.0.1',
            notes: '+MALICIOUS_DDE'
        };
        const clean = sanitizeRow(row);

        assert.strictEqual(clean.hostname, "'=SUM(1,2)");
        assert.strictEqual(clean.ip, '10.0.0.1');
        assert.strictEqual(clean.notes, "'+MALICIOUS_DDE");
    });

    it('should sanitize array of rows', () => {
        const rows = [
            { a: '=A1', b: 'safe' },
            { a: 'normal', b: '@EXEC' }
        ];
        const cleanRows = sanitizeRows(rows);

        assert.strictEqual(cleanRows[0].a, "'=A1");
        assert.strictEqual(cleanRows[0].b, 'safe');
        assert.strictEqual(cleanRows[1].a, 'normal');
        assert.strictEqual(cleanRows[1].b, "'@EXEC");
    });
});
