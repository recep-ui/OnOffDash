const ping = require('ping');
const { pool } = require('../db/connection');

class PingService {
    constructor(io) {
        this.io = io;
        this.isScanning = false;
    }

    async scanAllDevices() {
        if (this.isScanning) {
            console.log('⏳ Scan already in progress, skipping...');
            return;
        }

        this.isScanning = true;
        console.log('🔍 Starting ping scan...');

        try {
            const result = await pool.query('SELECT * FROM devices');
            const devices = result.rows;

            if (devices.length === 0) {
                console.log('ℹ️  No devices to scan.');
                return;
            }

            const promises = devices.map(device => this.pingDevice(device));
            await Promise.allSettled(promises);

            // Heartbeat timeout kontrolü — agent kurulu cihazlarda
            await this.checkHeartbeatTimeouts();

            // Dashboard istatistiklerini güncelle
            this.emitStats();

            console.log(`✅ Scan completed. ${devices.length} devices checked.`);
        } catch (err) {
            console.error('❌ Ping scan error:', err);
        } finally {
            this.isScanning = false;
        }
    }

    async pingDevice(device) {
        try {
            const res = await ping.promise.probe(device.ip_address, {
                timeout: 5,
                min_reply: 1,
            });

            const pingMs = res.time === 'unknown' ? null : Math.round(parseFloat(res.time));
            let newStatus;

            if (res.alive) {
                if (pingMs !== null && pingMs > 200) {
                    newStatus = 'warning';
                } else {
                    newStatus = 'online';
                }
            } else {
                // Agent kurulu cihazlarda, heartbeat varsa çevrimiçi kalabilir
                if (device.agent_installed) {
                    const timeoutSeconds = parseInt(process.env.HEARTBEAT_TIMEOUT_SECONDS || '90');
                    const lastSeen = device.last_seen ? new Date(device.last_seen) : null;
                    const now = new Date();

                    if (lastSeen && (now - lastSeen) / 1000 < timeoutSeconds) {
                        newStatus = 'online';
                    } else {
                        newStatus = 'offline';
                    }
                } else {
                    newStatus = 'offline';
                }
            }

            const lastSeenValue = newStatus === 'online' ? new Date() : (device.last_seen ? new Date(device.last_seen) : null);

            // Veritabanını güncelle
            const updateResult = await pool.query(
                `UPDATE devices SET
                    status = $1,
                    ping_ms = $2,
                    last_seen = COALESCE($3, last_seen),
                    updated_at = NOW()
                 WHERE id = $4
                 RETURNING *`,
                [newStatus, pingMs, lastSeenValue, device.id]
            );

            // Durum log kaydı
            await pool.query(
                `INSERT INTO device_status_logs (device_id, status, response_time_ms)
                 VALUES ($1, $2, $3)`,
                [device.id, newStatus, pingMs]
            );

            // Durum değişikliği varsa Socket.IO ile bildir
            if (device.status !== newStatus && updateResult.rows.length > 0) {
                this.io.emit('device:updated', updateResult.rows[0]);
                this.io.emit('device:statusChanged', {
                    device_id: device.id,
                    hostname: device.hostname,
                    oldStatus: device.status,
                    newStatus: newStatus,
                    timestamp: new Date().toISOString()
                });
                console.log(`   📡 ${device.hostname} (${device.ip_address}): ${device.status} → ${newStatus}`);
            }

        } catch (err) {
            console.error(`   ❌ Ping failed for ${device.hostname} (${device.ip_address}):`, err.message);
        }
    }

    async checkHeartbeatTimeouts() {
        const timeoutSeconds = parseInt(process.env.HEARTBEAT_TIMEOUT_SECONDS || '90');

        try {
            const result = await pool.query(
                `UPDATE devices SET
                    status = 'offline',
                    updated_at = NOW()
                 WHERE agent_installed = true
                   AND status = 'online'
                   AND last_seen < NOW() - make_interval(secs => $1)
                 RETURNING *`,
                [timeoutSeconds]
            );

            for (const device of result.rows) {
                this.io.emit('device:updated', device);
                this.io.emit('device:statusChanged', {
                    device_id: device.id,
                    hostname: device.hostname,
                    oldStatus: 'online',
                    newStatus: 'offline',
                    reason: 'heartbeat_timeout',
                    timestamp: new Date().toISOString()
                });
                console.log(`   ⏰ ${device.hostname}: heartbeat timeout → offline`);
            }
        } catch (err) {
            console.error('❌ Heartbeat timeout check error:', err.message);
        }
    }

    async emitStats() {
        try {
            const totalResult = await pool.query('SELECT COUNT(*) as count FROM devices');
            const onlineResult = await pool.query(`SELECT COUNT(*) as count FROM devices WHERE status = 'online'`);
            const offlineResult = await pool.query(`SELECT COUNT(*) as count FROM devices WHERE status = 'offline'`);
            const warningResult = await pool.query(`SELECT COUNT(*) as count FROM devices WHERE status = 'warning'`);

            const printersResult = await pool.query(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN is_online = true THEN 1 ELSE 0 END) as online,
                    SUM(CASE WHEN has_paper_jam = true THEN 1 ELSE 0 END) as jam
                FROM printers
            `);
            const pStats = printersResult.rows[0];

            this.io.emit('dashboard:stats', {
                devices: {
                    total: parseInt(totalResult.rows[0].count),
                    online: parseInt(onlineResult.rows[0].count),
                    offline: parseInt(offlineResult.rows[0].count),
                    warning: parseInt(warningResult.rows[0].count),
                },
                printers: {
                    total: parseInt(pStats.total || 0),
                    online: parseInt(pStats.online || 0),
                    jam: parseInt(pStats.jam || 0)
                },
                lastScanTime: new Date().toISOString()
            });
        } catch (err) {
            console.error('❌ Stats emit error:', err.message);
        }
    }
}

module.exports = PingService;
