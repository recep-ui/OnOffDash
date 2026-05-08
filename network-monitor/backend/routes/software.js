const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');

// POST /api/software — Agent'tan yazılım listesi al (bulk upsert)
router.post('/', async (req, res) => {
    const client = await pool.connect();
    try {
        const { device_ip, software } = req.body;

        if (!device_ip || !Array.isArray(software)) {
            return res.status(400).json({ error: 'device_ip and software array are required' });
        }

        // Cihazı bul
        const deviceResult = await client.query(
            'SELECT id FROM devices WHERE ip_address = $1',
            [device_ip]
        );

        if (deviceResult.rows.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        const deviceId = deviceResult.rows[0].id;

        await client.query('BEGIN');

        // Mevcut yazılım kayıtlarını sil ve yenilerini ekle
        await client.query('DELETE FROM device_software WHERE device_id = $1', [deviceId]);

        // Bulk insert
        if (software.length > 0) {
            const values = [];
            const params = [];
            let paramIdx = 1;

            for (const sw of software) {
                values.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
                params.push(
                    deviceId,
                    (sw.name || '').substring(0, 500),
                    (sw.version || '').substring(0, 100),
                    (sw.publisher || '').substring(0, 255),
                    (sw.install_date || '').substring(0, 50),
                    sw.source || 'registry'
                );
            }

            await client.query(
                `INSERT INTO device_software (device_id, name, version, publisher, install_date, source)
                 VALUES ${values.join(', ')}`,
                params
            );
        }

        await client.query('COMMIT');

        // Socket.IO ile bildir
        const io = req.app.get('io');
        if (io) {
            io.emit('software:updated', { device_id: deviceId, count: software.length });
        }

        res.json({ message: 'Software inventory updated', device_id: deviceId, count: software.length });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error updating software inventory:', err);
        res.status(500).json({ error: 'Failed to update software inventory' });
    } finally {
        client.release();
    }
});

// GET /api/software/:deviceId — Bir cihazın yazılım listesini döner
router.get('/:deviceId', async (req, res) => {
    try {
        const { search, source, sortBy, sortOrder } = req.query;

        let query = 'SELECT * FROM device_software WHERE device_id = $1';
        const params = [req.params.deviceId];
        let paramIdx = 2;

        if (search) {
            query += ` AND (name ILIKE $${paramIdx} OR publisher ILIKE $${paramIdx})`;
            params.push(`%${search}%`);
            paramIdx++;
        }

        if (source && source !== 'all') {
            query += ` AND source = $${paramIdx}`;
            params.push(source);
            paramIdx++;
        }

        const allowedSorts = ['name', 'version', 'publisher', 'source', 'install_date'];
        const sort = allowedSorts.includes(sortBy) ? sortBy : 'name';
        const order = sortOrder === 'desc' ? 'DESC' : 'ASC';
        query += ` ORDER BY ${sort} ${order}`;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching software:', err);
        res.status(500).json({ error: 'Failed to fetch software' });
    }
});

// GET /api/software/:deviceId/summary — Yazılım özeti
router.get('/:deviceId/summary', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT source, COUNT(*) as count 
             FROM device_software 
             WHERE device_id = $1 
             GROUP BY source`,
            [req.params.deviceId]
        );

        const total = await pool.query(
            'SELECT COUNT(*) as count FROM device_software WHERE device_id = $1',
            [req.params.deviceId]
        );

        res.json({
            total: parseInt(total.rows[0].count),
            bySource: result.rows.reduce((acc, r) => {
                acc[r.source] = parseInt(r.count);
                return acc;
            }, {})
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch software summary' });
    }
});

module.exports = router;
