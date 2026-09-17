const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');
const { readExcelRows, createExcelSingleSheet } = require('../utils/excelHelper');
const { requireRole } = require('../middleware/auth');
const { sanitizeRows } = require('../utils/excelSanitizer');

const MONTHS = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];

// Helper to normalize keys
function getNormalizedRow(row) {
    const norm = {};
    for (const key of Object.keys(row)) {
        const cleanKey = key.toLowerCase()
            .replace(/i̇/g, 'i')
            .replace(/ı/g, 'i')
            .replace(/ş/g, 's')
            .replace(/ğ/g, 'g')
            .replace(/ü/g, 'u')
            .replace(/ö/g, 'o')
            .replace(/ç/g, 'c')
            .replace(/\s+/g, ' ')
            .trim();
        norm[cleanKey] = row[key];
    }
    return norm;
}

// Helper for matching device hostname
async function getOrCreateDeviceIdByHostname(client, hostname) {
    if (!hostname) return null;
    const cleanHost = String(hostname).trim();
    if (!cleanHost || cleanHost.toLowerCase() === 'bilgisayar adi' || cleanHost === '—') return null;

    const cleanHostnameForMatching = (h) => String(h).trim().toLowerCase()
        .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
        .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/i̇/g, 'i')
        .split('.')[0].trim();

    const target = cleanHostnameForMatching(cleanHost);
    const res = await client.query("SELECT id, hostname, username FROM devices");
    
    // Match against hostname or username
    const match = res.rows.find(d => 
        cleanHostnameForMatching(d.hostname) === target || 
        (d.username && cleanHostnameForMatching(d.username) === target)
    );
    if (match) return match.id;

    // Check strict hostname match
    const checkRes = await client.query("SELECT id FROM devices WHERE hostname = $1", [cleanHost]);
    if (checkRes.rows.length > 0) return checkRes.rows[0].id;

    // Check strict username match
    const checkUserRes = await client.query("SELECT id FROM devices WHERE username = $1", [cleanHost]);
    if (checkUserRes.rows.length > 0) return checkUserRes.rows[0].id;

    // ONLY create virtual device if it looks like a valid hostname (no spaces, no commas)
    if (cleanHost.includes(' ') || cleanHost.includes(',') || cleanHost.length < 3 || cleanHost.length > 50) {
        return null;
    }

    // Create virtual device
    const ip = `sanal-${Math.floor(Math.random() * 900000 + 100000)}`;
    const insertRes = await client.query(
        `INSERT INTO devices (hostname, ip_address, status, department, os_name, pc_type) 
         OUTPUT INSERTED.id
         VALUES ($1, $2, 'offline', 'Bilinmeyen Bölüm', 'Windows', 'Masaüstü')`,
        [cleanHost, ip]
    );
    return insertRes.rows[0].id;
}

// Handler for fetching full grid data
async function handleGetGrid(req, res) {
    try {
        const result = await pool.query(
            `SELECT d.id, d.hostname, d.ip_address, d.department, m.month_name, m.is_completed
             FROM devices d
             LEFT JOIN device_maintenance m ON d.id = m.device_id AND m.year_val = 2026
             ORDER BY d.hostname ASC`
        );

        const devicesMap = {};
        for (const row of result.rows) {
            if (!devicesMap[row.id]) {
                const initMonths = {};
                MONTHS.forEach(m => { initMonths[m] = false; });
                devicesMap[row.id] = {
                    id: row.id,
                    hostname: row.hostname,
                    ip_address: row.ip_address,
                    department: row.department || '',
                    months: { ...initMonths },
                    maintenance: { ...initMonths }
                };
            }
            if (row.month_name) {
                const done = row.is_completed === true || row.is_completed === 1;
                devicesMap[row.id].months[row.month_name] = done;
                devicesMap[row.id].maintenance[row.month_name] = done;
            }
        }

        res.json(Object.values(devicesMap));
    } catch (err) {
        console.error('Error fetching maintenance grid:', err);
        res.status(500).json({ error: 'Bakım verileri yüklenemedi: ' + err.message });
    }
}

