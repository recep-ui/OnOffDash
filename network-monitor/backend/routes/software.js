const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');
const { authenticateAgent } = require('../middleware/agentAuth');

const { isValidIP } = require('../utils/validators');

const MAX_SOFTWARE_ITEMS = 2000;
const CHUNK_SIZE = 100;

// POST /api/software — Agent'tan yazılım listesi al (bulk upsert with transaction safety)
router.post('/', authenticateAgent, async (req, res) => {
    try {
        const { device_ip, software } = req.body;

        if (!device_ip || !isValidIP(device_ip)) {
            return res.status(400).json({ error: 'Valid device_ip (IPv4 or IPv6) is required' });
        }

        if (!Array.isArray(software)) {
            return res.status(400).json({ error: 'software must be an array' });
        }

        if (software.length > MAX_SOFTWARE_ITEMS) {
            return res.status(413).json({ 
                error: `Software inventory exceeds maximum allowed limit of ${MAX_SOFTWARE_ITEMS} items` 
            });
        }

        // Schema validation for software items
        for (let i = 0; i < software.length; i++) {
            const sw = software[i];
            if (!sw || typeof sw !== 'object' || typeof sw.name !== 'string' || sw.name.trim() === '') {
                return res.status(400).json({ 
                    error: `Malformed software item at index ${i}: name must be a non-empty string` 
                });
            }
        }

        // Per-device kimlik doğrulama yapıldıysa anahtarın bağlı olduğu cihaz doğrulanmalıdır
        if (req.authenticatedDeviceId) {
            const boundDevRes = await pool.query('SELECT id, ip_address FROM devices WHERE id = $1', [req.authenticatedDeviceId]);
            if (boundDevRes.rows.length === 0 || boundDevRes.rows[0].ip_address.trim() !== device_ip.trim()) {
                return res.status(403).json({ 
                    error: 'Yetkili ajan başka bir cihaz adına yazılım envanteri bildiremez.' 
                });
            }
        }

        // Cihazı bul veya doğrulanmış ID'yi kullan
        let deviceId;
        if (req.authenticatedDeviceId) {
            deviceId = req.authenticatedDeviceId;
        } else {
            const deviceResult = await pool.query(
                'SELECT id FROM devices WHERE ip_address = $1',
                [device_ip.trim()]
            );

            if (deviceResult.rows.length === 0) {
                return res.status(404).json({ error: 'Device not found' });
            }
            deviceId = deviceResult.rows[0].id;
        }

        // Atomik işlem: Tek transaction içinde eski kayıtları sil ve chunk'lar halinde ekle
        const client = await pool.connect();
        try {
            await client.query('BEGIN TRAN');
            await client.query('DELETE FROM device_software WHERE device_id = $1', [deviceId]);

            if (software.length > 0) {
                for (let i = 0; i < software.length; i += CHUNK_SIZE) {
                    const chunk = software.slice(i, i + CHUNK_SIZE);
                    const values = [];
                    const params = [deviceId];
                    let paramIdx = 2;

                    for (const sw of chunk) {
                        values.push(`($1, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
                        params.push(
                            String(sw.name).trim().substring(0, 500),
                            String(sw.version || '').trim().substring(0, 100),
                            String(sw.publisher || '').trim().substring(0, 255),
                            String(sw.install_date || '').trim().substring(0, 50),
                            String(sw.source || 'registry').trim().substring(0, 50)
                        );
                    }

                    const insertSql = `
                        INSERT INTO device_software (device_id, name, version, publisher, install_date, source)
                        VALUES ${values.join(', ')};
                    `;
                    await client.query(insertSql, params);
                }
            }

            await client.query('COMMIT TRAN');
        } catch (txErr) {
            await client.query('IF @@TRANCOUNT > 0 ROLLBACK TRAN');
            throw txErr;
        } finally {
            client.release();
        }

        // Socket.IO ile bildir
        const io = req.app.get('io');
        if (io) {
            io.emit('software:updated', { device_id: deviceId, count: software.length });
        }

        res.json({ message: 'Software inventory updated', device_id: deviceId, count: software.length });
    } catch (err) {
        console.error('Error updating software inventory:', err);
        res.status(500).json({ error: 'Failed to update software inventory' });
    }
});

// GET /api/software/:deviceId — Bir cihazın yazılım listesini döner
router.get('/:deviceId', authenticateToken, async (req, res) => {
    try {
        const { search, source, sortBy, sortOrder } = req.query;

        let query = 'SELECT * FROM device_software WHERE device_id = $1';
        const params = [req.params.deviceId];
        let paramIdx = 2;

        if (search) {
            query += ` AND (name LIKE $${paramIdx} OR publisher LIKE $${paramIdx})`;
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
router.get('/:deviceId/summary', authenticateToken, async (req, res) => {
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
