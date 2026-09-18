const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');
const xlsx = require('xlsx');
const { requireRole } = require('../middleware/auth');
const { sanitizeRows } = require('../utils/excelSanitizer');
const { isValidIP, isValidMAC, sanitizePagination } = require('../utils/validators');

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

// GET /api/printers/export
router.get('/export', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM printers ORDER BY name');
        const rows = result.rows;
        const excelRows = rows.map(p => ({
            'YazıcıKonum': p.location || '',
            'Bölümler': p.department || '',
            'IPv4Adress': p.ip_address || '',
            'Açıklama': p.description || p.name || '',
            'YazdırmaTürü': p.print_type || '',
            'SeriNo': p.serial_no || '',
            'Toner': p.toner_model || ''
        }));
        const ws = xlsx.utils.json_to_sheet(sanitizeRows(excelRows));
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, "Yazıcı Listesi");
        const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', 'attachment; filename="Yazici_Listesi_Export.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);
    } catch (err) {
        console.error('❌ Printers Export error:', err);
        res.status(500).json({ error: 'Excel dışa aktarma başarısız oldu: ' + err.message });
    }
});

// POST /api/printers/import
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
        const workbook = xlsx.read(buffer, { type: 'buffer' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawRows = xlsx.utils.sheet_to_json(worksheet);

        await client.query("BEGIN");
        let count = 0;
        for (const rawRow of rawRows) {
            const row = getNormalizedRow(rawRow);
            const location = row['yazicikonum'] || row['konum'] || '';
            const department = row['bolumler'] || row['bolum'] || row['departman'] || '';
            const ipAddress = row['ipv4adress'] || row['ip adresi'] || row['ip'] || '';
            const description = row['aciklama'] || row['yazici adi'] || row['yazici'] || row['ad'] || '';
            const printType = row['yazdirmaturu'] || row['yazdırma turu'] || '';
            const serialNo = row['serino'] || row['seri no'] || '';
            const tonerModel = row['toner'] || row['toner modeli'] || '';
            const model = row['model'] || '';

            if (!ipAddress) continue;

            const finalName = description || `Yazıcı ${ipAddress}`;

            await client.query(
                `MERGE INTO printers AS target
                 USING (VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)) AS source (name, ip_address, model, location, department, description, print_type, serial_no, toner_model)
                 ON target.ip_address = source.ip_address
                 WHEN MATCHED THEN
                     UPDATE SET 
                         name = COALESCE(source.name, target.name),
                         model = COALESCE(source.model, target.model),
                         location = source.location,
                         department = source.department,
                         description = source.description,
                         print_type = source.print_type,
                         serial_no = source.serial_no,
                         toner_model = source.toner_model,
                         updated_at = GETDATE()
                 WHEN NOT MATCHED THEN
                     INSERT (name, ip_address, model, location, department, description, print_type, serial_no, toner_model)
                     VALUES (source.name, source.ip_address, source.model, source.location, source.department, source.description, source.print_type, source.serial_no, source.toner_model);`,
                [
                    finalName.trim(), 
                    ipAddress.trim(), 
                    model.trim(), 
                    location.trim(), 
                    department.trim(), 
                    description.trim(), 
                    printType.trim(), 
                    serialNo.trim(), 
                    tonerModel.trim()
                ]
            );
            count++;
        }
        await client.query("COMMIT");
        res.json({ success: true, count });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error('❌ Printers Import error:', err);
        res.status(500).json({ error: 'Excel içe aktarma başarısız oldu: ' + err.message });
    } finally {
        client.release();
    }
});

// GET /api/printers/toners/stock/export
router.get('/toners/stock/export', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM toner_stock ORDER BY toner_model ASC');
        const rows = result.rows;
        const excelRows = rows.map(s => ({
            'TonerAdı': s.toner_model || '',
            'Adet': s.quantity || 0
        }));
        const ws = xlsx.utils.json_to_sheet(sanitizeRows(excelRows));
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, "Toner Stokları");
        const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', 'attachment; filename="Toner_Stoklari_Export.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);
    } catch (err) {
        console.error('❌ Toner Stock Export error:', err);
        res.status(500).json({ error: 'Excel dışa aktarma başarısız oldu: ' + err.message });
    }
});

