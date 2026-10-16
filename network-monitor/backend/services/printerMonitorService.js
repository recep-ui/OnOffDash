const snmp = require('net-snmp');
const axios = require('axios');
const cheerio = require('cheerio');
const { pool } = require('../db/connection');
const { getLowTonerThreshold } = require('../utils/tonerConfig');

// Standard Printer MIB OIDs
const OID_SUPPLY_DESCRIPTION = "1.3.6.1.2.1.43.11.1.1.6";
const OID_SUPPLY_TYPE = "1.3.6.1.2.1.43.11.1.1.5";
const OID_SUPPLY_UNIT = "1.3.6.1.2.1.43.11.1.1.7";
const OID_SUPPLY_MAX_CAPACITY = "1.3.6.1.2.1.43.11.1.1.8";
const OID_SUPPLY_CURRENT_LEVEL = "1.3.6.1.2.1.43.11.1.1.9";
const OID_PRINTER_MODEL = "1.3.6.1.2.1.25.3.2.1.3.1";
        
// Printer status OIDs
const OID_PRINTER_STATUS = "1.3.6.1.2.1.25.3.5.1.1.1"; // hrPrinterStatus
const OID_PRINTER_ERROR = "1.3.6.1.2.1.25.3.5.1.2.1"; // hrPrinterDetectedErrorState
        
// Page count OIDs
const OID_PAGE_COUNT = "1.3.6.1.2.1.43.10.2.1.4.1.1"; // prtMarkerLifeCount
const OID_PAGE_COUNT_ALT = "1.3.6.1.4.1.11.2.3.9.4.2.1.4.1.2.5"; // HP specific page count

const TONER_COLOR_PATTERNS = {
    Black: /(?:^|[^\p{L}\p{N}])(?:black|siyah|bk|k)(?=$|[^\p{L}\p{N}])/iu,
    Cyan: /(?:^|[^\p{L}\p{N}])(?:cyan|cam(?:g[oö]be[gğ]i)?|c)(?=$|[^\p{L}\p{N}])/iu,
    Magenta: /(?:^|[^\p{L}\p{N}])(?:magenta|macenta|m)(?=$|[^\p{L}\p{N}])/iu,
    Yellow: /(?:^|[^\p{L}\p{N}])(?:yellow|sar[iı]|y)(?=$|[^\p{L}\p{N}])/iu
};
const NON_TONER_SUPPLY = /waste|drum|fuser|transfer|maintenance|at[iı]k|tambur/iu;

function getTonerColor(text) {
    const colors = Object.entries(TONER_COLOR_PATTERNS)
        .filter(([, pattern]) => pattern.test(text)).map(([color]) => color);
    return colors.length === 1 ? colors[0] : null;
}

class PrinterMonitorService {
    constructor(io) {
        this.io = io;
        this.isScanning = false;
        this.activeScans = new Set();
        this.concurrency = parseInt(process.env.PRINTER_SCAN_CONCURRENCY || '5', 10);
    }

    async scanAllPrinters() {
        if (this.isScanning) {
            console.log('⏳ Printer scan already in progress...');
            return;
        }

        this.isScanning = true;
        console.log('🔍 Starting printer SNMP/Web scan...');

        try {
            const result = await pool.query('SELECT * FROM printers');
            const printers = result.rows;

            if (printers.length === 0) {
                console.log('ℹ️  No printers to scan.');
                return;
            }

            // Bounded concurrency execution with small jitter to prevent connection storms
            const concurrency = Math.max(1, this.concurrency);
            let index = 0;
            const workers = [];

            const worker = async () => {
                while (index < printers.length) {
                    const currentIndex = index++;
                    const printer = printers[currentIndex];
                    if (!printer) continue;

                    // Staggering/jitter between scan starts (10–30ms)
                    const jitter = Math.floor(Math.random() * 20) + 10;
                    await new Promise(resolve => setTimeout(resolve, jitter));

                    await this.scanPrinter(printer);
                }
            };

            const workerCount = Math.min(concurrency, printers.length);
            for (let i = 0; i < workerCount; i++) {
                workers.push(worker());
            }
            await Promise.allSettled(workers);

            console.log(`✅ Printer scan completed. ${printers.length} printers checked.`);
            
            // Emit dashboard stats to update summary cards
            this.emitStats();
            
        } catch (err) {
            console.error('❌ Printer scan error:', err);
        } finally {
            this.isScanning = false;
        }
    }

