const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    createExcelSingleSheet,
    readExcelRows,
    createExcelMultiSheetAoa,
    readExcelSheetsAoa
} = require('../utils/excelHelper');

describe('ExcelJS Migration & Safe Processing Suite', () => {
    it('should create and read back a single sheet excel workbook with formula sanitization', async () => {
        const testData = [
            { 'Hostname': 'SRV-TEST-01', 'IP Adresi': '192.168.1.10', 'Formula': '=1+1' },
            { 'Hostname': 'PC-OPERATOR', 'IP Adresi': '192.168.1.25', 'Formula': '@SUM(A1:A10)' }
        ];

        const buffer = await createExcelSingleSheet('Cihaz Envanteri', testData);
        assert.ok(Buffer.isBuffer(buffer), 'Output should be a Buffer');
        assert.ok(buffer.length > 0, 'Buffer should not be empty');

        const rows = await readExcelRows(buffer);
        assert.strictEqual(rows.length, 2, 'Should read exactly 2 rows back');
        assert.strictEqual(rows[0]['Hostname'], 'SRV-TEST-01');
        assert.strictEqual(rows[0]['IP Adresi'], '192.168.1.10');
        // Formula injection mitigation: single quote prepend
        assert.strictEqual(rows[0]['Formula'], "'=1+1");
        assert.strictEqual(rows[1]['Hostname'], 'PC-OPERATOR');
        assert.strictEqual(rows[1]['Formula'], "'@SUM(A1:A10)");
    });

    it('should create and read back multi-sheet workbooks', async () => {
        const sheetsMap = {
            'A Blok': [
                ['DAHİLİ', 'İSİM', 'GÖREV'],
                ['101', 'Ahmet Yılmaz', 'Müdür'],
                ['102', 'Mehmet Demir', 'Mühendis']
            ],
            'B Blok': [
                ['DAHİLİ', 'İSİM', 'GÖREV'],
                ['201', 'Ayşe Kaya', 'Tekniker']
            ]
        };

        const buffer = await createExcelMultiSheetAoa(sheetsMap);
        assert.ok(Buffer.isBuffer(buffer));

        const sheets = await readExcelSheetsAoa(buffer);
        assert.strictEqual(sheets.length, 2);

        const aBlok = sheets.find(s => s.sheetName === 'A Blok');
        assert.ok(aBlok, 'A Blok sheet should exist');
        assert.strictEqual(aBlok.rows.length, 3);
        assert.strictEqual(aBlok.rows[0][0], 'DAHİLİ');
        assert.strictEqual(aBlok.rows[1][0], '101');
        assert.strictEqual(aBlok.rows[1][1], 'Ahmet Yılmaz');

        const bBlok = sheets.find(s => s.sheetName === 'B Blok');
        assert.ok(bBlok, 'B Blok sheet should exist');
        assert.strictEqual(bBlok.rows.length, 2);
        assert.strictEqual(bBlok.rows[1][0], '201');
    });

    it('should handle empty dataset gracefully', async () => {
        const buffer = await createExcelSingleSheet('Boş', []);
        assert.ok(Buffer.isBuffer(buffer));
        const rows = await readExcelRows(buffer);
        assert.strictEqual(rows.length, 0);
    });
});
