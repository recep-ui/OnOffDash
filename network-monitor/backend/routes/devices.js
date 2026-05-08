const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');

// GET /api/devices — Tüm cihazları listele
router.get('/', async (req, res) => {
    try {
        const { status, department, agent, search, sortBy, sortOrder } = req.query;

        let query = `
            SELECT d.*, h.cpu_usage, h.ram_usage, h.uptime_seconds 
            FROM devices d
            LEFT JOIN LATERAL (
                SELECT cpu_usage, ram_usage, uptime_seconds
                FROM heartbeats
                WHERE device_id = d.id
                ORDER BY last_seen DESC
                LIMIT 1
            ) h ON true
        `;
        const conditions = [];
        const params = [];
        let paramIndex = 1;

        if (status && status !== 'all') {
            conditions.push(`status = $${paramIndex++}`);
            params.push(status);
        }
        if (department) {
            conditions.push(`department = $${paramIndex++}`);
            params.push(department);
        }
        if (agent !== undefined && agent !== '') {
            conditions.push(`agent_installed = $${paramIndex++}`);
            params.push(agent === 'true');
        }
        if (search) {
            conditions.push(`(hostname ILIKE $${paramIndex} OR ip_address ILIKE $${paramIndex} OR username ILIKE $${paramIndex})`);
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        // Sıralama
        const allowedSorts = ['hostname', 'ip_address', 'status', 'last_seen', 'ping_ms', 'department', 'created_at'];
        const sort = allowedSorts.includes(sortBy) ? sortBy : 'hostname';
        const order = sortOrder === 'desc' ? 'DESC' : 'ASC';
        query += ` ORDER BY ${sort} ${order}`;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching devices:', err);
        res.status(500).json({ error: 'Failed to fetch devices' });
    }
});

// GET /api/devices/departments — Benzersiz departmanları listele
router.get('/departments', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT DISTINCT department FROM devices WHERE department IS NOT NULL AND department != '' ORDER BY department`
        );
        res.json(result.rows.map(r => r.department));
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch departments' });
    }
});

// GET /api/devices/:id — Tek cihaz detayı
router.get('/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM devices WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch device' });
    }
});

// POST /api/devices — Manuel cihaz ekle
router.post('/', async (req, res) => {
    try {
        const { hostname, ip_address, mac_address, department, os_name, username, notes } = req.body;

        if (!hostname || !ip_address) {
            return res.status(400).json({ error: 'hostname and ip_address are required' });
        }

        const result = await pool.query(
            `INSERT INTO devices (hostname, ip_address, mac_address, department, os_name, username, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (ip_address) DO UPDATE SET
                hostname = EXCLUDED.hostname,
                mac_address = COALESCE(EXCLUDED.mac_address, devices.mac_address),
                department = COALESCE(EXCLUDED.department, devices.department),
                os_name = COALESCE(EXCLUDED.os_name, devices.os_name),
                username = COALESCE(EXCLUDED.username, devices.username),
                notes = COALESCE(EXCLUDED.notes, devices.notes),
                updated_at = NOW()
             RETURNING *`,
            [hostname, ip_address, mac_address || null, department || '', os_name || '', username || '', notes || '']
        );

        const device = result.rows[0];

        // Socket.IO ile bildiri
        const io = req.app.get('io');
        if (io) io.emit('device:added', device);

        res.status(201).json(device);
    } catch (err) {
        console.error('Error adding device:', err);
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Device with this IP already exists' });
        }
        res.status(500).json({ error: 'Failed to add device' });
    }
});

// PUT /api/devices/:id — Cihaz güncelle
router.put('/:id', async (req, res) => {
    try {
        const { hostname, ip_address, mac_address, department, os_name, username, notes } = req.body;

        const result = await pool.query(
            `UPDATE devices SET
                hostname = COALESCE($1, hostname),
                ip_address = COALESCE($2, ip_address),
                mac_address = COALESCE($3, mac_address),
                department = COALESCE($4, department),
                os_name = COALESCE($5, os_name),
                username = COALESCE($6, username),
                notes = COALESCE($7, notes),
                updated_at = NOW()
             WHERE id = $8
             RETURNING *`,
            [hostname, ip_address, mac_address, department, os_name, username, notes, req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        const device = result.rows[0];
        const io = req.app.get('io');
        if (io) io.emit('device:updated', device);

        res.json(device);
    } catch (err) {
        console.error('Error updating device:', err);
        res.status(500).json({ error: 'Failed to update device' });
    }
});

// DELETE /api/devices/:id — Cihaz sil
router.delete('/:id', async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM devices WHERE id = $1 RETURNING id', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        const io = req.app.get('io');
        if (io) io.emit('device:deleted', { id: parseInt(req.params.id) });

        res.json({ message: 'Device deleted', id: parseInt(req.params.id) });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete device' });
    }
});

// GET /api/devices/:id/logs — Durum logları
router.get('/:id/logs', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const result = await pool.query(
            `SELECT * FROM device_status_logs WHERE device_id = $1 ORDER BY checked_at DESC LIMIT $2`,
            [req.params.id, limit]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

// GET /api/devices/:id/heartbeats — Son heartbeat'ler (zaman filtreli)
router.get('/:id/heartbeats', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 200;
        const hours = parseInt(req.query.hours) || 0;

        let query = 'SELECT * FROM heartbeats WHERE device_id = $1';
        const params = [req.params.id];
        let paramIdx = 2;

        if (hours > 0) {
            query += ` AND last_seen > NOW() - make_interval(hours => $${paramIdx})`;
            params.push(hours);
            paramIdx++;
        }

        query += ` ORDER BY last_seen DESC LIMIT $${paramIdx}`;
        params.push(limit);

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch heartbeats' });
    }
});

module.exports = router;