// GET /api/maintenance/export - Aylık periyodik bakım listesini Excel olarak dışa aktar
router.get('/export', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT d.id, d.hostname, d.ip_address, d.department, m.month_name, m.is_completed
             FROM devices d
             LEFT JOIN device_maintenance m ON d.id = m.device_id AND m.year_val = 2026
             ORDER BY d.hostname ASC`
        );

        const devicesMap = {};
        for (const row of result.rows) {
            if (!devicesMap[row.id]) {
                devicesMap[row.id] = {
                    hostname: row.hostname,
                    department: row.department || '',
                    maintenance: {}
                };
            }
            if (row.month_name) {
                devicesMap[row.id].maintenance[row.month_name] = row.is_completed === true || row.is_completed === 1;
            }
        }

        const excelRows = Object.values(devicesMap).map(d => {
            const rowData = {
                'Bilgisayar Adı': d.hostname || '',
                'Departman': d.department || ''
            };
            MONTHS.forEach(m => {
                rowData[m] = d.maintenance[m] ? 'Yapıldı' : 'Yok';
            });
            return rowData;
        });

        const buf = await createExcelSingleSheet("Bakım Tablosu", excelRows);
        res.setHeader('Content-Disposition', 'attachment; filename="Bakim_Tablosu_Export.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);
    } catch (err) {
        console.error('❌ Maintenance Export error:', err);
        res.status(500).json({ error: 'Excel dışa aktarma başarısız oldu: ' + err.message });
    }
});

// POST /api/maintenance/import - Bakım listesini Excel'den içe aktar
router.post('/import', requireRole('operator'), async (req, res) => {
    const client = await pool.connect();
    try {
        const { fileData } = req.body;
        if (!fileData) {
            return res.status(400).json({ error: 'fileData (Base64) gereklidir.' });
        }
        if (typeof fileData !== 'string' || fileData.length > 14 * 1024 * 1024) {
            return res.status(413).json({ error: 'Dosya boyutu çok büyük (Maksimum 10MB).' });
        }

        const buffer = Buffer.from(fileData, 'base64');
        const rawRows = await readExcelRows(buffer);

        await client.query("BEGIN");

        const months = [
            { key: 'ocak', name: 'Ocak' },
            { key: 'subat', name: 'Şubat' },
            { key: 'mart', name: 'Mart' },
            { key: 'nisan', name: 'Nisan' },
            { key: 'mayis', name: 'Mayıs' },
            { key: 'haziran', name: 'Haziran' },
            { key: 'temmuz', name: 'Temmuz' },
            { key: 'agustos', name: 'Ağustos' },
            { key: 'eylul', name: 'Eylül' },
            { key: 'ekim', name: 'Ekim' },
            { key: 'kasim', name: 'Kasım' },
            { key: 'aralik', name: 'Aralık' }
        ];

        let updatedCount = 0;

        for (const rawRow of rawRows) {
            const row = getNormalizedRow(rawRow);
            const hostname = row['bilgisayar adi'] || row['hostname'] || row['bilgisayar'];
            if (!hostname) continue;

            const deviceId = await getOrCreateDeviceIdByHostname(client, hostname);
            if (!deviceId) continue;

            for (const month of months) {
                const rawVal = row[month.key];
                let isCompleted = 0;
                if (rawVal !== undefined && rawVal !== null) {
                    const strVal = String(rawVal).trim().toLowerCase();
                    if (strVal === 'yapildi' || strVal === 'yapıldı' || strVal === '1' || strVal === 'true' || strVal === 'yes' || strVal === 'evet') {
                        isCompleted = 1;
                    }
                }

                await client.query(
                    `MERGE INTO device_maintenance AS target
                     USING (VALUES ($1, $2, $3, 2026)) AS source (device_id, month_name, is_completed, year_val)
                     ON target.device_id = source.device_id AND target.month_name = source.month_name AND target.year_val = source.year_val
                     WHEN MATCHED THEN
                         UPDATE SET is_completed = source.is_completed
                     WHEN NOT MATCHED THEN
                         INSERT (device_id, month_name, is_completed, year_val)
                         VALUES (source.device_id, source.month_name, source.is_completed, source.year_val);`,
                    [deviceId, month.name, isCompleted]
                );
            }
            updatedCount++;
        }

        await client.query("COMMIT");
        res.json({ success: true, count: updatedCount });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error('❌ Maintenance Import error:', err);
        res.status(500).json({ error: 'Excel içe aktarma başarısız oldu: ' + err.message });
    } finally {
        client.release();
    }
});

// GET /api/maintenance/grid — Grid verisi (öncelikli rota)
router.get('/grid', handleGetGrid);

// GET /api/maintenance — Tüm cihazların bakım tablosu
router.get('/', handleGetGrid);

// POST /api/maintenance/toggle — Bir cihazın belirli bir ay için bakım durumunu değiştir
router.post('/toggle', requireRole('operator'), async (req, res) => {
    try {
        const { device_id, month_name, is_completed } = req.body;

        if (!device_id || !month_name) {
            return res.status(400).json({ error: 'device_id ve month_name zorunludur.' });
        }

        const compVal = (is_completed === true || is_completed === 1 || is_completed === 'true') ? 1 : 0;

        await pool.query(
            `MERGE INTO device_maintenance AS target
             USING (VALUES ($1, $2, $3, 2026)) AS source (device_id, month_name, is_completed, year_val)
             ON target.device_id = source.device_id AND target.month_name = source.month_name AND target.year_val = source.year_val
             WHEN MATCHED THEN
                 UPDATE SET is_completed = source.is_completed
             WHEN NOT MATCHED THEN
                 INSERT (device_id, month_name, is_completed, year_val)
                 VALUES (source.device_id, source.month_name, source.is_completed, source.year_val);`,
            [device_id, month_name, compVal]
        );

        res.json({ success: true, device_id, month_name, is_completed: !!compVal });
    } catch (err) {
        console.error('Error toggling maintenance status:', err);
        res.status(500).json({ error: 'Bakım durumu güncellenemedi: ' + err.message });
    }
});

// POST /api/maintenance/:id — Cihaz ID bazlı toggle desteği
router.post('/:id', requireRole('operator'), async (req, res) => {
    try {
        const deviceId = req.params.id;
        const { month_name, is_completed } = req.body;

        if (!deviceId || !month_name) {
            return res.status(400).json({ error: 'deviceId ve month_name zorunludur.' });
        }

        const compVal = (is_completed === true || is_completed === 1 || is_completed === 'true') ? 1 : 0;

        await pool.query(
            `MERGE INTO device_maintenance AS target
             USING (VALUES ($1, $2, $3, 2026)) AS source (device_id, month_name, is_completed, year_val)
             ON target.device_id = source.device_id AND target.month_name = source.month_name AND target.year_val = source.year_val
             WHEN MATCHED THEN
                 UPDATE SET is_completed = source.is_completed
             WHEN NOT MATCHED THEN
                 INSERT (device_id, month_name, is_completed, year_val)
                 VALUES (source.device_id, source.month_name, source.is_completed, source.year_val);`,
            [deviceId, month_name, compVal]
        );

        res.json({ success: true, device_id: deviceId, month_name, is_completed: !!compVal });
    } catch (err) {
        console.error('Error toggling maintenance status by deviceId:', err);
        res.status(500).json({ error: 'Bakım durumu güncellenemedi: ' + err.message });
    }
});

// GET /api/maintenance/:id — Tek bir cihazın bakım durumunu getir (cihaz detay modalı için)
router.get('/:id', async (req, res) => {
    try {
        if (req.params.id === 'grid') {
            return handleGetGrid(req, res);
        }

        const result = await pool.query(
            `SELECT * FROM device_maintenance WHERE device_id = $1 AND year_val = 2026 ORDER BY id ASC`,
            [req.params.id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching device maintenance records:', err);
        res.status(500).json({ error: 'Cihaz bakım kayıtları alınamadı.' });
    }
});

module.exports = router;