// POST /api/printers/toners/stock/import
router.post('/toners/stock/import', requireRole('operator'), async (req, res) => {
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
        const workbook = xlsx.read(buffer, { type: 'buffer' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawRows = xlsx.utils.sheet_to_json(worksheet);

        await client.query("BEGIN");
        let count = 0;
        for (const rawRow of rawRows) {
            const row = getNormalizedRow(rawRow);
            const tonerModel = row['toneradi'] || row['toner adi'] || row['toner modeli'] || row['toner model'] || row['model'] || '';
            const quantity = parseInt(row['adet'] || row['miktar'] || row['stok'], 10);

            if (!tonerModel) continue;

            await client.query(
                `MERGE INTO toner_stock AS target
                 USING (VALUES ($1, $2)) AS source (toner_model, quantity)
                 ON target.toner_model = source.toner_model
                 WHEN MATCHED THEN
                     UPDATE SET quantity = source.quantity
                 WHEN NOT MATCHED THEN
                     INSERT (toner_model, quantity) VALUES (source.toner_model, source.quantity);`,
                [tonerModel.trim(), isNaN(quantity) ? 0 : quantity]
            );
            count++;
        }
        await client.query("COMMIT");
        res.json({ success: true, count });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error('❌ Toner Stock Import error:', err);
        res.status(500).json({ error: 'Excel içe aktarma başarısız oldu: ' + err.message });
    } finally {
        client.release();
    }
});

// GET /api/printers/toners/replacements/export
router.get('/toners/replacements/export', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM toner_replacements ORDER BY replacement_date DESC, id DESC');
        const rows = result.rows;
        const excelRows = rows.map(r => ({
            'Değişim Tarihi': r.replacement_date ? new Date(r.replacement_date).toLocaleDateString('tr-TR') : '',
            'Kullanıcı / Personel': r.username || '',
            'Toner Modeli': r.toner_model || ''
        }));
        const ws = xlsx.utils.json_to_sheet(sanitizeRows(excelRows));
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, "Toner Değişim Geçmişi");
        const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', 'attachment; filename="Toner_Degisim_Gecmisi_Export.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);
    } catch (err) {
        console.error('❌ Toner Replacements Export error:', err);
        res.status(500).json({ error: 'Excel dışa aktarma başarısız oldu: ' + err.message });
    }
});

// POST /api/printers/toners/replacements/import
router.post('/toners/replacements/import', requireRole('operator'), async (req, res) => {
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
        const workbook = xlsx.read(buffer, { type: 'buffer' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawRows = xlsx.utils.sheet_to_json(worksheet);

        await client.query("BEGIN");
        await client.query("DELETE FROM toner_replacements");

        let count = 0;
        for (const rawRow of rawRows) {
            const row = getNormalizedRow(rawRow);
            const rawDate = row['degisim tarihi'] || row['tarih'] || row['islem tarihi'];
            const replacementDate = parseExcelDate(rawDate) || new Date();
            const username = row['kullanici / personel'] || row['kullanici'] || row['personel'] || '';
            const tonerModel = row['toner modeli'] || row['toner model'] || row['model'] || '';

            if (!tonerModel) continue;

            await client.query(
                `INSERT INTO toner_replacements (replacement_date, username, toner_model)
                 VALUES ($1, $2, $3)`,
                [replacementDate, username.trim(), tonerModel.trim()]
            );
            count++;
        }
        await client.query("COMMIT");
        res.json({ success: true, count });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error('❌ Toner Replacements Import error:', err);
        res.status(500).json({ error: 'Excel içe aktarma başarısız oldu: ' + err.message });
    } finally {
        client.release();
    }
});

// GET /api/printers — Tüm yazıcıları listele
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.*, 
                   (
                       SELECT pt.id, pt.color, pt.level, pt.max_capacity, pt.pages_printed
                       FROM printer_toners pt
                       WHERE pt.printer_id = p.id
                       FOR JSON PATH
                   ) as toners
            FROM printers p
            ORDER BY p.name
        `);
        // Parse toners JSON string back to object array
        const rows = result.rows.map(row => {
            row.toners = row.toners ? JSON.parse(row.toners) : [];
            return row;
        });
        res.json(rows);
    } catch (err) {
        console.error('Error fetching printers:', err);
        res.status(500).json({ error: 'Failed to fetch printers' });
    }
});

// GET /api/printers/toners/stock — Toner stok durumunu getir
router.get('/toners/stock', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM toner_stock ORDER BY quantity DESC, toner_model ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching toner stock:', err);
        res.status(500).json({ error: 'Failed to fetch toner stock' });
    }
});

// GET /api/printers/toners/replacements — Toner değişim geçmişini getir
router.get('/toners/replacements', async (req, res) => {
    try {
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
        const result = await pool.query(`SELECT TOP (${limit}) * FROM toner_replacements ORDER BY replacement_date DESC, id DESC`);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching toner replacements:', err);
        res.status(500).json({ error: 'Failed to fetch toner replacements' });
    }
});

// GET /api/printers/:id
router.get('/:id', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.*, 
                   (
                       SELECT pt.id, pt.color, pt.level, pt.max_capacity, pt.pages_printed
                       FROM printer_toners pt
                       WHERE pt.printer_id = p.id
                       FOR JSON PATH
                   ) as toners
            FROM printers p
            WHERE p.id = $1
        `, [req.params.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Printer not found' });
        }
        
        const row = result.rows[0];
        row.toners = row.toners ? JSON.parse(row.toners) : [];
        res.json(row);
    } catch (err) {
        console.error('Error fetching printer:', err);
        res.status(500).json({ error: 'Failed to fetch printer' });
    }
});

