const snmp = require('net-snmp');
const axios = require('axios');
const cheerio = require('cheerio');
const { pool } = require('../db/connection');
const { getLowTonerThreshold } = require('../utils/tonerConfig');

// Standard Printer MIB OIDs (RFC 3805 / RFC 1759)
const OID_SUPPLY_DESCRIPTION = "1.3.6.1.2.1.43.11.1.1.6";
const OID_SUPPLY_TYPE = "1.3.6.1.2.1.43.11.1.1.5";
const OID_SUPPLY_MAX_CAPACITY = "1.3.6.1.2.1.43.11.1.1.8";
const OID_SUPPLY_CURRENT_LEVEL = "1.3.6.1.2.1.43.11.1.1.9";
const OID_SUPPLY_COLORANT_INDEX = "1.3.6.1.2.1.43.11.1.1.3";
const OID_MARKER_COLORANT_VALUE = "1.3.6.1.2.1.43.12.1.1.4";

// Model OID candidates
const OID_PRINTER_MODEL = "1.3.6.1.2.1.25.3.2.1.3.1"; // hrDeviceDescr.1
const OID_PRINTER_MODEL_ALT = "1.3.6.1.2.1.25.3.2.1.3.2"; // hrDeviceDescr.2
const OID_SYS_DESCR = "1.3.6.1.2.1.1.1.0"; // RFC 1213 sysDescr
const OID_PRINTER_NAME_MIB = "1.3.6.1.2.1.43.5.1.1.16.1"; // prtGeneralPrinterName.1

// Printer status OIDs
const OID_PRINTER_STATUS = "1.3.6.1.2.1.25.3.5.1.1.1"; // hrPrinterStatus
const OID_PRINTER_ERROR = "1.3.6.1.2.1.25.3.5.1.2.1"; // hrPrinterDetectedErrorState

// Page count OIDs
const OID_PAGE_COUNT = "1.3.6.1.2.1.43.10.2.1.4.1.1"; // prtMarkerLifeCount
const OID_PAGE_COUNT_ALT = "1.3.6.1.4.1.11.2.3.9.4.2.1.4.1.2.5"; // HP specific page count
const OID_PAGE_COUNT_ALT2 = "1.3.6.1.2.1.43.10.2.1.4.1"; // Alternative MarkerLifeCount

/**
 * Resolves toner / supply color name and filters out non-toner supplies
 * (waste containers, drum units, fusers, transfer belts).
 * Supports RFC 3805 colorant values and printer cartridge naming patterns
 * (Kyocera TK-*, Canon CRG-*, Brother TN-*, HP, Xerox, Ricoh).
 */
