const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');

// POST /api/heartbeat — Agent'tan heartbeat al
router.post('/', async (req, res) => {
    try {
        const {
            hostname,
            ip_address,
            mac_address,
            os_name,
            username,
            cpu_usage,
            ram_usage,
            disk_usage,
            uptime_seconds
        } = req.body;

        if (!hostname || !ip_address) {
            return res.status(400).json({ error: 'hostname and ip_address are required' });
        }

        // Cihazı bul veya oluştur (upsert)
        const deviceResult = await pool.query(
            `MERGE INTO devices AS target
             USING (VALUES ($1, $2, $3, $4, $5)) AS source (hostname, ip_address, mac_address, os_name, username)
             ON target.ip_address = source.ip_address
             WHEN MATCHED THEN
                 UPDATE SET
                     hostname = source.hostname,
                     mac_address = COALESCE(source.mac_address, target.mac_address),
                     os_name = COALESCE(source.os_name, target.os_name),
                     username = COALESCE(source.username, target.username),
                     agent_installed = 1,
                     status = 'online',
                     last_seen = GETDATE(),
                     updated_at = GETDATE()
             WHEN NOT MATCHED THEN
                 INSERT (hostname, ip_address, mac_address, os_name, username, agent_installed, status, last_seen, updated_at)
                 VALUES (source.hostname, source.ip_address, source.mac_address, source.os_name, source.username, 1, 'online', GETDATE(), GETDATE())
             OUTPUT INSERTED.*;`,
            [hostname, ip_address, mac_address || null, os_name || '', username || '']
        );

        const device = deviceResult.rows[0];

        // Heartbeat kaydı oluştur
        await pool.query(
            `INSERT INTO heartbeats (device_id, cpu_usage, ram_usage, disk_usage, uptime_seconds)
             VALUES ($1, $2, $3, $4, $5)`,
            [device.id, cpu_usage || null, ram_usage || null, disk_usage || null, uptime_seconds || null]
        );

        // Durum log kaydı
        await pool.query(
            `INSERT INTO device_status_logs (device_id, status, checked_at)
             VALUES ($1, 'online', GETDATE())`,
            [device.id]
        );

        // Socket.IO ile canlı güncelleme
        const io = req.app.get('io');
        if (io) {
            io.emit('device:updated', device);
            io.emit('heartbeat:received', {
                device_id: device.id,
                hostname: device.hostname,
                cpu_usage,
                ram_usage,
                disk_usage,
                uptime_seconds,
                last_seen: new Date().toISOString()
            });
        }

        res.json({ message: 'Heartbeat received', device_id: device.id });
    } catch (err) {
        console.error('Error processing heartbeat:', err);
        res.status(500).json({ error: 'Failed to process heartbeat' });
    }
});

module.exports = router;