// POST /api/printers — Yazıcı ekle
router.post('/', requireRole('operator'), async (req, res) => {
    try {
        const { name, ip_address, model, location, department, description, print_type, serial_no, toner_model, toners } = req.body;

        if (!name || !ip_address) {
            return res.status(400).json({ error: 'name and ip_address are required' });
        }

        if (!isValidIP(ip_address)) {
            return res.status(400).json({ error: 'Invalid IP address format' });
        }

        const printerResult = await pool.query(
            `MERGE INTO printers AS target
             USING (VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)) AS source (name, ip_address, model, location, department, description, print_type, serial_no, toner_model)
             ON target.ip_address = source.ip_address
             WHEN MATCHED THEN
                 UPDATE SET
                     name = source.name,
                     model = COALESCE(source.model, target.model),
                     location = source.location,
                     department = source.department,
                     description = source.description,
                     print_type = source.print_type,
                     serial_no = source.serial_no,
                     toner_model = source.toner_model,
                     updated_at = GETDATE()
             WHEN NOT MATCHED THEN
                 INSERT (name, ip_address, model, location, department, description, print_type, serial_no, toner_model)
                 VALUES (source.name, source.ip_address, source.model, source.location, source.department, source.description, source.print_type, source.serial_no, source.toner_model)
             OUTPUT INSERTED.*;`,
            [
                name, 
                ip_address, 
                model || '', 
                location || '', 
                department || '', 
                description || '', 
                print_type || '', 
                serial_no || '', 
                toner_model || ''
            ]
        );

        const printer = printerResult.rows[0];

        // Toner bilgilerini ekle (Transaction içinde atomik olarak)
        if (toners && Array.isArray(toners) && toners.length > 0) {
            const client = await pool.connect();
            try {
                await client.query('BEGIN TRANSACTION');
                for (const toner of toners) {
                    await client.query(
                        `INSERT INTO printer_toners (printer_id, color, level, max_capacity, pages_printed)
                         VALUES ($1, $2, $3, $4, $5)`,
                        [printer.id, toner.color, toner.level || 0, toner.max_capacity || 100, toner.pages_printed || 0]
                    );
                }
                await client.query('COMMIT TRANSACTION');
            } catch (txErr) {
                await client.query('ROLLBACK TRANSACTION');
                throw txErr;
            } finally {
                client.release();
            }
        }

        const io = req.app.get('io');
        if (io) io.emit('printer:added', printer);

        res.status(201).json(printer);
    } catch (err) {
        console.error('Error adding printer:', err);
        res.status(500).json({ error: 'Failed to add printer' });
    }
});