    async scanPrinter(printer) {
        if (!printer || !printer.ip_address) return;

        // Prevent duplicate simultaneous scans of the same target
        if (this.activeScans.has(printer.id)) {
            return;
        }
        this.activeScans.add(printer.id);

        try {
            let isOnline = false;
            let model = printer.model || '';
            let statusText = 'Ready';
            let hasJam = false;
            let pageCount = printer.total_page_count || 0;
            let toners = [];
            let errorMessage = '';
            let tonersUpdated = false;

            try {
                // Try SNMP first (with per-printer config or centralized SNMP_COMMUNITY)
                const snmpData = await this.getSnmpInfo(printer.ip_address, printer);
                isOnline = true;
                model = snmpData.model || model;
                statusText = snmpData.statusText || statusText;
                hasJam = snmpData.hasJam || hasJam;
                pageCount = snmpData.pageCount || pageCount;
                toners = snmpData.toners || [];
                if (snmpData.tonerError) {
                    console.warn(`SNMP toner read failed for ${printer.ip_address}: ${snmpData.tonerError}`);
                }
            } catch (err) {
                console.warn(`SNMP failed for ${printer.ip_address}: ${err.message}`);
            }

            // Connectivity and readable toner levels are separate outcomes.
            if (toners.length === 0) {
                try {
                    const webData = await this.getWebScraperInfo(printer.ip_address, { model });
                    if (!isOnline) model = webData.model || model;
                    isOnline = true;
                    toners = webData.toners || toners;
                    if (webData.pageCount) pageCount = webData.pageCount;
                } catch (webErr) {
                    console.warn(`Web toner read failed for ${printer.ip_address}: ${webErr.message}`);
                }
                if (toners.length === 0) {
                    errorMessage = isOnline
                        ? 'Toner levels unavailable (SNMP & Web); previous readings retained'
                        : 'Connection failed (SNMP & Web)';
                }
            }

            // Update Database with scan results
            await pool.query(
                `UPDATE printers SET
                    is_online = $1,
                    model = CASE WHEN $2 != '' THEN $2 ELSE model END,
                    printer_status = $3,
                    has_paper_jam = $4,
                    total_page_count = CASE WHEN $5 > 0 THEN $5 ELSE total_page_count END,
                    error_message = $6,
                    last_updated = GETDATE()
                 OUTPUT INSERTED.*
                 WHERE id = $7`,
                [isOnline ? 1 : 0, model, statusText, hasJam ? 1 : 0, pageCount, errorMessage, printer.id]
            );

            // Update Toners atomically inside a database transaction
            if (isOnline && toners.length > 0) {
                const client = await pool.connect();
                try {
                    await client.query('BEGIN TRANSACTION');
                    await client.query('DELETE FROM printer_toners WHERE printer_id = $1', [printer.id]);
                    for (const t of toners) {
                        await client.query(
                            `INSERT INTO printer_toners (printer_id, color, level, max_capacity, pages_printed)
                             VALUES ($1, $2, $3, $4, $5)`,
                            [printer.id, t.color, t.level, t.maxCapacity, t.pagesPrinted || 0]
                        );
                    }
                    await client.query('COMMIT TRANSACTION');
                    tonersUpdated = true;
                } catch (txErr) {
                    await client.query('ROLLBACK TRANSACTION');
                    console.error(`❌ Atomic toner update failed for printer ${printer.id}:`, txErr.message);
                } finally {
                    client.release();
                }
            }

            // Fetch fully populated printer to emit via Socket.io
            const fullPrinterRes = await pool.query(`
                SELECT p.*,
                       (
                           SELECT t.color, t.level, t.max_capacity, t.pages_printed
                           FROM printer_toners t
                           WHERE t.printer_id = p.id
                           FOR JSON PATH
                       ) as toners
                FROM printers p
                WHERE p.id = $1
            `, [printer.id]);

            if (fullPrinterRes.rows.length > 0) {
                const fullPrinter = fullPrinterRes.rows[0];
                fullPrinter.toners = fullPrinter.toners ? JSON.parse(fullPrinter.toners) : [];
                this.io.emit('printer:updated', fullPrinter);

                // Toner düşük seviye kontrolü (merkezi eşik: LOW_TONER_THRESHOLD_PERCENT)
                if (tonersUpdated) {
                    const lowTonerThreshold = getLowTonerThreshold();
                    const lowToners = toners.filter(t => {
                        const maxCap = t.maxCapacity || 100;
                        return maxCap > 0 && (t.level / maxCap) * 100 < lowTonerThreshold;
                    });

                    if (lowToners.length > 0) {
                        this.io.emit('toner:low', {
                            printer_id: printer.id,
                            printer_name: printer.name,
                            ip_address: printer.ip_address,
                            toners: lowToners.map(t => ({
                                color: t.color,
                                level: t.level,
                                maxCapacity: t.maxCapacity,
                                percentage: Math.round((t.level / (t.maxCapacity || 100)) * 100)
                            })),
                            timestamp: new Date().toISOString()
                        });
                    }
                }

                // Kağıt sıkışması uyarısı
                if (hasJam && !printer.has_paper_jam) {
                    this.io.emit('printer:jam', {
                        printer_id: printer.id,
                        printer_name: printer.name,
                        ip_address: printer.ip_address,
                        timestamp: new Date().toISOString()
                    });
                }
            }

        } catch (dbErr) {
            console.error(`❌ DB Update failed for printer ${printer.ip_address}:`, dbErr.message);
        } finally {
            this.activeScans.delete(printer.id);
        }
    }

