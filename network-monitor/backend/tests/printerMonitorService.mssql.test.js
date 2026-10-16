const { it } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const http = require('node:http');
const { pool } = require('../db/connection');
const PrinterMonitorService = require('../services/printerMonitorService');

// Run against a migrated test database with RUN_MSSQL_PRINTER_TESTS=1.
// Uses the configured app account and removes only its own temporary printer.
it('persists HP XML toner levels and printer status in the migrated MSSQL schema', {
    skip: process.env.RUN_MSSQL_PRINTER_TESTS !== '1'
}, async t => {
    const originalNoProxy = { NO_PROXY: process.env.NO_PROXY, no_proxy: process.env.no_proxy };
    const noProxy = [process.env.NO_PROXY, process.env.no_proxy, '127.0.0.1', 'localhost'].filter(Boolean).join(',');
    process.env.NO_PROXY = noProxy;
    process.env.no_proxy = noProxy;
    const readings = [['K', 0], ['C', 65], ['M', 40], ['Y', 80]];
    const xml = `<cc:ConsumableConfigDyn xmlns:cc="urn:hp:consumables" xmlns:dd="urn:hp:dictionary">
        ${readings.map(([color, level]) => `<cc:ConsumableInfo>
            <dd:ConsumableTypeEnum>toner</dd:ConsumableTypeEnum>
            <dd:ConsumableLabelCode>${color}</dd:ConsumableLabelCode>
            <dd:ConsumablePercentageLevelRemaining>${level}</dd:ConsumablePercentageLevelRemaining>
        </cc:ConsumableInfo>`).join('')}
    </cc:ConsumableConfigDyn>`;
    const requests = [];
    const server = http.createServer((request, response) => {
        requests.push(request.url);
        if (request.url !== '/DevMgmt/ConsumableConfigDyn.xml') {
            response.writeHead(404).end();
            return;
        }
        response.writeHead(200, { 'content-type': 'application/xml' });
        response.end(xml);
    });
    let printerId;
    t.after(async () => {
        try {
            if (printerId) await pool.query('DELETE FROM printers WHERE id = $1', [printerId]);
        } finally {
            await pool.close();
            await new Promise(resolve => server.close(resolve));
            for (const [name, value] of Object.entries(originalNoProxy)) {
                if (value === undefined) delete process.env[name];
                else process.env[name] = value;
            }
        }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const suffix = randomBytes(4).toString('hex');
    const result = await pool.query(
        'INSERT INTO printers (name, ip_address, model) OUTPUT INSERTED.* VALUES ($1, $2, $3)',
        [`Toner integration test ${suffix}`, `2001:db8::${suffix.slice(0, 4)}:${suffix.slice(4)}`, 'HP Color LaserJet M254dw']
    );
    const printer = result.rows[0];
    printerId = printer.id;
    const events = [];
    const monitor = new PrinterMonitorService({ emit: (name, data) => events.push({ name, data }) });
    t.mock.method(monitor, 'getSnmpInfo', async () => { throw new Error('Controlled SNMP fallback'); });
    const getWebInfo = monitor.getWebScraperInfo.bind(monitor);
    t.mock.method(monitor, 'getWebScraperInfo', (_ip, config) =>
        getWebInfo(`127.0.0.1:${server.address().port}`, config));
    await monitor.scanPrinter(printer);

    const status = await pool.query('SELECT is_online, printer_status, error_message FROM printers WHERE id = $1', [printerId]);
    assert.equal(Boolean(status.rows[0].is_online), true);
    assert.equal(status.rows[0].printer_status, 'Ready');
    assert.equal(status.rows[0].error_message, '');
    const actual = await pool.query(
        'SELECT color, level, max_capacity FROM printer_toners WHERE printer_id = $1 ORDER BY color', [printerId]
    );
    assert.deepEqual(actual.rows, [
        { color: 'Black', level: 0, max_capacity: 100 },
        { color: 'Cyan', level: 65, max_capacity: 100 },
        { color: 'Magenta', level: 40, max_capacity: 100 },
        { color: 'Yellow', level: 80, max_capacity: 100 }
    ]);
    assert.deepEqual(requests, ['/DevMgmt/ConsumableConfigDyn.xml']);
    const updated = events.find(event => event.name === 'printer:updated');
    assert.ok(updated);
    assert.equal(updated.data.toners.length, 4);
    const low = events.find(event => event.name === 'toner:low');
    assert.ok(low);
    assert.equal(low.data.toners[0].percentage, 0);
});