// PUT /api/printers/:id — Yazıcı güncelle
router.put('/:id', requireRole('operator'), async (req, res) => {
    try {
        const { 
            name, ip_address, model, is_online, error_message, has_paper_jam, 
            printer_status, total_page_count, location, department, description, 
            print_type, serial_no, toner_model, toners 
        } = req.body;

        if (ip_address && !isValidIP(ip_address)) {
            return res.status(400).json({ error: 'Invalid IP address format' });
        }

        const result = await pool.query(
            `UPDATE printers SET
                name = COALESCE($1, name),
                ip_address = COALESCE($2, ip_address),
                model = COALESCE($3, model),
                is_online = COALESCE($4, is_online),
                error_message = COALESCE($5, error_message),
                has_paper_jam = COALESCE($6, has_paper_jam),
                printer_status = COALESCE($7, printer_status),
                total_page_count = COALESCE($8, total_page_count),
                location = COALESCE($9, location),
                department = COALESCE($10, department),
                description = COALESCE($11, description),
                print_type = COALESCE($12, print_type),
                serial_no = COALESCE($13, serial_no),
                toner_model = COALESCE($14, toner_model),
                last_updated = GETDATE(),
                updated_at = GETDATE()
             OUTPUT INSERTED.*
             WHERE id = $15`,
            [
                name, 
                ip_address, 
                model, 
                is_online === undefined ? null : (is_online ? 1 : 0), 
                error_message, 
                has_paper_jam === undefined ? null : (has_paper_jam ? 1 : 0), 
                printer_status, 
                total_page_count, 
                location, 
                department, 
                description, 
                print_type, 
                serial_no, 
                toner_model, 
                req.params.id
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Printer not found' });
        }

        // Toner bilgilerini güncelle (Transaction içinde atomik olarak)
        if (toners && Array.isArray(toners)) {
            const client = await pool.connect();
            try {
                await client.query('BEGIN TRANSACTION');
                await client.query('DELETE FROM printer_toners WHERE printer_id = $1', [req.params.id]);
                for (const toner of toners) {
                    await client.query(
                        `INSERT INTO printer_toners (printer_id, color, level, max_capacity, pages_printed)
                         VALUES ($1, $2, $3, $4, $5)`,
                        [req.params.id, toner.color, toner.level || 0, toner.max_capacity || 100, toner.pages_printed || 0]
                    );
                }
                await client.query('COMMIT TRANSACTION');
            } catch (txErr) {
                await client.query('ROLLBACK TRANSACTION');
                throw txErr;
            } finally {
                client.release();
            }
        }

        const printer = result.rows[0];
        const io = req.app.get('io');
        if (io) io.emit('printer:updated', printer);

        res.json(printer);
    } catch (err) {
        console.error('Error updating printer:', err);
        res.status(500).json({ error: 'Failed to update printer' });
    }
});

// DELETE /api/printers/:id
router.delete('/:id', requireRole('admin'), async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM printers OUTPUT DELETED.id WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Printer not found' });
        }

        const io = req.app.get('io');
        if (io) io.emit('printer:deleted', { id: parseInt(req.params.id) });

        res.json({ message: 'Printer deleted', id: parseInt(req.params.id) });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete printer' });
    }
});

