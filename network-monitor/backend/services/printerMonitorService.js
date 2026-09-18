const snmp = require('net-snmp');
const axios = require('axios');
const cheerio = require('cheerio');
const { pool } = require('../db/connection');

// Standard Printer MIB OIDs
const OID_SUPPLY_DESCRIPTION = "1.3.6.1.2.1.43.11.1.1.6";
const OID_SUPPLY_MAX_CAPACITY = "1.3.6.1.2.1.43.11.1.1.8";
const OID_SUPPLY_CURRENT_LEVEL = "1.3.6.1.2.1.43.11.1.1.9";
const OID_PRINTER_MODEL = "1.3.6.1.2.1.25.3.2.1.3.1";
        
// Printer status OIDs
const OID_PRINTER_STATUS = "1.3.6.1.2.1.25.3.5.1.1.1"; // hrPrinterStatus
const OID_PRINTER_ERROR = "1.3.6.1.2.1.25.3.5.1.2.1"; // hrPrinterDetectedErrorState
        
// Page count OIDs
const OID_PAGE_COUNT = "1.3.6.1.2.1.43.10.2.1.4.1.1"; // prtMarkerLifeCount
const OID_PAGE_COUNT_ALT = "1.3.6.1.4.1.11.2.3.9.4.2.1.4.1.2.5"; // HP specific page count

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

            try {
                // Try SNMP first
                const snmpData = await this.getSnmpInfo(printer.ip_address);
                isOnline = true;
                model = snmpData.model || model;
                statusText = snmpData.statusText || statusText;
                hasJam = snmpData.hasJam || hasJam;
                pageCount = snmpData.pageCount || pageCount;
                toners = snmpData.toners || [];
            } catch (err) {
                console.log(`   ⚠️ SNMP failed for ${printer.ip_address}, falling back to Web Scraper...`);
                // Fallback to Web Scraper if SNMP fails or is disabled
                try {
                    const webData = await this.getWebScraperInfo(printer.ip_address);
                    isOnline = true;
                    model = webData.model || model;
                    toners = webData.toners || toners;
                    // We keep the old page count and status if the web scraper doesn't find them
                    if (webData.pageCount) pageCount = webData.pageCount;
                } catch (webErr) {
                    errorMessage = `Connection failed (SNMP & Web)`;
                    isOnline = false;
                }
            }

            // Update Database with scan results
            await pool.query(
                `UPDATE printers SET
                    is_online = $1,
                    model = CASE WHEN $2 != '' THEN $2 ELSE model END,
                    status_text = $3,
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

                // Toner düşük seviye kontrolü (<%10)
                if (isOnline && toners.length > 0) {
                    const lowToners = toners.filter(t => {
                        const maxCap = t.maxCapacity || 100;
                        return maxCap > 0 && (t.level / maxCap) * 100 < 10;
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

    // --- SNMP LOGIC ---
    getSnmpInfo(ipAddress) {
        return new Promise((resolve, reject) => {
            const session = snmp.createSession(ipAddress, "public", {
                timeout: 3000,
                retries: 1,
                version: snmp.Version1
            });

            const data = {
                model: '',
                statusText: 'Ready',
                hasJam: false,
                pageCount: 0,
                toners: []
            };

            const walkSnmp = (oid) => {
                return new Promise((resWalk) => {
                    const results = [];
                    session.subtree(oid, (varbinds) => {
                        for (let i = 0; i < varbinds.length; i++) {
                            if (!snmp.isVarbindError(varbinds[i])) {
                                let val = varbinds[i].value;
                                if (Buffer.isBuffer(val)) val = val.toString();
                                results.push(val);
                            }
                        }
                    }, (error) => {
                        resWalk(results); // Ignore errors to continue processing
                    });
                });
            };

            const getSnmpValue = (oid) => {
                return new Promise((resGet) => {
                    session.get([oid], (error, varbinds) => {
                        if (error || snmp.isVarbindError(varbinds[0])) {
                            resGet(null);
                        } else {
                            let val = varbinds[0].value;
                            if (Buffer.isBuffer(val)) val = val.toString();
                            resGet(val);
                        }
                    });
                });
            };

            (async () => {
                try {
                    const modelVal = await getSnmpValue(OID_PRINTER_MODEL);
                    if (modelVal === null) {
                        throw new Error("Printer not responding to SNMP");
                    }
                    data.model = modelVal;

                    // Toners
                    const descriptions = await walkSnmp(OID_SUPPLY_DESCRIPTION);
                    const maxCapacities = await walkSnmp(OID_SUPPLY_MAX_CAPACITY);
                    const currentLevels = await walkSnmp(OID_SUPPLY_CURRENT_LEVEL);

                    for (let i = 0; i < descriptions.length; i++) {
                        let desc = descriptions[i] || '';
                        // Temizleme (Clean up names like "Black Cartridge HP...")
                        if (desc.toLowerCase().includes('black')) desc = 'Black';
                        else if (desc.toLowerCase().includes('cyan')) desc = 'Cyan';
                        else if (desc.toLowerCase().includes('magenta')) desc = 'Magenta';
                        else if (desc.toLowerCase().includes('yellow')) desc = 'Yellow';

                        const maxCap = i < maxCapacities.length ? parseInt(maxCapacities[i]) : 100;
                        const curr = i < currentLevels.length ? parseInt(currentLevels[i]) : 0;
                        
                        // Ignore non-toner supplies that might have -2 or -3 as max capacity
                        if (maxCap > 0 && curr >= 0) {
                            data.toners.push({
                                color: desc,
                                maxCapacity: maxCap,
                                level: curr
                            });
                        }
                    }

                    // Page Count
                    let pc = await getSnmpValue(OID_PAGE_COUNT);
                    if (!pc) pc = await getSnmpValue(OID_PAGE_COUNT_ALT);
                    if (pc) data.pageCount = parseInt(pc);

                    // Printer Status & Errors
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
                        const s = parseInt(pStatus);
                        if (s === 3) data.statusText = 'Ready';
                        else if (s === 4) data.statusText = 'Printing';
                        else if (s === 5) data.statusText = 'Warming Up';
                    }

                    session.close();
                    resolve(data);
                } catch (e) {
                    session.close();
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

        const fetchHtml = async (url) => {
            const res = await axios.get(url, { timeout: 5000 });
            return res.data;
        };

        let html = '';
        try {
            html = await fetchHtml(`http://${ipAddress}/info_suppliesStatus.html`);
        } catch (e) {
            try {
                html = await fetchHtml(`http://${ipAddress}/info_deviceStatus.html`);
            } catch (e2) {
                throw new Error('Web scraping failed');
            }
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

        // Toner Parse
        const percentagePattern = /[%](\d+)|\b(\d+)[%]/i;
        const colorPatterns = {
            'Black': ['black', 'siyah', 'k ', 'bk'],
            'Cyan': ['cyan', 'cam', 'c '],
            'Magenta': ['magenta', 'macenta', 'm '],
            'Yellow': ['yellow', 'sarı', 'y ']
        };

        const foundToners = {};

        // Helper to check color
        const matchColor = (text) => {
            const t = text.toLowerCase();
            for (const [color, keywords] of Object.entries(colorPatterns)) {
                if (keywords.some(k => t.includes(k))) return color;
            }
            return null;
        };

        // Method 1: Search by td/div/span text content
        $('td, div, span').each((i, el) => {
            const text = $(el).text();
            const match = text.match(percentagePattern);
            if (match) {
                const percentage = parseInt(match[1] || match[2]);
                const c = matchColor(text);
                if (c && !foundToners[c]) {
                    foundToners[c] = percentage;
                }
            }
        });

        // Method 2: Search by style width (progress bars)
        $('[style]').each((i, el) => {
            const style = $(el).attr('style') || '';
            const match = style.match(/width:\s*(\d+)%/i);
            if (match) {
                const percentage = parseInt(match[1]);
                const parentText = $(el).parent().text();
                const c = matchColor(parentText);
                if (c && !foundToners[c]) {
                    foundToners[c] = percentage;
                }
            }
        });

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