function resolveSupplyColor(desc, supplyType, index, totalConsumableSupplies, colorantValue = null) {
    const raw = (desc || '').toString().trim();
    const lower = raw.toLowerCase();
    const colorantStr = (colorantValue || '').toString().trim().toLowerCase();

    // 1. Exclude non-toner supplies (waste toner, drum units, fusers, maintenance boxes)
    // RFC 3805 prtMarkerSuppliesType: 4=wasteToner, 8=wasteInk, 9=opc, 15=fuser, 16=cleaningContainer, 17=fuserCleaningPad, 18=transferUnit
    if (supplyType === 4 || supplyType === 8 || supplyType === 9 || supplyType === 15 || supplyType === 16 || supplyType === 17 || supplyType === 18) {
        return null;
    }
    if (
        lower.includes('waste') || lower.includes('atık') || lower.includes('atik') ||
        lower.includes('drum') || lower.includes('görüntüleme') || lower.includes('goruntuleme') ||
        lower.includes('fuser') || lower.includes('fırın') || lower.includes('firin') ||
        lower.includes('transfer') || lower.includes('belt') || lower.includes('kayış') ||
        lower.includes('roller') || lower.includes('maintenance') || lower.includes('bakım')
    ) {
        return null;
    }

    // 2. Check RFC 3805 prtMarkerColorantValue if available
    if (colorantStr) {
        if (colorantStr.includes('black') || colorantStr === 'k' || colorantStr === 'bk') return 'Black';
        if (colorantStr.includes('cyan') || colorantStr === 'c') return 'Cyan';
        if (colorantStr.includes('magenta') || colorantStr === 'm') return 'Magenta';
        if (colorantStr.includes('yellow') || colorantStr === 'y') return 'Yellow';
    }

    // 3. Check explicit full color names (Turkish, English, German, French)
    if (lower.includes('magenta') || lower.includes('macenta') || lower.includes('kırmızı') || lower.includes('kirmizi') || lower.includes('pembe')) {
        return 'Magenta';
    }
    if (lower.includes('cyan') || lower.includes('mavi') || lower.includes('gök') || lower.includes('cam')) {
        return 'Cyan';
    }
    if (lower.includes('yellow') || lower.includes('sarı') || lower.includes('sari') || lower.includes('gelb') || lower.includes('jaune')) {
        return 'Yellow';
    }
    if (lower.includes('black') || lower.includes('siyah') || lower.includes('schwarz') || lower.includes('noir')) {
        return 'Black';
    }

    // 4. Monochrome printer handling: If only 1 consumable supply exists in the printer, it's Black
    if (totalConsumableSupplies === 1) {
        return 'Black';
    }

    // 5. Check model prefixes, suffixes, and cartridge codes for color printers
    const isBlack = /(?:tk|crg|tn|clt|cf|ce|cb|cc|q)[-_0-9]+k\b/i.test(raw) ||
        /[_-](?:k|bk)$/i.test(raw) ||
        /\((?:k|bk)\)/i.test(raw) ||
        /\[(?:k|bk)\]/i.test(raw) ||
        /(?:^|\s)(?:k|bk)(?:$|\s|:)/i.test(raw);
    if (isBlack) return 'Black';

    const isCyan = /(?:tk|crg|tn|clt|cf|ce|cb|cc|q)[-_0-9]+c\b/i.test(raw) ||
        /[_-]c$/i.test(raw) ||
        /\(c\)/i.test(raw) ||
        /\[c\]/i.test(raw) ||
        /(?:^|\s)c(?:$|\s|:)/i.test(raw);
    if (isCyan) return 'Cyan';

    const isMagenta = /(?:tk|crg|tn|clt|cf|ce|cb|cc|q)[-_0-9]+m\b/i.test(raw) ||
        /[_-]m$/i.test(raw) ||
        /\(m\)/i.test(raw) ||
        /\[m\]/i.test(raw) ||
        /(?:^|\s)m(?:$|\s|:)/i.test(raw);
    if (isMagenta) return 'Magenta';

    const isYellow = /(?:tk|crg|tn|clt|cf|ce|cb|cc|q)[-_0-9]+y\b/i.test(raw) ||
        /[_-]y$/i.test(raw) ||
        /\(y\)/i.test(raw) ||
        /\[y\]/i.test(raw) ||
        /(?:^|\s)y(?:$|\s|:)/i.test(raw);
    if (isYellow) return 'Yellow';

    // 6. Standard 4-color laser printer fallback if supplies have generic numbering
    if (totalConsumableSupplies === 4 && (!raw || lower.includes('supply') || lower.includes('toner') || lower.includes('cartridge'))) {
        const cmykOrder = ['Black', 'Cyan', 'Magenta', 'Yellow'];
        if (index >= 1 && index <= 4) {
            return cmykOrder[index - 1];
        }
    }

    // 7. Retain cleaned cartridge name or supply label
    if (lower.includes('toner') || lower.includes('cartridge') || lower.includes('kartuş') || lower.includes('kartus')) {
        return raw.length > 24 ? `Toner ${index}` : raw;
    }

    return raw || `Supply ${index}`;
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

    /**
     * Scans a single printer on demand by ID and returns its updated record.
     */
    async scanSinglePrinter(printerId) {
        const id = parseInt(printerId, 10);
        if (isNaN(id)) throw new Error('Invalid printer ID');

        const result = await pool.query('SELECT * FROM printers WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            throw new Error('Printer not found');
        }

        const printer = result.rows[0];
        const updated = await this.scanPrinter(printer);
        return updated;
    }

    async scanPrinter(printer) {
        if (!printer || !printer.ip_address) return null;

        // Prevent duplicate simultaneous scans of the same target
        if (this.activeScans.has(printer.id)) {
            return null;
        }
        this.activeScans.add(printer.id);

        try {
            let isOnline = false;
            let model = printer.model || '';
            let statusText = printer.printer_status || 'Ready';
            let hasJam = false;
            let pageCount = printer.total_page_count || 0;
            let toners = [];
            let errorMessage = '';

            try {
                // Try SNMP first (with per-printer config or centralized SNMP_COMMUNITY)
                const snmpData = await this.getSnmpInfo(printer.ip_address, printer);
                isOnline = true;
                model = snmpData.model || model;
                statusText = snmpData.statusText || statusText;
                hasJam = snmpData.hasJam || hasJam;
                pageCount = snmpData.pageCount || pageCount;
                toners = snmpData.toners || [];
            } catch (err) {
                console.log(`   ⚠️ SNMP failed for ${printer.ip_address} (${err.message}), falling back to Web Scraper...`);
                // Fallback to Web Scraper if SNMP fails or is disabled
                try {
                    const webData = await this.getWebScraperInfo(printer.ip_address);
                    isOnline = true;
                    model = webData.model || model;
                    toners = webData.toners || toners;
                    if (webData.pageCount) pageCount = webData.pageCount;
                } catch (_webErr) {
                    errorMessage = `Connection failed (SNMP & Web: ${err.message})`;
                    isOnline = false;
                }
            }

            // Fallback to Web Scraper if SNMP succeeded but found no toner supplies
            if (isOnline && toners.length === 0) {
                try {
                    const webData = await this.getWebScraperInfo(printer.ip_address);
                    if (webData && Array.isArray(webData.toners) && webData.toners.length > 0) {
                        toners = webData.toners;
                    }
                    if (!model && webData.model) model = webData.model;
                    if (!pageCount && webData.pageCount) pageCount = webData.pageCount;
                } catch (_) {
                    // Non-fatal if web status page does not provide toners
                }
            }

            // Update Database with scan results (using canonical printer_status column)
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
                           SELECT pt.id, pt.color, pt.level, pt.max_capacity, pt.pages_printed
                           FROM printer_toners pt
                           WHERE pt.printer_id = p.id
                           FOR JSON PATH
                       ) as toners
                FROM printers p
                WHERE p.id = $1
            `, [printer.id]);

            if (fullPrinterRes.rows.length > 0) {
                const fullPrinter = fullPrinterRes.rows[0];
                fullPrinter.toners = fullPrinter.toners ? JSON.parse(fullPrinter.toners) : [];
                
                if (this.io && typeof this.io.emit === 'function') {
                    this.io.emit('printer:updated', fullPrinter);

                    // Toner düşük seviye kontrolü (merkezi eşik: LOW_TONER_THRESHOLD_PERCENT)
                    if (isOnline && toners.length > 0) {
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

                return fullPrinter;
            }

            return null;
        } catch (dbErr) {
            console.error(`❌ DB Update failed for printer ${printer.ip_address}:`, dbErr.message);
            return null;
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
    createSnmpSession(ipAddress, printerConfig = {}, versionOverride = null) {
        const isProd = process.env.NODE_ENV === 'production';
        const version = versionOverride || printerConfig.snmp_version || process.env.SNMP_VERSION || '1';
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
        const primaryVersion = printerConfig.snmp_version || process.env.SNMP_VERSION || '1';

        try {
            return await this._executeSnmpProbe(ipAddress, printerConfig, primaryVersion);
        } catch (primaryErr) {
            // Automatic fallback between SNMPv1 and SNMPv2c
            const fallbackVersion = (primaryVersion === '1' || primaryVersion === 1) ? '2c' : '1';
            try {
                return await this._executeSnmpProbe(ipAddress, printerConfig, fallbackVersion);
            } catch (_) {
                throw primaryErr;
            }
        }
    }

    _executeSnmpProbe(ipAddress, printerConfig = {}, versionOverride = null) {
        return new Promise((resolve, reject) => {
            let session;
            try {
                session = this.createSnmpSession(ipAddress, printerConfig, versionOverride);
            } catch (sessionErr) {
                return reject(sessionErr);
            }

            const data = {
                model: '',
                statusText: 'Ready',
                hasJam: false,
                pageCount: 0,
                toners: []
            };

            const walkSubtreeMap = (baseOid, timeoutMs = 4000) => {
                return new Promise((resWalk) => {
                    const map = {};
                    let finished = false;
                    const timer = setTimeout(() => {
                        if (!finished) {
                            finished = true;
                            resWalk(map);
                        }
                    }, timeoutMs);

                    try {
                        session.subtree(baseOid, 20, (varbinds) => {
                            if (finished) return true;
                            for (let i = 0; i < varbinds.length; i++) {
                                const vb = varbinds[i];
                                if (!snmp.isVarbindError(vb)) {
                                    let val = vb.value;
                                    if (Buffer.isBuffer(val)) {
                                        val = val.toString('utf8').replace(/\0/g, '').trim();
                                    }
                                    const suffix = vb.oid.startsWith(baseOid + '.')
                                        ? vb.oid.slice(baseOid.length + 1)
                                        : vb.oid;
                                    map[suffix] = val;
                                }
                            }
                        }, () => {
                            if (!finished) {
                                finished = true;
                                clearTimeout(timer);
                                resWalk(map);
                            }
                        });
                    } catch (_) {
                        if (!finished) {
                            finished = true;
                            clearTimeout(timer);
                            resWalk(map);
                        }
                    }
                });
            };

            const getSnmpValue = (oid, timeoutMs = 2500) => {
                return new Promise((resGet) => {
                    let finished = false;
                    const timer = setTimeout(() => {
                        if (!finished) {
                            finished = true;
                            resGet(null);
                        }
                    }, timeoutMs);

                    try {
                        session.get([oid], (error, varbinds) => {
                            if (!finished) {
                                finished = true;
                                clearTimeout(timer);
                                if (error || !varbinds || !varbinds[0] || snmp.isVarbindError(varbinds[0])) {
                                    resGet(null);
                                } else {
                                    let val = varbinds[0].value;
                                    if (Buffer.isBuffer(val)) {
                                        val = val.toString('utf8').replace(/\0/g, '').trim();
                                    }
                                    resGet(val);
                                }
                            }
                        });
                    } catch (_) {
                        if (!finished) {
                            finished = true;
                            clearTimeout(timer);
                            resGet(null);
                        }
                    }
                });
            };

            (async () => {
                try {
                    let hasAnyResponse = false;

                    // 1. Model Resolution (Concurrently query model candidates)
                    const [model1, sysDescr, modelNameMib, model2] = await Promise.all([
                        getSnmpValue(OID_PRINTER_MODEL),
                        getSnmpValue(OID_SYS_DESCR),
                        getSnmpValue(OID_PRINTER_NAME_MIB),
                        getSnmpValue(OID_PRINTER_MODEL_ALT)
                    ]);

                    const resolvedModel = model1 || sysDescr || modelNameMib || model2;
                    if (resolvedModel) {
                        hasAnyResponse = true;
                        data.model = resolvedModel.toString().trim();
                    }

                    // 2. Supply / Toner Information (RFC 3805 Printer MIB)
                    // Concurrently fetch description, capacities, levels, types and colorant tables
                    const [descMap, maxCapMap, levelMap, typeMap, colorantIndexMap, markerColorantMap] = await Promise.all([
                        walkSubtreeMap(OID_SUPPLY_DESCRIPTION),
                        walkSubtreeMap(OID_SUPPLY_MAX_CAPACITY),
                        walkSubtreeMap(OID_SUPPLY_CURRENT_LEVEL),
                        walkSubtreeMap(OID_SUPPLY_TYPE),
                        walkSubtreeMap(OID_SUPPLY_COLORANT_INDEX),
                        walkSubtreeMap(OID_MARKER_COLORANT_VALUE)
                    ]);

                    const allSuffixes = Array.from(new Set([
                        ...Object.keys(descMap),
                        ...Object.keys(levelMap)
                    ]));

                    if (allSuffixes.length > 0) {
                        hasAnyResponse = true;
                    }

                    // Count consumable supplies first (excluding waste boxes, drums, fusers)
                    let consumableCount = 0;
                    for (const sfx of allSuffixes) {
                        const rawType = typeMap[sfx] !== undefined ? parseInt(typeMap[sfx], 10) : null;
                        const rawDesc = descMap[sfx] || '';
                        const testColor = resolveSupplyColor(rawDesc, rawType, 1, 99);
                        if (testColor !== null) {
                            consumableCount++;
                        }
                    }

                    const extractedSupplies = [];

                    for (let i = 0; i < allSuffixes.length; i++) {
                        const sfx = allSuffixes[i];
                        const rawDesc = descMap[sfx] || '';
                        const rawType = typeMap[sfx] !== undefined ? parseInt(typeMap[sfx], 10) : null;
                        const rawMax = maxCapMap[sfx] !== undefined ? parseInt(maxCapMap[sfx], 10) : 100;
                        const rawLevel = levelMap[sfx] !== undefined ? parseInt(levelMap[sfx], 10) : 0;

                        // Check colorant value if indexed in marker table
                        let colorantVal = null;
                        const cIdx = colorantIndexMap[sfx];
                        if (cIdx !== undefined && markerColorantMap) {
                            colorantVal = markerColorantMap[cIdx] || markerColorantMap[`1.${cIdx}`] || null;
                        }

                        // Identify supply color or type (filtering out waste boxes, drums, fusers)
                        const colorName = resolveSupplyColor(rawDesc, rawType, i + 1, consumableCount, colorantVal);
                        if (!colorName) {
                            continue;
                        }

                        let maxCap = isNaN(rawMax) ? 100 : rawMax;
                        let curr = isNaN(rawLevel) ? 0 : rawLevel;

                        // Normalize RFC 3805 capacity and levels
                        if (maxCap <= 0) {
                            // Unknown max capacity (-1 or -2)
                            if (curr >= 0 && curr <= 100) {
                                maxCap = 100;
                            } else if (curr === -3) {
                                maxCap = 100;
                                curr = 100;
                            } else if (curr > 100) {
                                maxCap = curr;
                            } else {
                                maxCap = 100;
                                curr = (curr < 0) ? 100 : Math.max(0, curr);
                            }
                        } else if (curr === -3) {
                            // RFC 3805: -3 means some remaining (OK level)
                            curr = maxCap;
                        } else if (curr === -2 || curr === -1) {
                            // -2 = unknown, -1 = other: sensor cannot measure, treat as OK/full
                            curr = maxCap;
                        } else if (curr < 0) {
                            // Unknown or empty
                            curr = 0;
                        }

                        // Ensure level does not exceed max capacity
                        if (curr > maxCap && maxCap > 0) {
                            curr = maxCap;
                        }

                        extractedSupplies.push({
                            color: colorName,
                            maxCapacity: maxCap,
                            level: curr
                        });
                    }

                    // Deduplicate supplies by color
                    const uniqueToners = [];
                    const seenColors = new Set();
                    for (const s of extractedSupplies) {
                        if (!seenColors.has(s.color)) {
                            seenColors.add(s.color);
                            uniqueToners.push(s);
                        }
                    }
                    data.toners = uniqueToners;

                    // 3. Page Count (Concurrently query page count candidates)
                    const [pc1, pc2, pc3, pStatus, pError] = await Promise.all([
                        getSnmpValue(OID_PAGE_COUNT),
                        getSnmpValue(OID_PAGE_COUNT_ALT),
                        getSnmpValue(OID_PAGE_COUNT_ALT2),
                        getSnmpValue(OID_PRINTER_STATUS),
                        getSnmpValue(OID_PRINTER_ERROR)
                    ]);

                    const validPc = pc1 || pc2 || pc3;
                    if (validPc) {
                        hasAnyResponse = true;
                        data.pageCount = parseInt(validPc, 10) || 0;
                    }

                    // 4. Printer Status & Errors
                    if (pStatus || pError) {
                        hasAnyResponse = true;
                    }

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
                        const s = parseInt(pStatus, 10);
                        if (s === 3) data.statusText = 'Ready';
                        else if (s === 4) data.statusText = 'Printing';
                        else if (s === 5) data.statusText = 'Warming Up';
                    }

                    session.close();

                    if (!hasAnyResponse) {
                        throw new Error("No SNMP response received from printer");
                    }

                    resolve(data);
                } catch (e) {
                    if (session && typeof session.close === 'function') {
                        try { session.close(); } catch (_) {}
                    }
                    reject(e);
                }
            })();
        });
    }

    // --- WEB SCRAPER LOGIC (Fallback) ---
    async getWebScraperInfo(ipAddress) {
        const data = {
            model: '',
            toners: [],
            pageCount: 0
        };

        const axiosInstance = axios.create({
            timeout: 2500,
            maxRedirects: 5,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) OnOffDash-PrinterMonitor/2.0'
            }
        });

        const candidatePaths = [
            `http://${ipAddress}/info_suppliesStatus.html`,
            `http://${ipAddress}/info_deviceStatus.html`,
            `http://${ipAddress}/`,
            `http://${ipAddress}/general/status.html`,
            `http://${ipAddress}/startwlm/HServer?searchJob=INFO`,
            `http://${ipAddress}/status.html`,
            `http://${ipAddress}/home.htm`,
            `http://${ipAddress}/hp/device/this.LCDispatcher?nav=hp.Supplies`,
            `http://${ipAddress}/sws/app/information/supplies/supplies.view`,
            `http://${ipAddress}/wsetup.html`,
            `http://${ipAddress}/main.html`,
            `http://${ipAddress}/printer/status.html`,
            `http://${ipAddress}/supplies.html`,
            `http://${ipAddress}/status/supplies.html`
        ];

        let html = '';
        for (const url of candidatePaths) {
            try {
                const res = await axiosInstance.get(url);
                if (res.data && typeof res.data === 'string' && res.data.length > 50) {
                    html = res.data;
                    break;
                }
            } catch (_) {}
        }

        if (!html) {
            throw new Error('Web scraping failed: no responsive status page found');
        }

        const $ = cheerio.load(html);
        
        // Model
        const title = $('title').text() || '';
        const parts = title.split(/\s+/).filter(Boolean);
        if (parts.length >= 4) {
            data.model = parts.slice(0, -1).join(' '); // Remove the IP part
        } else {
            data.model = title.trim();
        }

        // Page Count
        const bodyText = $('body').text() || '';
        const pcMatch = bodyText.match(/(?:page count|sayfa say[ıi]s[ıi]|total impressions|total pages)[\s:]*([0-9,.]+)/i);
        if (pcMatch) {
            const rawPc = pcMatch[1].replace(/[,.]/g, '');
            const parsedPc = parseInt(rawPc, 10);
            if (!isNaN(parsedPc) && parsedPc > 0) {
                data.pageCount = parsedPc;
            }
        }

        // Toner Parse
        const percentagePattern = /[%]\s*(\d+)|\b(\d+)\s*[%]/i;
        const colorPatterns = {
            'Black': ['black', 'siyah', 'schwarz', 'noir', 'k ', 'bk', 'k/bk', '(k)', 'k:'],
            'Cyan': ['cyan', 'cam', 'mavi', 'gök', 'c ', '(c)', 'c:'],
            'Magenta': ['magenta', 'macenta', 'kırmızı', 'kirmizi', 'pembe', 'm ', '(m)', 'm:'],
            'Yellow': ['yellow', 'sarı', 'sari', 'gelb', 'jaune', 'y ', '(y)', 'y:']
        };

        const foundToners = {};
        const foundPercentages = [];

        // Helper to check color
        const matchColor = (text) => {
            const t = text.toLowerCase();
            for (const [color, keywords] of Object.entries(colorPatterns)) {
                if (keywords.some(k => t.includes(k))) return color;
            }
            return null;
        };

        // Method 1: Search by text content
        $('td, div, span, p').each((i, el) => {
            const text = $(el).text().trim();
            if (text.length > 120) return; // skip large parent containers
            const match = text.match(percentagePattern);
            if (match) {
                const percentage = parseInt(match[1] || match[2], 10);
                if (percentage >= 0 && percentage <= 100) {
                    foundPercentages.push(percentage);
                    const c = matchColor(text);
                    if (c && !foundToners[c]) {
                        foundToners[c] = percentage;
                    }
                }
            }
        });

        // Method 2: Search by style width (progress bars)
        $('[style]').each((i, el) => {
            const style = $(el).attr('style') || '';
            const match = style.match(/width:\s*(\d+(?:\.\d+)?)\s*%/i);
            if (match) {
                const percentage = Math.round(parseFloat(match[1]));
                if (percentage >= 0 && percentage <= 100) {
                    foundPercentages.push(percentage);
                    const parentText = $(el).parent().text() || $(el).attr('title') || '';
                    const c = matchColor(parentText);
                    if (c && !foundToners[c]) {
                        foundToners[c] = percentage;
                    }
                }
            }
        });

        // Method 3: Monochrome single toner fallback
        if (Object.keys(foundToners).length === 0 && foundPercentages.length > 0) {
            foundToners['Black'] = foundPercentages[0];
        }

        for (const [color, level] of Object.entries(foundToners)) {
            data.toners.push({
                color,
                level,
                maxCapacity: 100
            });
        }

        return data;
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

            const lowTonerThreshold = getLowTonerThreshold();
            const lowTonerResult = await pool.query(`
                SELECT COUNT(DISTINCT p.id) as count
                FROM printers p
                INNER JOIN printer_toners pt ON pt.printer_id = p.id
                WHERE p.is_online = 1
                  AND pt.max_capacity > 0
                  AND (CAST(pt.level AS FLOAT) / CAST(pt.max_capacity AS FLOAT)) * 100 < $1
            `, [lowTonerThreshold]);

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
                    jam: parseInt(pStats.jam || 0),
                    lowToner: parseInt(lowTonerResult.rows[0]?.count || 0)
                },
                lastScanTime: new Date().toISOString()
            });
        } catch (err) {
            console.error('❌ Stats emit error:', err.message);
        }
    }
}

PrinterMonitorService.resolveSupplyColor = resolveSupplyColor;

module.exports = PrinterMonitorService;
