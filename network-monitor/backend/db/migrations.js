const { pool } = require('./connection');

async function runMigrations() {
    const client = await pool.connect();
    try {
        // devices tablosu
        await client.query(`
            CREATE TABLE IF NOT EXISTS devices (
                id              SERIAL PRIMARY KEY,
                hostname        VARCHAR(255) NOT NULL,
                ip_address      VARCHAR(45) UNIQUE NOT NULL,
                mac_address     VARCHAR(17),
                department      VARCHAR(100) DEFAULT '',
                os_name         VARCHAR(100) DEFAULT '',
                username        VARCHAR(100) DEFAULT '',
                notes           TEXT DEFAULT '',
                agent_installed BOOLEAN DEFAULT FALSE,
                status          VARCHAR(20) DEFAULT 'offline',
                last_seen       TIMESTAMP WITH TIME ZONE,
                ping_ms         INTEGER,
                created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);

        // device_status_logs tablosu
        await client.query(`
            CREATE TABLE IF NOT EXISTS device_status_logs (
                id               SERIAL PRIMARY KEY,
                device_id        INTEGER REFERENCES devices(id) ON DELETE CASCADE,
                status           VARCHAR(20) NOT NULL,
                response_time_ms INTEGER,
                checked_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);

        // heartbeats tablosu
        await client.query(`
            CREATE TABLE IF NOT EXISTS heartbeats (
                id              SERIAL PRIMARY KEY,
                device_id       INTEGER REFERENCES devices(id) ON DELETE CASCADE,
                cpu_usage       DECIMAL(5,2),
                ram_usage       DECIMAL(5,2),
                disk_usage      DECIMAL(5,2),
                uptime_seconds  BIGINT,
                last_seen       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);

        // printers tablosu (mevcut PrinterDashboard entegrasyonu)
        await client.query(`
            CREATE TABLE IF NOT EXISTS printers (
                id              SERIAL PRIMARY KEY,
                name            VARCHAR(255) NOT NULL,
                ip_address      VARCHAR(45) UNIQUE NOT NULL,
                model           VARCHAR(255) DEFAULT '',
                is_online       BOOLEAN DEFAULT FALSE,
                last_updated    TIMESTAMP WITH TIME ZONE,
                error_message   TEXT DEFAULT '',
                has_paper_jam   BOOLEAN DEFAULT FALSE,
                printer_status  VARCHAR(100) DEFAULT 'Unknown',
                total_page_count BIGINT DEFAULT 0,
                created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);

        // printer_toners tablosu
        await client.query(`
            CREATE TABLE IF NOT EXISTS printer_toners (
                id              SERIAL PRIMARY KEY,
                printer_id      INTEGER REFERENCES printers(id) ON DELETE CASCADE,
                color           VARCHAR(50) NOT NULL,
                level           INTEGER DEFAULT 0,
                max_capacity    INTEGER DEFAULT 100,
                pages_printed   BIGINT DEFAULT 0
            );
        `);

        // printer_jam_logs tablosu
        await client.query(`
            CREATE TABLE IF NOT EXISTS printer_jam_logs (
                id              SERIAL PRIMARY KEY,
                printer_id      INTEGER REFERENCES printers(id) ON DELETE CASCADE,
                printer_name    VARCHAR(255),
                status_detail   TEXT,
                is_resolved     BOOLEAN DEFAULT FALSE,
                resolved_at     TIMESTAMP WITH TIME ZONE,
                created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);

        // Performans indexleri
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_device_status_logs_device_id ON device_status_logs(device_id);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_device_status_logs_checked_at ON device_status_logs(checked_at);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_heartbeats_device_id ON heartbeats(device_id);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_heartbeats_last_seen ON heartbeats(last_seen);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_printers_ip ON printers(ip_address);
        `);

        // device_software tablosu (yazılım envanteri)
        await client.query(`
            CREATE TABLE IF NOT EXISTS device_software (
                id              SERIAL PRIMARY KEY,
                device_id       INTEGER REFERENCES devices(id) ON DELETE CASCADE,
                name            VARCHAR(500) NOT NULL,
                version         VARCHAR(100) DEFAULT '',
                publisher       VARCHAR(255) DEFAULT '',
                install_date    VARCHAR(50) DEFAULT '',
                source          VARCHAR(50) DEFAULT 'registry',
                updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_device_software_device_id ON device_software(device_id);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_device_software_name ON device_software(name);
        `);

        console.log('✅ All database migrations completed successfully.');
    } catch (err) {
        console.error('❌ Migration error:', err.message);
        throw err;
    } finally {
        client.release();
    }
}

module.exports = { runMigrations };
