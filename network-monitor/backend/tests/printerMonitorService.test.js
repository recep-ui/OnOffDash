const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const snmp = require('net-snmp');
const axios = require('axios');
const { pool } = require('../db/connection');
const PrinterMonitorService = require('../services/printerMonitorService');

const SUPPLY = '1.3.6.1.2.1.43.11.1.1';
const MODEL = '1.3.6.1.2.1.25.3.2.1.3.1';

function mockSession(t, service, columns, options = {}) {
    const session = {
        get: t.mock.fn((oids, callback) => {
            const oid = oids[0];
            if (options.offline) return callback(new Error('Request timed out'));
            callback(null, [{
                oid,
                type: oid === MODEL && !options.missingModel
                    ? snmp.ObjectType.OctetString : snmp.ObjectType.NoSuchInstance,
                value: oid === MODEL && !options.missingModel ? Buffer.from('Test printer') : null
            }]);
        }),
        subtree: t.mock.fn((oid, feed, done) => {
            if (options.offline) {
                return done(new Error('Request timed out'));
            }
            feed((columns[oid] || []).map(([index, value, type]) => ({
                oid: `${oid}.${index}`,
                type: type || (typeof value === 'number' ? snmp.ObjectType.Integer : snmp.ObjectType.OctetString),
                value: typeof value === 'string' ? Buffer.from(value) : value
            })));
            done(options.failedColumn === oid ? new Error('Request timed out') : null);
        }),
        close: t.mock.fn()
    };
    t.mock.method(service, 'createSnmpSession', () => session);
    return session;
}

function mockDatabase(t, emitted) {
    const inserts = [];
    const operations = [];
    t.mock.method(pool, 'query', async (sql, params) => {
        if (sql.includes('UPDATE printers SET')) operations.push(params);
        if (sql.includes('SELECT p.*')) {
            return { rows: [{ id: 7, toners: JSON.stringify(inserts.map(p => ({
                color: p[1], level: p[2], max_capacity: p[3]
            }))) }] };
        }
        return { rows: [] };
    });
    const client = {
        query: t.mock.fn(async (sql, params) => {
            if (sql.includes('INSERT INTO printer_toners')) inserts.push(params);
            return { rows: [] };
        }),
        release: t.mock.fn()
    };
    t.mock.method(pool, 'connect', async () => client);
    const service = new PrinterMonitorService({ emit: (event, data) => emitted.push({ event, data }) });
    return { service, inserts, operations, client };
}

