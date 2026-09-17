const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');
const xlsx = require('xlsx');

// GET /api/actions/export - Yapılan İşler veya Gelen Giden Malzeme listesini dışa aktar
router.get('/export', async (req, res) => {
    try {
        const { type } = req.query;
        const actionType = type || 'action';

        const query = `
            SELECT a.*, d.hostname 
            FROM device_actions a 
            LEFT JOIN devices d ON a.device_id = d.id 
            WHERE a.action_type = $1
            ORDER BY a.action_date DESC, a.id DESC
        `;
        const result = await pool.query(query, [actionType]);
        const rows = result.rows;

        let excelRows = [];
        let sheetName = "Sayfa1";
        let fileName = "Export.xlsx";

        if (actionType === 'material') {
            sheetName = "Gelen Giden Malzeme";
            fileName = "Gelen_Giden_Malzeme_Export.xlsx";
            excelRows = rows.map(m => ({
                'Glntarih': m.arrival_date ? new Date(m.arrival_date).toLocaleDateString('tr-TR') : '',
                'SeriNo': m.serial_no || '',
                'Geldiği yer': m.came_from || '',
                'tür': m.part_type || '',
                'marka': m.brand || '',
                'model no': m.model || '',
                'adet': m.quantity || 1,
                'takıldığı yer': m.location || ''
            }));
        } else {
            sheetName = "Yapılan İşler";
            fileName = "Yapilan_Isler_Export.xlsx";
            excelRows = rows.map(a => ({
                'Tarih': a.action_date ? new Date(a.action_date).toLocaleDateString('tr-TR') : '',
                'SeriNo': a.serial_no || '',
                'Marka': a.brand || '',
                'Model': a.model || '',
                'Tip': a.part_type || '',
                'Yapılanİşlemler': a.action_taken || '',
                'BilgisayarAdı': a.hostname || '',
                'Kullanıcı': a.username || '',
                'Konum': a.location || ''
            }));
        }

        const ws = xlsx.utils.json_to_sheet(excelRows);
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, sheetName);

        const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);
    } catch (err) {
        console.error('❌ Actions Export error:', err);
        res.status(500).json({ error: 'Excel dışa aktarma başarısız oldu: ' + err.message });
    }
});

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

// Robust Excel date parser helper
function parseExcelDate(val) {
    if (val === undefined || val === null || val === '') return null;
    let date = null;
    if (typeof val === 'number') {
        date = new Date(Math.round((val - 25569) * 86400 * 1000));
    } else {
        const strVal = String(val).trim();
        const parts = strVal.split('.');
        if (parts.length === 3) {
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const year = parseInt(parts[2], 10);
            if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                date = new Date(year, month, day);
            }
        }
        if (!date) {
            date = new Date(strVal);
        }
    }
    if (date && !isNaN(date.getTime())) {
        const year = date.getFullYear();
        if (year > 1990 && year < 2100) return date;
    }
    return null;
}

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

function cleanString(val) {
    if (val === undefined || val === null) return '';
    return String(val).trim();
}