// GET /api/printers/:id/jamlogs — Jam log geçmişi
router.get('/:id/jamlogs', async (req, res) => {
    try {
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
        const result = await pool.query(
            `SELECT TOP (${limit}) * FROM printer_jam_logs WHERE printer_id = $1 ORDER BY created_at DESC`,
            [req.params.id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch jam logs' });
    }
});

// POST /api/printers/toners/stock — Yeni toner stok modeli ekle
router.post('/toners/stock', requireRole('operator'), async (req, res) => {
    try {
        const { toner_model, quantity } = req.body;
        if (!toner_model) {
            return res.status(400).json({ error: 'toner_model is required' });
        }
        const parsedQty = parseInt(quantity, 10) || 0;
        const result = await pool.query(
            `INSERT INTO toner_stock (toner_model, quantity) 
             OUTPUT INSERTED.*
             VALUES ($1, $2)`,
            [toner_model.trim(), parsedQty]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error adding toner stock:', err);
        if (err.code === '23505' || err.number === 2627) {
            return res.status(409).json({ error: 'This toner model already exists in stock' });
        }
        res.status(500).json({ error: 'Failed to add toner stock' });
    }
});

// PUT /api/printers/toners/stock/:model — Toner stok modelini güncelle
router.put('/toners/stock/:model', requireRole('operator'), async (req, res) => {
    try {
        const { new_model, quantity } = req.body;
        const modelParam = req.params.model;
        const parsedQty = parseInt(quantity, 10) || 0;

        const result = await pool.query(
            `UPDATE toner_stock SET toner_model = $1, quantity = $2 OUTPUT INSERTED.* WHERE toner_model = $3`,
            [new_model ? new_model.trim() : modelParam, parsedQty, modelParam]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Toner model not found in stock' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating toner stock:', err);
        res.status(500).json({ error: 'Failed to update toner stock' });
    }
});

// DELETE /api/printers/toners/stock/:model — Toner stok modelini sil
router.delete('/toners/stock/:model', requireRole('admin'), async (req, res) => {
    try {
        const result = await pool.query(
            `DELETE FROM toner_stock OUTPUT DELETED.* WHERE toner_model = $1`,
            [req.params.model]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Toner model not found in stock' });
        }
        res.json({ message: 'Toner model deleted', model: req.params.model });
    } catch (err) {
        console.error('Error deleting toner stock:', err);
        res.status(500).json({ error: 'Failed to delete toner stock' });
    }
});

// POST /api/printers/toners/replacements — Yeni toner değişim kaydı ekle
router.post('/toners/replacements', requireRole('operator'), async (req, res) => {
    try {
        const { replacement_date, username, toner_model } = req.body;
        if (!toner_model) {
            return res.status(400).json({ error: 'toner_model is required' });
        }
        const repDate = replacement_date ? new Date(replacement_date) : new Date();
        const result = await pool.query(
            `INSERT INTO toner_replacements (replacement_date, username, toner_model) 
             OUTPUT INSERTED.*
             VALUES ($1, $2, $3)`,
            [repDate, username || '', toner_model.trim()]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error adding toner replacement:', err);
        res.status(500).json({ error: 'Failed to add toner replacement' });
    }
});

// PUT /api/printers/toners/replacements/:id — Toner değişim kaydını güncelle
router.put('/toners/replacements/:id', requireRole('operator'), async (req, res) => {
    try {
        const { replacement_date, username, toner_model } = req.body;
        const repDate = replacement_date ? new Date(replacement_date) : new Date();
        const result = await pool.query(
            `UPDATE toner_replacements SET replacement_date = $1, username = $2, toner_model = $3 OUTPUT INSERTED.* WHERE id = $4`,
            [repDate, username || '', toner_model || '', req.params.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Toner replacement record not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating toner replacement:', err);
        res.status(500).json({ error: 'Failed to update toner replacement' });
    }
});

// DELETE /api/printers/toners/replacements/:id — Toner değişim kaydını sil
router.delete('/toners/replacements/:id', requireRole('admin'), async (req, res) => {
    try {
        const result = await pool.query(
            `DELETE FROM toner_replacements OUTPUT DELETED.* WHERE id = $1`,
            [req.params.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Toner replacement record not found' });
        }
        res.json({ message: 'Toner replacement record deleted', id: req.params.id });
    } catch (err) {
        console.error('Error deleting toner replacement:', err);
        res.status(500).json({ error: 'Failed to delete toner replacement' });
    }
});

// POST /api/printers/scan — SNMP ve Web ile yazıcıları tarama tetikle
router.post('/scan', requireRole('operator'), async (req, res) => {
    try {
        let monitor = req.app.get('printerMonitorService');
        if (!monitor) {
            const io = req.app.get('io');
            const PrinterMonitorService = require('../services/printerMonitorService');
            monitor = new PrinterMonitorService(io);
            req.app.set('printerMonitorService', monitor);
        }

        if (monitor.isScanning) {
            return res.status(409).json({ error: 'Tarama zaten devam ediyor (Scan already running)' });
        }
        
        // Arka planda taramayı başlat (HTTP yanıtını bloke etmesin)
        monitor.scanAllPrinters();
        
        res.json({ message: 'Yazıcı taraması arka planda başlatıldı.' });
    } catch (err) {
        console.error('Error triggering manual printer scan:', err);
        res.status(500).json({ error: 'Tarama başlatılamadı: ' + err.message });
    }
});

module.exports = router;
