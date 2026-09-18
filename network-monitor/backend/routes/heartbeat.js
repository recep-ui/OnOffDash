const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');
const { authenticateAgent } = require('../middleware/agentAuth');

// POST /api/heartbeat — Agent'tan heartbeat al (Authenticated with AGENT_API_KEY)
router.post('/', authenticateAgent, async (req, res) => {
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

        // 1. Mevcut durumu kontrol et (yalnızca durum değiştiğinde log kaydı oluşturmak için)
        const existingRes = await pool.query('SELECT id, status, agent_status FROM devices WHERE ip_address = $1', [ip_address]);
        const previousStatus = existingRes.rows.length > 0 ? existingRes.rows[0].status : null;
        const previousAgentStatus = existingRes.rows.length > 0 ? existingRes.rows[0].agent_status : 'offline';
        const isTransition = existingRes.rows.length === 0 || (previousStatus && previousStatus !== 'online');
        const isAgentTransition = previousAgentStatus !== 'online';

        // 2. Cihazı bul veya oluştur (upsert)
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
                     agent_status = 'online',
                     last_heartbeat_at = GETDATE(),
                     last_seen = GETDATE(),
                     updated_at = GETDATE()
             WHEN NOT MATCHED THEN
                 INSERT (hostname, ip_address, mac_address, os_name, username, agent_installed, agent_status, status, last_heartbeat_at, last_seen, updated_at)
                 VALUES (source.hostname, source.ip_address, source.mac_address, source.os_name, source.username, 1, 'online', 'online', GETDATE(), GETDATE(), GETDATE())
             OUTPUT INSERTED.*;`,
            [hostname, ip_address, mac_address || null, os_name || '', username || '']
        );

        const device = deviceResult.rows[0];

        // 3. Heartbeat telemetri kaydı oluştur
        await pool.query(
            `INSERT INTO heartbeats (device_id, cpu_usage, ram_usage, disk_usage, uptime_seconds)
             VALUES ($1, $2, $3, $4, $5)`,
            [device.id, cpu_usage || null, ram_usage || null, disk_usage || null, uptime_seconds || null]
        );

        // 4. Durum log kaydı — Yalnızca gerçek durum geçişi olduğunda yaz (online -> online tekrarını engelle)
        if (isTransition) {
            await pool.query(
                `INSERT INTO device_status_logs (device_id, status, checked_at)
                 VALUES ($1, 'online', GETDATE())`,
                [device.id]
            );
        }

        // 5. Socket.IO ile canlı güncelleme (Kanonik Kontrat)
        const io = req.app.get('io');
        if (io) {
            io.emit('device:updated', device);
            if (isTransition) {
                io.emit('device:statusChanged', {
                    device: {
                        id: device.id,
                        hostname: device.hostname,
                        ip_address: device.ip_address
                    },
                    oldStatus: previousStatus || 'unknown',
                    newStatus: 'online',
                    reason: null,
                    timestamp: new Date().toISOString()
                });
            }
            if (isAgentTransition) {
                io.emit('agent:statusChanged', {
                    device: {
                        id: device.id,
                        hostname: device.hostname,
                        ip_address: device.ip_address
                    },
                    oldStatus: previousAgentStatus || 'offline',
                    newStatus: 'online',
                    reason: null,
                    timestamp: new Date().toISOString()
                });
            }
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