// POST /api/actions/import - Yapılan İşler veya Gelen Giden Malzeme içe aktar
router.post('/import', async (req, res) => {
    const client = await pool.connect();
    try {
        const actionType = req.query.type || req.body.type || 'action';
        const { fileData } = req.body;

        if (!fileData) {
            return res.status(400).json({ error: 'fileData (Base64) gereklidir.' });
        }

        const buffer = Buffer.from(fileData, 'base64');
        const workbook = xlsx.read(buffer, { type: 'buffer' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawRows = xlsx.utils.sheet_to_json(worksheet);

        await client.query("BEGIN");

        // Clear existing actions of this type
        await client.query("DELETE FROM device_actions WHERE action_type = $1", [actionType]);

        let insertedCount = 0;

        for (const rawRow of rawRows) {
            const row = getNormalizedRow(rawRow);

            if (actionType === 'material') {
                const rawGlnDate = row['glntarih'] || row['gln tarih'] || row['gelis tarihi'];
                const arrivalDate = parseExcelDate(rawGlnDate);
                const actionDate = arrivalDate; // Default to arrival date for materials if there is no other date field

                const serialNo = row['serino'] || row['seri no'] || row['seri numarasi'] || '';
                const cameFrom = row['geldigi yer'] || row['geldigi yer'] || '';
                const partType = row['tur'] || row['tur / tip'] || row['parca tipi'] || '';
                const brand = row['marka'] || '';
                const model = row['model no'] || row['model'] || '';
                const location = row['takildigi yer'] || row['takildigi yer / konum'] || row['takildigi yer(bilgisayar kulllanicisi)'] || '';
                const actionTaken = row['ariza nedeni / aciklama'] || row['arizalilar ve nedeni'] || '';
                const warrantyStatus = row['garanti durumu'] || row['garantide'] || '';
                const relDevice = row['iliskili cihaz'] || '';

                let deviceId = null;
                if (relDevice) {
                    deviceId = await getOrCreateDeviceIdByHostname(client, relDevice);
                } else if (location) {
                    deviceId = await getOrCreateDeviceIdByHostname(client, location);
                }

                await client.query(
                    `INSERT INTO device_actions (
                        device_id, arrival_date, action_date, serial_no, came_from, 
                        brand, model, part_type, quantity, action_taken, 
                        username, location, warranty_status, action_type
                     )
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'material')`,
                    [
                        deviceId,
                        arrivalDate,
                        actionDate,
                        cleanString(serialNo),
                        cleanString(cameFrom),
                        cleanString(brand),
                        cleanString(model),
                        cleanString(partType),
                        parseInt(row['adet'], 10) || 1,
                        cleanString(actionTaken),
                        cleanString(row['zimmetlenen kisi'] || row['kullanici']),
                        cleanString(location),
                        cleanString(warrantyStatus)
                    ]
                );
            } else {
                // action
                const rawDate = row['tarih'] || row['islem tarihi'];
                const actionDate = parseExcelDate(rawDate) || new Date();

                const serialNo = row['serino'] || row['seri no'] || row['seri numarasi'] || '';
                const partType = row['tip'] || row['parca tipi'] || row['parca / urun tipi'] || '';
                const brand = row['marka'] || '';
                const model = row['model'] || '';
                const location = row['konum'] || row['konum / bolum'] || '';
                const actionTaken = row['yapilanislemler'] || row['yapilan islem aciklamasi'] || row['isler'] || row['islem'] || '';
                const username = row['kullanici'] || row['kullanici / personel'] || '';
                const relDevice = row['bilgisayaradi'] || row['cihaz (hostname)'] || row['bilgisayar'] || '';

                let deviceId = null;
                if (relDevice) {
                    deviceId = await getOrCreateDeviceIdByHostname(client, relDevice);
                } else if (username) {
                    deviceId = await getOrCreateDeviceIdByHostname(client, username);
                }

                await client.query(
                    `INSERT INTO device_actions (
                        device_id, action_date, serial_no, brand, model, 
                        part_type, action_taken, username, location, action_type
                     )
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'action')`,
                    [
                        deviceId,
                        actionDate,
                        cleanString(serialNo),
                        cleanString(brand),
                        cleanString(model),
                        cleanString(partType),
                        cleanString(actionTaken),
                        cleanString(username),
                        cleanString(location)
                    ]
                );
            }
            insertedCount++;
        }

        await client.query("COMMIT");
        res.json({ success: true, count: insertedCount });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error('❌ Actions Import error:', err);
        res.status(500).json({ error: 'Excel içe aktarma başarısız oldu: ' + err.message });
    } finally {
        client.release();
    }
});

// GET /api/actions — Tüm aksiyonları/malzemeleri listele (filtreli)
router.get('/', async (req, res) => {
    try {
        const { type, search } = req.query;
        const actionType = type || 'action';

        let query = `
            SELECT a.*, d.hostname, d.ip_address 
            FROM device_actions a 
            LEFT JOIN devices d ON a.device_id = d.id 
            WHERE a.action_type = $1
        `;
        const params = [actionType];

        if (search) {
            query += `
                AND (
                    a.serial_no LIKE $2 OR 
                    a.brand LIKE $2 OR 
                    a.model LIKE $2 OR 
                    a.part_type LIKE $2 OR 
                    a.action_taken LIKE $2 OR 
                    a.username LIKE $2 OR 
                    a.location LIKE $2 OR 
                    a.came_from LIKE $2 OR
                    a.warranty_status LIKE $2 OR
                    d.hostname LIKE $2
                )
            `;
            params.push(`%${search}%`);
        }

        if (actionType === 'material') {
            query += ` ORDER BY a.arrival_date DESC, a.action_date DESC, a.id DESC`;
        } else {
            query += ` ORDER BY a.action_date DESC, a.id DESC`;
        }

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching actions list:', err);
        res.status(500).json({ error: 'Failed to fetch actions list' });
    }
});

// GET /api/actions/:id — Bir cihazın yapılan işler ve malzeme geçmişini getir
router.get('/:id', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM device_actions WHERE device_id = $1 ORDER BY COALESCE(arrival_date, action_date) DESC, id DESC`,
            [req.params.id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching actions records:', err);
        res.status(500).json({ error: 'Failed to fetch actions records' });
    }
});

// POST /api/actions — Yeni aksiyon/malzeme ekle
router.post('/', async (req, res) => {
    try {
        const { 
            device_id, arrival_date, action_date, serial_no, came_from, 
            brand, model, part_type, quantity, action_taken, 
            username, location, warranty_status, action_type 
        } = req.body;
        
        const arrDate = arrival_date ? new Date(arrival_date) : null;
        const actDate = action_date ? new Date(action_date) : null;
        const actType = action_type || 'action';
        
        const qty = parseInt(quantity, 10);
        const finalQty = isNaN(qty) ? 1 : qty;

        const result = await pool.query(
            `INSERT INTO device_actions (
                device_id, arrival_date, action_date, serial_no, came_from, 
                brand, model, part_type, quantity, action_taken, 
                username, location, warranty_status, action_type
             ) 
             OUTPUT INSERTED.*
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
            [
                device_id || null, 
                arrDate,
                actDate, 
                serial_no || '', 
                came_from || '',
                brand || '', 
                model || '', 
                part_type || '', 
                finalQty,
                action_taken || '', 
                username || '', 
                location || '', 
                warranty_status || '',
                actType
            ]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error adding action record:', err);
        res.status(500).json({ error: 'Failed to add action record' });
    }
});

