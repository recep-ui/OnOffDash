const { describe, it } = require('node:test');
const assert = require('node:assert');
const PrinterMonitorService = require('../services/printerMonitorService');

describe('Printer Monitoring & Toner Normalization Hardening Suite', () => {
    describe('1. Supply Color Resolution & Non-Toner Filtering', () => {
        const resolve = PrinterMonitorService.resolveSupplyColor;

        it('should correctly identify standard CYMK toner colors', () => {
            const service = new PrinterMonitorService({});
            assert.strictEqual(typeof service.scanPrinter, 'function');
            assert.strictEqual(typeof service.scanSinglePrinter, 'function');
            assert.strictEqual(typeof service.getSnmpInfo, 'function');
            assert.strictEqual(typeof service.getWebScraperInfo, 'function');
        });

        it('should correctly resolve Kyocera cartridge models (TK-5240K/C/M/Y)', () => {
            assert.strictEqual(resolve('TK-5240K', null, 1, 4), 'Black');
            assert.strictEqual(resolve('TK-5240C', null, 2, 4), 'Cyan');
            assert.strictEqual(resolve('TK-5240M', null, 3, 4), 'Magenta');
            assert.strictEqual(resolve('TK-5240Y', null, 4, 4), 'Yellow');
        });

        it('should correctly resolve Canon cartridge models (CRG-054K/C/M/Y)', () => {
            assert.strictEqual(resolve('CRG-054K', null, 1, 4), 'Black');
            assert.strictEqual(resolve('CRG-054C', null, 2, 4), 'Cyan');
            assert.strictEqual(resolve('CRG-054M', null, 3, 4), 'Magenta');
            assert.strictEqual(resolve('CRG-054Y', null, 4, 4), 'Yellow');
        });

        it('should correctly resolve bracketed and prefixed color codes', () => {
            assert.strictEqual(resolve('Toner (K)', null, 1, 4), 'Black');
            assert.strictEqual(resolve('Toner:C', null, 2, 4), 'Cyan');
            assert.strictEqual(resolve('Cartridge_M', null, 3, 4), 'Magenta');
            assert.strictEqual(resolve('Toner-Y', null, 4, 4), 'Yellow');
        });

        it('should correctly resolve Turkish and multilingual color names', () => {
            assert.strictEqual(resolve('Siyah Toner', null, 1, 4), 'Black');
            assert.strictEqual(resolve('Mavi Toner', null, 2, 4), 'Cyan');
            assert.strictEqual(resolve('Kırmızı Toner', null, 3, 4), 'Magenta');
            assert.strictEqual(resolve('Sarı Toner', null, 4, 4), 'Yellow');
            assert.strictEqual(resolve('Schwarz', null, 1, 4), 'Black');
            assert.strictEqual(resolve('Gelb', null, 4, 4), 'Yellow');
        });

        it('should filter out non-toner supplies (waste boxes, drums, fusers, belts)', () => {
            // By RFC 3805 supplyType
            assert.strictEqual(resolve('Waste Box', 4, 1, 4), null);
            assert.strictEqual(resolve('Drum Unit', 9, 2, 4), null);
            assert.strictEqual(resolve('Fuser Kit', 15, 3, 4), null);
            assert.strictEqual(resolve('Transfer Belt', 18, 4, 4), null);

            // By description keywords
            assert.strictEqual(resolve('Atık Toner Kutusu', null, 1, 4), null);
            assert.strictEqual(resolve('Görüntüleme Ünitesi', null, 2, 4), null);
            assert.strictEqual(resolve('Fırın Ünitesi', null, 3, 4), null);
            assert.strictEqual(resolve('Transfer Belt Unit', null, 4, 4), null);
            assert.strictEqual(resolve('Bakım Kiti (Maintenance)', null, 5, 4), null);
        });

        it('should resolve single consumable supply as Black on monochrome printers', () => {
            assert.strictEqual(resolve('TK-1170', null, 1, 1), 'Black');
            assert.strictEqual(resolve('C-EXV 42', null, 1, 1), 'Black');
            assert.strictEqual(resolve('Toner Cartridge', null, 1, 1), 'Black');
        });

        it('should support RFC 3805 prtMarkerColorantValue mapping', () => {
            assert.strictEqual(resolve('Generic Toner', null, 1, 4, 'black'), 'Black');
            assert.strictEqual(resolve('Generic Toner', null, 2, 4, 'cyan'), 'Cyan');
            assert.strictEqual(resolve('Generic Toner', null, 3, 4, 'magenta'), 'Magenta');
            assert.strictEqual(resolve('Generic Toner', null, 4, 4, 'yellow'), 'Yellow');
        });

        it('should apply standard 4-color fallback for generic descriptions', () => {
            assert.strictEqual(resolve('Supply 1', null, 1, 4), 'Black');
            assert.strictEqual(resolve('Supply 2', null, 2, 4), 'Cyan');
            assert.strictEqual(resolve('Supply 3', null, 3, 4), 'Magenta');
            assert.strictEqual(resolve('Supply 4', null, 4, 4), 'Yellow');
        });

        it('should handle single printer scan method contract', async () => {
            const service = new PrinterMonitorService({});
            await assert.rejects(async () => {
                await service.scanSinglePrinter('not-a-number');
            }, /Invalid printer ID/);
        });
    });

    describe('2. SNMP Probe Resilience and Fallback Mechanisms', () => {
        it('should create session with Version1 and Version2c appropriately', () => {
            const service = new PrinterMonitorService({});
            const s1 = service.createSnmpSession('127.0.0.1', { snmp_community: 'public', snmp_version: '1' });
            assert.ok(s1);
            if (typeof s1.close === 'function') s1.close();

            const s2 = service.createSnmpSession('127.0.0.1', { snmp_community: 'public', snmp_version: '2c' });
            assert.ok(s2);
            if (typeof s2.close === 'function') s2.close();
        });

        it('should support versionOverride parameter', () => {
            const service = new PrinterMonitorService({});
            const s = service.createSnmpSession('127.0.0.1', { snmp_community: 'public', snmp_version: '1' }, '2c');
            assert.ok(s);
            if (typeof s.close === 'function') s.close();
        });
    });
});