describe('Printer toner SNMP collection', () => {
    it('joins sparse, reordered supply columns by their full OID index', async t => {
        const service = new PrinterMonitorService({});
        const session = mockSession(t, service, {
            [`${SUPPLY}.6`]: [['1.2', 'Black cartridge'], ['2.2', 'Cyan cartridge'], ['1.8', 'Yellow cartridge']],
            [`${SUPPLY}.8`]: [['2.2', 200], ['1.2', 100], ['1.8', 100]],
            [`${SUPPLY}.9`]: [['2.2', 80], ['1.8', 0]]
        });
        const data = await service.getSnmpInfo('192.0.2.1');
        assert.deepEqual(data.toners, [
            { color: 'Cyan', maxCapacity: 200, level: 80 },
            { color: 'Yellow', maxCapacity: 100, level: 0 }
        ]);
        assert.equal(session.close.mock.callCount(), 1);
    });

    it('uses percent units even when the device has unknown or inconsistent capacity', async t => {
        const service = new PrinterMonitorService({});
        mockSession(t, service, {
            [`${SUPPLY}.6`]: [['1.1', 'Black'], ['1.2', 'Cyan']],
            [`${SUPPLY}.7`]: [['1.1', 19], ['1.2', 19]],
            [`${SUPPLY}.8`]: [['1.1', -2], ['1.2', 5000]],
            [`${SUPPLY}.9`]: [['1.1', 65], ['1.2', 20]]
        });
        assert.deepEqual((await service.getSnmpInfo('192.0.2.1')).toners, [
            { color: 'Black', maxCapacity: 100, level: 65 },
            { color: 'Cyan', maxCapacity: 100, level: 20 }
        ]);
    });

    it('does not invent zero levels or percentages for missing and unknown readings', async t => {
        const service = new PrinterMonitorService({});
        mockSession(t, service, {
            [`${SUPPLY}.6`]: [['1.1', 'Black'], ['1.2', 'Cyan'], ['1.3', 'Magenta'], ['1.4', 'Yellow']],
            [`${SUPPLY}.8`]: [['1.1', 100], ['1.2', -2], ['1.3', 100]],
            [`${SUPPLY}.9`]: [['1.2', 40], ['1.3', -3], ['1.4', 40]]
        });
        assert.deepEqual((await service.getSnmpInfo('192.0.2.1')).toners, []);
    });

    it('filters waste toner, drums and other non-toner consumables', async t => {
        const service = new PrinterMonitorService({});
        const descriptions = ['Black toner', 'Waste Black Toner', 'Cyan drum', 'Fuser', 'Magenta ink'];
        mockSession(t, service, {
            [`${SUPPLY}.6`]: descriptions.map((description, i) => [`1.${i + 1}`, description]),
            [`${SUPPLY}.5`]: [3, 4, 9, 15, 5].map((type, i) => [`1.${i + 1}`, type]),
            [`${SUPPLY}.8`]: descriptions.map((_, i) => [`1.${i + 1}`, 100]),
            [`${SUPPLY}.9`]: descriptions.map((_, i) => [`1.${i + 1}`, 50])
        });
        assert.deepEqual((await service.getSnmpInfo('192.0.2.1')).toners.map(t => t.color), ['Black', 'Magenta']);
    });

    it('collects supplies when the fixed model OID is unsupported', async t => {
        const service = new PrinterMonitorService({});
        const session = mockSession(t, service, {
            [`${SUPPLY}.6`]: [['2.1', 'Black']],
            [`${SUPPLY}.8`]: [['2.1', 100]],
            [`${SUPPLY}.9`]: [['2.1', 30]]
        }, { missingModel: true });
        const data = await service.getSnmpInfo('192.0.2.1');
        assert.equal(data.toners[0].level, 30);
        assert.equal(session.close.mock.callCount(), 1);
    });

    it('does not accept a partial column from an interrupted SNMP walk', async t => {
        const service = new PrinterMonitorService({});
        mockSession(t, service, {
            [`${SUPPLY}.6`]: [['1.1', 'Black']],
            [`${SUPPLY}.8`]: [['1.1', 100]],
            [`${SUPPLY}.9`]: [['1.1', 50]]
        }, { failedColumn: `${SUPPLY}.9` });
        const data = await service.getSnmpInfo('192.0.2.1');
        assert.deepEqual(data.toners, []);
        assert.match(data.tonerError, /timed out/);
    });

    it('rejects unreachable printers and always closes the session', async t => {
        const service = new PrinterMonitorService({});
        const session = mockSession(t, service, {}, { offline: true });
        await assert.rejects(service.getSnmpInfo('192.0.2.1'), /SNMP/);
        assert.equal(session.close.mock.callCount(), 1);
        assert.equal(session.get.mock.callCount(), 1);
    });

    it('keeps valid raw capacity ratios when optional metadata is unsupported', async t => {
        const service = new PrinterMonitorService({});
        mockSession(t, service, {
            [`${SUPPLY}.6`]: [['1.1', 'Black cartridge']],
            [`${SUPPLY}.8`]: [['1.1', 12000]],
            [`${SUPPLY}.9`]: [['1.1', 3000]]
        }, { failedColumn: `${SUPPLY}.7` });
        assert.deepEqual((await service.getSnmpInfo('192.0.2.1')).toners, [
            { color: 'Black', maxCapacity: 12000, level: 3000 }
        ]);
    });

    it('rejects levels exceeding their reported maximum', async t => {
        const service = new PrinterMonitorService({});
        mockSession(t, service, {
            [`${SUPPLY}.6`]: [['1.1', 'Black']],
            [`${SUPPLY}.8`]: [['1.1', 100]],
            [`${SUPPLY}.9`]: [['1.1', 150]]
        });
        assert.deepEqual((await service.getSnmpInfo('192.0.2.1')).toners, []);
    });

    it('handles an empty scalar varbind response without crashing', async t => {
        const service = new PrinterMonitorService({});
        const session = mockSession(t, service, {
            [`${SUPPLY}.6`]: [['1.1', 'Black']],
            [`${SUPPLY}.8`]: [['1.1', 100]],
            [`${SUPPLY}.9`]: [['1.1', 50]]
        });
        t.mock.method(session, 'get', (_oids, callback) => callback(null, []));
        assert.equal((await service.getSnmpInfo('192.0.2.1')).toners[0].level, 50);
    });
});

