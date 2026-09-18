const ping = require('ping');
const { pool } = require('../db/connection');

class PingService {
    constructor(io) {
        this.io = io;
        this.isScanning = false;
        this.activePings = new Set();
        this.concurrency = parseInt(process.env.PING_CONCURRENCY || '25', 10);
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

            // Bounded concurrency execution with small jitter to prevent thundering herd
            const concurrency = Math.max(1, this.concurrency);
            let index = 0;
            const workers = [];

            const worker = async () => {
                while (index < devices.length) {
                    const currentIndex = index++;
                    const device = devices[currentIndex];
                    if (!device) continue;

                    // Small jitter between scan starts (5–15ms)
                    const jitter = Math.floor(Math.random() * 10) + 5;
                    await new Promise(resolve => setTimeout(resolve, jitter));

                    await this.pingDevice(device);
                }
            };

            const workerCount = Math.min(concurrency, devices.length);
            for (let i = 0; i < workerCount; i++) {
                workers.push(worker());
            }
            await Promise.allSettled(workers);

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
        if (!device || !device.ip_address) return;

        // Prevent duplicate simultaneous scans of the same target
        if (this.activePings.has(device.id)) {
            return;
        }
        this.activePings.add(device.id);

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
                newStatus = 'offline';
            }

            const isTransition = (device.status !== newStatus);

            // Veritabanını güncelle (last_ping_at her ping taramasında güncellenir, last_seen geriye uyumluluk için online ise yenilenir)
            const updateResult = await pool.query(
                `UPDATE devices SET
                    status = $1,
                    ping_ms = $2,
                    last_ping_at = GETDATE(),
                    last_seen = CASE WHEN $1 = 'online' THEN GETDATE() ELSE last_seen END,
                    updated_at = GETDATE()
                 OUTPUT INSERTED.*
                 WHERE id = $3`,
                [newStatus, pingMs, device.id]
            );

            // Durum log kaydı: YALNIZCA gerçek bir durum değişikliği (transition) olduğunda yazılır
            // Tekrarlanan aynı durumlar (online->online, offline->offline) için log kaydı ATILMAZ
            if (isTransition) {
                await pool.query(
                    `INSERT INTO device_status_logs (device_id, status, response_time_ms, checked_at)
                     VALUES ($1, $2, $3, GETDATE())`,
                    [device.id, newStatus, pingMs]
                );

                // Socket.IO ile standart kanonik kontrat ile bildir
                if (updateResult.rows.length > 0) {
                    const updatedDevice = updateResult.rows[0];
                    this.io.emit('device:updated', updatedDevice);
                    this.io.emit('device:statusChanged', {
                        device: {
                            id: updatedDevice.id,
                            hostname: updatedDevice.hostname,
                            ip_address: updatedDevice.ip_address
                        },
                        oldStatus: device.status,
                        newStatus: newStatus,
                        reason: null,
                        timestamp: new Date().toISOString()
                    });
                    console.log(`   📡 ${device.hostname} (${device.ip_address}): ${device.status} → ${newStatus}`);
                }
            }
        } catch (err) {
            console.error(`   ❌ Ping failed for ${device.hostname} (${device.ip_address}):`, err.message);
        } finally {
            this.activePings.delete(device.id);
        }
    }

    async checkHeartbeatTimeouts() {
        const timeoutSeconds = parseInt(process.env.HEARTBEAT_TIMEOUT_SECONDS || '90');

        try {
            // Heartbeat timeout kontrolü: Yalnızca last_heartbeat_at alanını kontrol eder
            // Ping'den bağımsız olarak agent_status sütununu günceller
            const result = await pool.query(
                `UPDATE devices SET
                    agent_status = 'offline',
                    updated_at = GETDATE()
                 OUTPUT INSERTED.*
                 WHERE agent_installed = 1
                   AND agent_status = 'online'
                   AND (last_heartbeat_at IS NULL OR last_heartbeat_at < DATEADD(second, -$1, GETDATE()))`,
                [timeoutSeconds]
            );

            for (const device of result.rows) {
                this.io.emit('device:updated', device);
                this.io.emit('agent:statusChanged', {
                    device: {
                        id: device.id,
                        hostname: device.hostname,
                        ip_address: device.ip_address
                    },
                    oldStatus: 'online',
                    newStatus: 'offline',
                    reason: 'heartbeat_timeout',
                    timestamp: new Date().toISOString()
                });
                console.log(`   ⏰ ${device.hostname}: agent heartbeat timeout → agent offline`);
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
                    SUM(CASE WHEN is_online = 1 THEN 1 ELSE 0 END) as online,
                    SUM(CASE WHEN has_paper_jam = 1 THEN 1 ELSE 0 END) as jam
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