    /**
     * Creates an SNMP session using either:
     * - Configured SNMP_COMMUNITY or per-printer community
     * - SNMPv3 abstraction with auth and privacy protocols
     * Fails-closed in production if SNMP_COMMUNITY is missing (no fallback to "public").
     */
    createSnmpSession(ipAddress, printerConfig = {}) {
        const isProd = process.env.NODE_ENV === 'production';
        const version = printerConfig.snmp_version || process.env.SNMP_VERSION || '1';
        const timeout = parseInt(process.env.SNMP_TIMEOUT_MS || '3000', 10);
        const retries = parseInt(process.env.SNMP_RETRIES || '1', 10);

        // SNMPv3 support abstraction
        if (version === '3' || version === 3) {
            const user = {
                name: printerConfig.snmp_username || process.env.SNMP_V3_USER || '',
                level: printerConfig.snmp_security_level || snmp.SecurityLevel.authPriv,
                authProtocol: printerConfig.snmp_auth_proto || snmp.AuthProtocols.sha,
                authKey: printerConfig.snmp_auth_key || process.env.SNMP_V3_AUTH_KEY || '',
                privProtocol: printerConfig.snmp_priv_proto || snmp.PrivProtocols.aes,
                privKey: printerConfig.snmp_priv_key || process.env.SNMP_V3_PRIV_KEY || ''
            };
            return snmp.createV3Session(ipAddress, user, { timeout, retries });
        }

        // SNMPv1 / SNMPv2c
        const community = printerConfig.snmp_community || process.env.SNMP_COMMUNITY || (isProd ? null : 'public');
        if (!community) {
            throw new Error(`SNMP_COMMUNITY environment variable is mandatory in production. Target: ${ipAddress}`);
        }

        const snmpVersion = (version === '2c' || version === '2' || version === 2) ? snmp.Version2c : snmp.Version1;
        return snmp.createSession(ipAddress, community, {
            timeout,
            retries,
            version: snmpVersion
        });
    }