describe('Printer toner web fallback', () => {
    it('reads HP LaserJet M254-style namespaced consumables with percent levels', async t => {
        const service = new PrinterMonitorService({});
        const request = t.mock.method(axios, 'get', async () => ({ data: `
            <cc:ConsumableConfigDyn xmlns:cc="urn:hp:consumables" xmlns:dd="urn:hp:dictionary">
                ${[['K', 0], ['C', 65], ['M', 40], ['Y', 80]].map(([color, level]) => `
                    <cc:ConsumableInfo>
                        <dd:ConsumableTypeEnum>toner</dd:ConsumableTypeEnum>
                        <dd:ConsumableLabelCode>${color}</dd:ConsumableLabelCode>
                        <dd:ConsumablePercentageLevelRemaining>${level}</dd:ConsumablePercentageLevelRemaining>
                        <cc:Capacity><dd:MaxCapacity>1400</dd:MaxCapacity></cc:Capacity>
                    </cc:ConsumableInfo>`).join('')}
            </cc:ConsumableConfigDyn>` }));
        const data = await service.getWebScraperInfo('192.0.2.1', { model: 'HP Color LaserJet M254dw' });
        assert.equal(request.mock.callCount(), 1);
        assert.equal(request.mock.calls[0].arguments[0], 'http://192.0.2.1/DevMgmt/ConsumableConfigDyn.xml');
        assert.deepEqual(data.toners, [
            { color: 'Black', level: 0, maxCapacity: 100 },
            { color: 'Cyan', level: 65, maxCapacity: 100 },
            { color: 'Magenta', level: 40, maxCapacity: 100 },
            { color: 'Yellow', level: 80, maxCapacity: 100 }
        ]);
    });

    it('does not turn missing or unknown HP XML levels into zero readings', async t => {
        const service = new PrinterMonitorService({});
        t.mock.method(axios, 'get', async url => {
            if (!url.endsWith('.xml')) throw new Error('HTTP 404');
            return { data: `<ConsumableConfigDyn>
                <ConsumableInfo><ConsumableLabelCode>K</ConsumableLabelCode></ConsumableInfo>
                <ConsumableInfo><ConsumableLabelCode>C</ConsumableLabelCode>
                    <ConsumablePercentageLevelRemaining>unknown</ConsumablePercentageLevelRemaining></ConsumableInfo>
                <ConsumableInfo><ConsumableLabelCode>M</ConsumableLabelCode>
                    <ConsumablePercentageLevelRemaining>-3</ConsumablePercentageLevelRemaining></ConsumableInfo>
                <ConsumableInfo><ConsumableTypeEnum>printhead</ConsumableTypeEnum><ConsumableLabelCode>Y</ConsumableLabelCode>
                    <ConsumablePercentageLevelRemaining>50</ConsumablePercentageLevelRemaining></ConsumableInfo>
            </ConsumableConfigDyn>` };
        });
        assert.deepEqual((await service.getWebScraperInfo('192.0.2.1', { model: 'HP M254' })).toners, []);
    });

    it('falls back to HTML when the HP XML endpoint is unsupported', async t => {
        const service = new PrinterMonitorService({});
        const request = t.mock.method(axios, 'get', async url => {
            if (url.endsWith('.xml')) throw new Error('HTTP 404');
            return { data: '<div>Black toner 45%</div>' };
        });
        const data = await service.getWebScraperInfo('192.0.2.1', { model: 'HP M254' });
        assert.equal(request.mock.callCount(), 2);
        assert.equal(data.toners[0].level, 45);
    });

    it('discovers HP XML readings after HTML pages fail without a configured model', async t => {
        const service = new PrinterMonitorService({});
        t.mock.method(axios, 'get', async url => {
            if (!url.endsWith('.xml')) throw new Error('HTTP 404');
            return { data: `<ConsumableConfigDyn><ConsumableInfo>
                <ConsumableTypeEnum>toner</ConsumableTypeEnum><ConsumableLabelCode>K</ConsumableLabelCode>
                <ConsumablePercentageLevelRemaining>35</ConsumablePercentageLevelRemaining>
            </ConsumableInfo></ConsumableConfigDyn>` };
        });
        assert.deepEqual((await service.getWebScraperInfo('192.0.2.1')).toners, [
            { color: 'Black', level: 35, maxCapacity: 100 }
        ]);
    });

    it('pairs table labels with their levels without matching the outer container', async t => {
        const service = new PrinterMonitorService({});
        t.mock.method(axios, 'get', async () => ({ data: `<title>Test Printer</title><div><table>
            <tr><td>Black cartridge</td><td>10%</td></tr>
            <tr><td>Cyan cartridge</td><td>% 70</td></tr>
            <tr><td>Magenta cartridge</td><td>50 %</td></tr>
            <tr><td>Yellow cartridge</td><td>0%</td></tr>
        </table></div>` }));
        const data = await service.getWebScraperInfo('192.0.2.1');
        assert.deepEqual(data.toners, [
            { color: 'Black', level: 10, maxCapacity: 100 },
            { color: 'Cyan', level: 70, maxCapacity: 100 },
            { color: 'Magenta', level: 50, maxCapacity: 100 },
            { color: 'Yellow', level: 0, maxCapacity: 100 }
        ]);
    });

    it('keeps zero text levels when a surrounding layout has a different width', async t => {
        const service = new PrinterMonitorService({});
        t.mock.method(axios, 'get', async () => ({ data:
            '<div>Black toner 0%<span style="width:100%"></span></div>' }));
        assert.equal((await service.getWebScraperInfo('192.0.2.1')).toners[0].level, 0);
    });

    it('ignores out-of-range values and ambiguous multi-color containers', async t => {
        const service = new PrinterMonitorService({});
        t.mock.method(axios, 'get', async () => ({ data:
            '<div>Black toner 150%</div><div>Cyan and Magenta toner 20%</div><div>Waste Black Toner 30%</div><div>Yellow -10%</div>' }));
        assert.deepEqual((await service.getWebScraperInfo('192.0.2.1')).toners, []);
    });

    it('tries the second page when the first HTTP 200 page has no toner readings', async t => {
        const service = new PrinterMonitorService({});
        const request = t.mock.method(axios, 'get', async url => ({ data:
            url.endsWith('info_suppliesStatus.html') ? '<title>Printer login</title>' : '<div>Black toner 45%</div>' }));
        const data = await service.getWebScraperInfo('192.0.2.1');
        assert.equal(request.mock.callCount(), 2);
        assert.equal(data.toners[0].level, 45);
    });

    it('reads nested progress bars and preserves the full model title', async t => {
        const service = new PrinterMonitorService({});
        t.mock.method(axios, 'get', async () => ({ data:
            '<title>HP Color LaserJet Pro MFP</title><div>Cyan toner<div><span style="height:8px; width:40%"></span></div></div>' }));
        const data = await service.getWebScraperInfo('192.0.2.1');
        assert.equal(data.model, 'HP Color LaserJet Pro MFP');
        assert.deepEqual(data.toners, [{ color: 'Cyan', level: 40, maxCapacity: 100 }]);
    });

    it('reads Turkish color names without confusing cartridge text with color abbreviations', async t => {
        const service = new PrinterMonitorService({});
        t.mock.method(axios, 'get', async () => ({ data:
            '<div>Siyah kartus %25</div><div>Camgöbeği kartus %35</div><div>Macenta kartus %45</div><div>Sarı kartus %55</div>' }));
        assert.deepEqual((await service.getWebScraperInfo('192.0.2.1')).toners.map(t => t.level), [25, 35, 45, 55]);
    });

    it('uses the second page after an HTTP error on the supplies page', async t => {
        const service = new PrinterMonitorService({});
        t.mock.method(axios, 'get', async url => {
            if (url.endsWith('info_suppliesStatus.html')) throw new Error('HTTP 404');
            return { data: '<div>Black toner 45%</div>' };
        });
        assert.equal((await service.getWebScraperInfo('192.0.2.1')).toners[0].level, 45);
    });
});

