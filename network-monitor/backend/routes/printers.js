const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');

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
router.post('/', async (req, res) => {
    try {
        const { name, ip_address, model, toners } = req.body;

        if (!name || !ip_address) {
            return res.status(400).json({ error: 'name and ip_address are required' });
        }

        const printerResult = await pool.query(
            `MERGE INTO printers AS target
             USING (VALUES ($1, $2, $3)) AS source (name, ip_address, model)
             ON target.ip_address = source.ip_address
             WHEN MATCHED THEN
                 UPDATE SET
                     name = source.name,
                     model = COALESCE(source.model, target.model),
                     updated_at = GETDATE()
             WHEN NOT MATCHED THEN
                 INSERT (name, ip_address, model)
                 VALUES (source.name, source.ip_address, source.model)
             OUTPUT INSERTED.*;`,
            [name, ip_address, model || '']
        );

        const printer = printerResult.rows[0];

        // Toner bilgilerini ekle
        if (toners && Array.isArray(toners)) {
            for (const toner of toners) {
                await pool.query(
                    `INSERT INTO printer_toners (printer_id, color, level, max_capacity, pages_printed)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [printer.id, toner.color, toner.level || 0, toner.max_capacity || 100, toner.pages_printed || 0]
                );
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
router.put('/:id', async (req, res) => {
    try {
        const { name, ip_address, model, is_online, error_message, has_paper_jam, printer_status, total_page_count, toners } = req.body;

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
                last_updated = GETDATE(),
                updated_at = GETDATE()
             OUTPUT INSERTED.*
             WHERE id = $9`,
            [name, ip_address, model, is_online === undefined ? null : (is_online ? 1 : 0), error_message, has_paper_jam === undefined ? null : (has_paper_jam ? 1 : 0), printer_status, total_page_count, req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Printer not found' });
        }

        // Toner bilgilerini güncelle
        if (toners && Array.isArray(toners)) {
            await pool.query('DELETE FROM printer_toners WHERE printer_id = $1', [req.params.id]);
            for (const toner of toners) {
                await pool.query(
                    `INSERT INTO printer_toners (printer_id, color, level, max_capacity, pages_printed)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [req.params.id, toner.color, toner.level || 0, toner.max_capacity || 100, toner.pages_printed || 0]
                );
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
router.delete('/:id', async (req, res) => {
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
        const limit = parseInt(req.query.limit) || 50;
        const result = await pool.query(
            `SELECT TOP (${limit}) * FROM printer_jam_logs WHERE printer_id = $1 ORDER BY created_at DESC`,
            [req.params.id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch jam logs' });
    }
});

module.exports = router;
