const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');
const { authenticateAgent } = require('../middleware/agentAuth');

const { validateHeartbeatPayload } = require('../utils/validators');

// POST /api/heartbeat — Agent'tan heartbeat al (Authenticated with AGENT_API_KEY or per-agent key)
router.post('/', authenticateAgent, async (req, res) => {
    try {
        const validation = validateHeartbeatPayload(req.body);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

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

        let targetDeviceId = null;

        // Per-device kimlik doğrulama yapıldıysa anahtarın bağlı olduğu cihaz doğrulanmalıdır
        if (req.authenticatedDeviceId) {
            const boundDevRes = await pool.query('SELECT id, ip_address FROM devices WHERE id = $1', [req.authenticatedDeviceId]);
            if (boundDevRes.rows.length === 0) {
                return res.status(403).json({ 
                    error: 'Yetkili ajana bağlı cihaz bulunamadı.' 
                });
            }
            const boundDevice = boundDevRes.rows[0];
            if (boundDevice.ip_address.trim() !== ip_address.trim()) {
                return res.status(403).json({ 
                    error: 'Yetkili ajan başka bir cihaz adına telemetri bildiremez.' 
                });
            }
            targetDeviceId = boundDevice.id;
        } else {
            // Legacy authentication path (requires ALLOW_LEGACY_AGENT_AUTH=true)
            // MUST NEVER implicitly create new devices or claim arbitrary IPs
            const existingRes = await pool.query('SELECT id FROM devices WHERE ip_address = $1', [ip_address.trim()]);
            if (existingRes.rows.length === 0) {
                return res.status(403).json({ 
                    error: 'Eski kimlik doğrulama ile yeni cihaz kaydı oluşturulamaz. Cihazı sisteme kaydediniz.' 
                });
            }
            targetDeviceId = existingRes.rows[0].id;

            // Security check: Devices with enrolled per-device credentials cannot be updated via legacy shared key
            const enrolledCreds = await pool.query(
                'SELECT COUNT(*) as cred_count FROM agent_credentials WHERE device_id = $1 AND is_revoked = 0',
                [targetDeviceId]
            );
            const count = parseInt(enrolledCreds.rows[0]?.cred_count || 0, 10);
            if (count > 0) {
                return res.status(403).json({
                    error: 'Bu cihaz için cihaza özel kimlik doğrulama tanımlıdır. Eski paylaşımlı anahtarla güncellenemez.'
                });
            }
        }

        // 1. Mevcut agent durumunu kontrol et (agent_status geçişinde event yaymak için)
        const existingRes = await pool.query('SELECT id, status, agent_status FROM devices WHERE id = $1', [targetDeviceId]);
        const previousAgentStatus = existingRes.rows.length > 0 ? (existingRes.rows[0].agent_status || 'offline') : 'offline';
        const isAgentTransition = previousAgentStatus !== 'online';

        // 2. Cihazı güncelle (asla bilinmeyen/yetkisiz cihaz oluşturulmaz)
        const deviceResult = await pool.query(
            `UPDATE devices SET
                hostname = $1,
                mac_address = COALESCE($2, mac_address),
                os_name = COALESCE(NULLIF($3, ''), os_name),
                username = COALESCE(NULLIF($4, ''), username),
                agent_installed = 1,
                agent_status = 'online',
                last_heartbeat_at = GETDATE(),
                last_seen = GETDATE(),
                updated_at = GETDATE()
             OUTPUT INSERTED.*
             WHERE id = $5`,
            [hostname, mac_address || null, os_name || '', username || '', targetDeviceId]
        );

        const device = deviceResult.rows[0];

        // 3. Heartbeat telemetri kaydı oluştur
        await pool.query(
            `INSERT INTO heartbeats (device_id, cpu_usage, ram_usage, disk_usage, uptime_seconds)
             VALUES ($1, $2, $3, $4, $5)`,
            [device.id, cpu_usage || null, ram_usage || null, disk_usage || null, uptime_seconds || null]
        );

        // 4. Socket.IO ile canlı güncelleme (Kanonik Kontrat)
        // Heartbeat ASLA device:statusChanged yayınlamaz. Sadece agent:statusChanged yayabilir.
        const io = req.app.get('io');
        if (io) {
            io.emit('device:updated', device);
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