describe('Printer scan toner persistence', () => {
    it('uses web toner fallback after a successful SNMP response without supplies', async t => {
        const emitted = [];
        const { service, inserts, operations } = mockDatabase(t, emitted);
        t.mock.method(service, 'getSnmpInfo', async () => ({ model: 'SNMP model', statusText: 'Printing', toners: [] }));
        const web = t.mock.method(service, 'getWebScraperInfo', async () => ({
            model: 'Web model', toners: [{ color: 'Black', level: 0, maxCapacity: 100 }]
        }));
        await service.scanPrinter({ id: 7, ip_address: '192.0.2.1' });
        assert.equal(web.mock.callCount(), 1);
        assert.deepEqual(web.mock.calls[0].arguments, ['192.0.2.1', { model: 'SNMP model' }]);
        assert.deepEqual(inserts, [[7, 'Black', 0, 100, 0]]);
        assert.equal(operations[0][0], 1);
        assert.equal(operations[0][1], 'SNMP model');
        assert.equal(operations[0][2], 'Printing');
        assert.ok(emitted.some(e => e.event === 'toner:low'));
    });

    it('preserves previous toner rows and reports missing readings while the printer remains online', async t => {
        const { service, inserts, operations } = mockDatabase(t, []);
        t.mock.method(service, 'getSnmpInfo', async () => ({ toners: [] }));
        t.mock.method(service, 'getWebScraperInfo', async () => { throw new Error('Web timeout'); });
        await service.scanPrinter({ id: 7, ip_address: '192.0.2.1' });
        assert.deepEqual(inserts, []);
        assert.equal(pool.connect.mock.callCount(), 0);
        assert.equal(operations[0][0], 1);
        assert.match(operations[0][5], /Toner/);
        assert.equal(service.activeScans.size, 0);
    });

    it('does not make a web request when SNMP has usable toner readings', async t => {
        const { service } = mockDatabase(t, []);
        t.mock.method(service, 'getSnmpInfo', async () => ({
            toners: [{ color: 'Black', level: 55, maxCapacity: 100 }]
        }));
        const web = t.mock.method(service, 'getWebScraperInfo', async () => ({}));
        await service.scanPrinter({ id: 7, ip_address: '192.0.2.1' });
        assert.equal(web.mock.callCount(), 0);
    });

    it('marks a printer offline only when both transports fail', async t => {
        const { service, operations } = mockDatabase(t, []);
        t.mock.method(service, 'getSnmpInfo', async () => { throw new Error('SNMP timeout'); });
        t.mock.method(service, 'getWebScraperInfo', async () => { throw new Error('Web timeout'); });
        await service.scanPrinter({ id: 7, ip_address: '192.0.2.1' });
        assert.equal(operations[0][0], 0);
        assert.equal(operations[0][5], 'Connection failed (SNMP & Web)');
        assert.equal(pool.connect.mock.callCount(), 0);
    });

    it('stores web toner readings when SNMP is unreachable', async t => {
        const { service, inserts, operations } = mockDatabase(t, []);
        t.mock.method(service, 'getSnmpInfo', async () => { throw new Error('SNMP timeout'); });
        t.mock.method(service, 'getWebScraperInfo', async () => ({
            model: 'Web model', toners: [{ color: 'Cyan', level: 65, maxCapacity: 100 }]
        }));
        await service.scanPrinter({ id: 7, ip_address: '192.0.2.1' });
        assert.equal(operations[0][0], 1);
        assert.equal(operations[0][1], 'Web model');
        assert.deepEqual(inserts, [[7, 'Cyan', 65, 100, 0]]);
    });

    it('rolls back failed toner writes without emitting a low-toner alert', async t => {
        const emitted = [];
        const { service, client } = mockDatabase(t, emitted);
        t.mock.method(service, 'getSnmpInfo', async () => ({
            toners: [{ color: 'Black', level: 0, maxCapacity: 100 }]
        }));
        t.mock.method(client, 'query', async sql => {
            if (sql.includes('INSERT INTO printer_toners')) throw new Error('Insert failed');
            return { rows: [] };
        });
        await service.scanPrinter({ id: 7, ip_address: '192.0.2.1' });
        assert.ok(client.query.mock.calls.some(call => call.arguments[0] === 'ROLLBACK TRANSACTION'));
        assert.equal(client.release.mock.callCount(), 1);
        assert.ok(!emitted.some(e => e.event === 'toner:low'));
    });
});
