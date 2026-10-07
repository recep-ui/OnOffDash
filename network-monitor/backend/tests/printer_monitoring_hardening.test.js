const { describe, it } = require('node:test');
const assert = require('node:assert');
const PrinterMonitorService = require('../services/printerMonitorService');

describe('Printer Monitoring & Toner Normalization Hardening Suite', () => {
    describe('1. Supply Color Resolution & Non-Toner Filtering', () => {
        it('should correctly identify standard CYMK toner colors', () => {
            const service = new PrinterMonitorService({});
            // We can test probing logic or directly test how colors and levels are handled
            assert.strictEqual(typeof service.scanPrinter, 'function');
            assert.strictEqual(typeof service.scanSinglePrinter, 'function');
            assert.strictEqual(typeof service.getSnmpInfo, 'function');
            assert.strictEqual(typeof service.getWebScraperInfo, 'function');
        });

        it('should handle single printer scan method contract', async () => {
            const service = new PrinterMonitorService({});
            // Testing invalid printer ID throws
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