    // --- SNMP LOGIC ---
    async getSnmpInfo(ipAddress, printerConfig = {}) {
        const session = this.createSnmpSession(ipAddress, printerConfig);
        let responded = false;
        const data = { model: '', statusText: 'Ready', hasJam: false, pageCount: 0, toners: [] };

        const walkSnmp = oid => new Promise((resolve, reject) => {
            const results = new Map();
            session.subtree(oid, varbinds => {
                for (const varbind of varbinds) {
                    if (!snmp.isVarbindError(varbind) && varbind.oid.startsWith(`${oid}.`)) {
                        responded = true;
                        const value = Buffer.isBuffer(varbind.value) ? varbind.value.toString() : varbind.value;
                        // Keep both device and supply indexes; columns can be sparse or reordered.
                        results.set(varbind.oid.slice(oid.length + 1), value);
                    }
                }
            }, error => {
                if (error) return reject(new Error(`${oid}: ${error.message}`));
                responded = true;
                resolve(results);
            });
        });

        const getSnmpValue = oid => new Promise(resolve => {
            session.get([oid], (error, varbinds) => {
                if (error) return resolve(null);
                responded = true;
                const varbind = varbinds && varbinds[0];
                if (!varbind || snmp.isVarbindError(varbind)) return resolve(null);
                resolve(Buffer.isBuffer(varbind.value) ? varbind.value.toString() : varbind.value);
            });
        });

        try {
            // A missing fixed model instance does not mean that supplies are unavailable.
            data.model = await getSnmpValue(OID_PRINTER_MODEL) || '';
            try {
                const descriptions = await walkSnmp(OID_SUPPLY_DESCRIPTION);
                const maxCapacities = await walkSnmp(OID_SUPPLY_MAX_CAPACITY);
                const currentLevels = await walkSnmp(OID_SUPPLY_CURRENT_LEVEL);
                const units = await walkSnmp(OID_SUPPLY_UNIT).catch(() => new Map());
                const types = await walkSnmp(OID_SUPPLY_TYPE).catch(() => new Map());

                for (const [index, description] of descriptions) {
                    const desc = String(description || '').trim();
                    const type = types.get(index);
                    if (!desc || NON_TONER_SUPPLY.test(desc)) continue;
                    // Printer-MIB toner/ink and cartridge types; allow other/unknown on older devices.
                    if (type !== undefined && ![1, 2, 3, 5, 21, 22].includes(Number(type))) continue;

                    const curr = currentLevels.get(index);
                    const maxCap = Number(units.get(index)) === 19 ? 100 : maxCapacities.get(index);
                    // Negative values are MIB sentinels, not zero or full toner readings.
                    if (!Number.isInteger(curr) || !Number.isInteger(maxCap) ||
                        curr < 0 || maxCap <= 0 || curr > maxCap) continue;
                    data.toners.push({
                        color: getTonerColor(desc) || desc.slice(0, 50),
                        maxCapacity: maxCap,
                        level: curr
                    });
                }
            } catch (error) {
                data.tonerError = error.message;
            }
            if (!responded) throw new Error('Printer not responding to SNMP');

            let pc = await getSnmpValue(OID_PAGE_COUNT);
            if (pc === null) pc = await getSnmpValue(OID_PAGE_COUNT_ALT);
            if (pc !== null) data.pageCount = parseInt(pc, 10) || 0;

            const pStatus = await getSnmpValue(OID_PRINTER_STATUS);
            const pError = await getSnmpValue(OID_PRINTER_ERROR);
            if (pError) {
                const errStr = pError.toString().toLowerCase();
                if (errStr.includes('jam') || errStr.includes('paper')) {
                    data.hasJam = true;
                    data.statusText = 'Paper Jam';
                } else if (errStr.includes('door') || errStr.includes('open')) {
                    data.statusText = 'Door Open';
                }
            }
            if (pStatus && !data.hasJam) {
                const status = parseInt(pStatus, 10);
                if (status === 3) data.statusText = 'Ready';
                else if (status === 4) data.statusText = 'Printing';
                else if (status === 5) data.statusText = 'Warming Up';
            }
            return data;
        } finally {
            session.close();
        }
    }

