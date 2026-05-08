const { pool } = require('../db/connection');

/**
 * CleanupService — Eski log ve heartbeat kayıtlarını periyodik olarak temizler.
 * 
 * Varsayılan saklama süresi: 30 gün
 * Bu süre .env dosyasındaki RETENTION_DAYS değişkeni ile özelleştirilebilir.
 */
class CleanupService {
    constructor() {
        this.retentionDays = parseInt(process.env.RETENTION_DAYS || '30');
    }

    async runCleanup() {
        console.log(`🧹 Starting data cleanup (retention: ${this.retentionDays} days)...`);

        try {
            const results = await Promise.allSettled([
                this.cleanDeviceStatusLogs(),
                this.cleanHeartbeats(),
                this.cleanPrinterJamLogs()
            ]);

            let totalDeleted = 0;
            for (const result of results) {
                if (result.status === 'fulfilled') {
                    totalDeleted += result.value;
                }
            }

            console.log(`✅ Cleanup completed. ${totalDeleted} old records removed.`);
        } catch (err) {
            console.error('❌ Cleanup error:', err.message);
        }
    }

    async cleanDeviceStatusLogs() {
        try {
            const result = await pool.query(
                `DELETE FROM device_status_logs 
                 WHERE checked_at < NOW() - make_interval(days => $1)`,
                [this.retentionDays]
            );
            const count = result.rowCount || 0;
            if (count > 0) {
                console.log(`   🗑️  device_status_logs: ${count} eski kayıt silindi`);
            }
            return count;
        } catch (err) {
            console.error('   ❌ device_status_logs cleanup error:', err.message);
            return 0;
        }
    }

    async cleanHeartbeats() {
        try {
            const result = await pool.query(
                `DELETE FROM heartbeats 
                 WHERE last_seen < NOW() - make_interval(days => $1)`,
                [this.retentionDays]
            );
            const count = result.rowCount || 0;
            if (count > 0) {
                console.log(`   🗑️  heartbeats: ${count} eski kayıt silindi`);
            }
            return count;
        } catch (err) {
            console.error('   ❌ heartbeats cleanup error:', err.message);
            return 0;
        }
    }

    async cleanPrinterJamLogs() {
        try {
            const result = await pool.query(
                `DELETE FROM printer_jam_logs 
                 WHERE created_at < NOW() - make_interval(days => $1)
                   AND is_resolved = true`,
                [this.retentionDays]
            );
            const count = result.rowCount || 0;
            if (count > 0) {
                console.log(`   🗑️  printer_jam_logs: ${count} eski kayıt silindi`);
            }
            return count;
        } catch (err) {
            console.error('   ❌ printer_jam_logs cleanup error:', err.message);
            return 0;
        }
    }
}

module.exports = CleanupService;