// PUT /api/actions/:id — Aksiyon/malzeme güncelle
router.put('/:id', async (req, res) => {
    try {
        const { 
            device_id, arrival_date, action_date, serial_no, came_from, 
            brand, model, part_type, quantity, action_taken, 
            username, location, warranty_status, action_type 
        } = req.body;
        
        const arrDate = arrival_date ? new Date(arrival_date) : null;
        const actDate = action_date ? new Date(action_date) : null;
        const actType = action_type || 'action';
        
        const qty = parseInt(quantity, 10);
        const finalQty = isNaN(qty) ? 1 : qty;

        const result = await pool.query(
            `UPDATE device_actions SET
                device_id = $1,
                arrival_date = $2,
                action_date = $3,
                serial_no = $4,
                came_from = $5,
                brand = $6,
                model = $7,
                part_type = $8,
                quantity = $9,
                action_taken = $10,
                username = $11,
                location = $12,
                warranty_status = $13,
                action_type = $14
             OUTPUT INSERTED.*
             WHERE id = $15`,
            [
                device_id || null,
                arrDate,
                actDate,
                serial_no || '',
                came_from || '',
                brand || '',
                model || '',
                part_type || '',
                finalQty,
                action_taken || '',
                username || '',
                location || '',
                warranty_status || '',
                actType,
                req.params.id
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Action record not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating action record:', err);
        res.status(500).json({ error: 'Failed to update action record' });
    }
});

// DELETE /api/actions/:id — Aksiyon/malzeme sil
router.delete('/:id', async (req, res) => {
    try {
        const result = await pool.query(
            `DELETE FROM device_actions OUTPUT DELETED.id WHERE id = $1`,
            [req.params.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Action record not found' });
        }
        res.json({ message: 'Action record deleted', id: parseInt(req.params.id) });
    } catch (err) {
        console.error('Error deleting action record:', err);
        res.status(500).json({ error: 'Failed to delete action record' });
    }
});

module.exports = router;