    // --- WEB SCRAPER LOGIC (Fallback) ---
    async getWebScraperInfo(ipAddress, printerConfig = {}) {
        let lastData;
        let lastError;
        const hpXmlPath = 'DevMgmt/ConsumableConfigDyn.xml';
        const htmlPaths = ['info_suppliesStatus.html', 'info_deviceStatus.html'];
        const paths = /hp|laserjet/i.test(printerConfig.model || '')
            ? [hpXmlPath, ...htmlPaths] : [...htmlPaths, hpXmlPath];
        for (const path of paths) {
            let html;
            try {
                const response = await axios.get(`http://${ipAddress}/${path}`, { timeout: 5000 });
                html = response.data;
            } catch (error) {
                lastError = error;
                continue;
            }
            if (path === hpXmlPath) {
                const $xml = cheerio.load(html, { xmlMode: true });
                const tagName = el => el.name && el.name.split(':').pop();
                const readField = (element, name) => $xml(element).find('*')
                    .filter((_i, el) => tagName(el) === name).first().text().trim();
                const toners = [];
                // HP uses XML namespaces whose prefixes vary between firmware versions.
                $xml('*').filter((_i, el) => tagName(el) === 'ConsumableInfo').each((_i, el) => {
                    const type = readField(el, 'ConsumableTypeEnum').toLowerCase();
                    if (type && !['toner', 'tonercartridge', 'ink', 'inkcartridge', 'inktank'].includes(type)) return;
                    const label = readField(el, 'ConsumableLabelCode') || readField(el, 'MarkerColor');
                    const color = getTonerColor(label);
                    const rawLevel = readField(el, 'ConsumablePercentageLevelRemaining');
                    const level = rawLevel === '' ? NaN : Number(rawLevel);
                    if (color && Number.isInteger(level) && level >= 0 && level <= 100) {
                        toners.push({ color, level, maxCapacity: 100 });
                    }
                });
                if (toners.length > 0) return { model: '', toners, pageCount: 0 };
                if ($xml('*').toArray().some(el => tagName(el) === 'ConsumableConfigDyn') && !lastData) {
                    lastData = { model: '', toners: [], pageCount: 0 };
                }
                continue;
            }
            const $ = cheerio.load(html);
            const title = $('title').text().trim();
            const model = title.endsWith(ipAddress)
                ? title.slice(0, -ipAddress.length).replace(/[\s|-]+$/, '') : title;
            const foundToners = new Map();
            const recordLevel = (text, percentage) => {
                const color = getTonerColor(text);
                if (color && !NON_TONER_SUPPLY.test(text) && !foundToners.has(color) &&
                    Number.isInteger(percentage) && percentage >= 0 && percentage <= 100) {
                    foundToners.set(color, percentage);
                }
            };

            // Prefer the smallest row/container holding one color and one percentage.
            for (const el of $('tr, td, div, span, p, li').toArray().reverse()) {
                const text = $(el).text();
                const matches = [...text.matchAll(/%\s*(-?\d+(?:\.\d+)?)|(?<![\d.])(-?\d+(?:\.\d+)?)\s*%/g)];
                if (matches.length === 1) {
                    recordLevel(text, Number(matches[0][1] ?? matches[0][2]));
                }
            }
            $('[style]').each((_i, el) => {
                const match = ($(el).attr('style') || '').match(/(?:^|;)\s*width\s*:\s*(\d+)%/i);
                if (!match) return;
                for (const parent of $(el).parents('tr, td, div, li').toArray()) {
                    const text = $(parent).text();
                    if (getTonerColor(text)) {
                        recordLevel(text, Number(match[1]));
                        break;
                    }
                }
            });

            lastData = {
                model,
                toners: Object.keys(TONER_COLOR_PATTERNS).filter(color => foundToners.has(color))
                    .map(color => ({ color, level: foundToners.get(color), maxCapacity: 100 })),
                pageCount: 0
            };
            if (lastData.toners.length > 0) return lastData;
        }
        if (lastData) return lastData;
        throw new Error(`Web scraping failed: ${lastError ? lastError.message : 'No response'}`);
    }

    async emitStats() {
        try {
            const devicesTotal = await pool.query('SELECT COUNT(*) as count FROM devices');
            const devicesOnline = await pool.query(`SELECT COUNT(*) as count FROM devices WHERE status = 'online'`);
            const devicesOffline = await pool.query(`SELECT COUNT(*) as count FROM devices WHERE status = 'offline'`);
            const devicesWarning = await pool.query(`SELECT COUNT(*) as count FROM devices WHERE status = 'warning'`);
            
            const printersResult = await pool.query(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN is_online = 1 THEN 1 ELSE 0 END) as online,
                    SUM(CASE WHEN has_paper_jam = 1 THEN 1 ELSE 0 END) as jam
                FROM printers
            `);
            
            const pStats = printersResult.rows[0];

            this.io.emit('dashboard:stats', {
                devices: {
                    total: parseInt(devicesTotal.rows[0].count),
                    online: parseInt(devicesOnline.rows[0].count),
                    offline: parseInt(devicesOffline.rows[0].count),
                    warning: parseInt(devicesWarning.rows[0].count),
                },
                printers: {
                    total: parseInt(pStats.total || 0),
                    online: parseInt(pStats.online || 0),
                    jam: parseInt(pStats.jam || 0)
                },
                lastScanTime: new Date().toISOString()
            });
        } catch (err) {
            console.error('❌ Stats emit error:', err.message);
        }
    }
}

module.exports = PrinterMonitorService;
