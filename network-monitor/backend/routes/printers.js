const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');

// GET /api/printers — Tüm yazıcıları listele
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.*, 
                   json_agg(json_build_object(
                       'id', pt.id,
                       'color', pt.color,
                       'level', pt.level,
                       'max_capacity', pt.max_capacity,
                       'pages_printed', pt.pages_printed
                   )) FILTER (WHERE pt.id IS NOT NULL) as toners
            FROM printers p
            LEFT JOIN printer_toners pt ON pt.printer_id = p.id
            GROUP BY p.id
            ORDER BY p.name
        `);
        res.json(result.rows);
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
                   json_agg(json_build_object(
                       'id', pt.id,
                       'color', pt.color,
                       'level', pt.level,
                       'max_capacity', pt.max_capacity,
                       'pages_printed', pt.pages_printed
                   )) FILTER (WHERE pt.id IS NOT NULL) as toners
            FROM printers p
            LEFT JOIN printer_toners pt ON pt.printer_id = p.id
            WHERE p.id = $1
            GROUP BY p.id
        `, [req.params.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Printer not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
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
            `INSERT INTO printers (name, ip_address, model)
             VALUES ($1, $2, $3)
             ON CONFLICT (ip_address) DO UPDATE SET
                name = EXCLUDED.name,
                model = COALESCE(EXCLUDED.model, printers.model),
                updated_at = NOW()
             RETURNING *`,
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
                last_updated = NOW(),
                updated_at = NOW()
             WHERE id = $9
             RETURNING *`,
            [name, ip_address, model, is_online, error_message, has_paper_jam, printer_status, total_page_count, req.params.id]
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
        const result = await pool.query('DELETE FROM printers WHERE id = $1 RETURNING id', [req.params.id]);
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
            `SELECT * FROM printer_jam_logs WHERE printer_id = $1 ORDER BY created_at DESC LIMIT $2`,
            [req.params.id, limit]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch jam logs' });
    }
});

module.exports = router;
