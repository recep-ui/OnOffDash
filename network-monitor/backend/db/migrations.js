const { pool } = require('./connection');

async function runMigrations() {
    const client = await pool.connect();
    try {
        // devices tablosu
        await client.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'devices')
            BEGIN
                CREATE TABLE devices (
                    id              INT IDENTITY(1,1) PRIMARY KEY,
                    hostname        VARCHAR(255) NOT NULL,
                    ip_address      VARCHAR(45) UNIQUE NOT NULL,
                    mac_address     VARCHAR(17),
                    department      VARCHAR(100) DEFAULT '',
                    os_name         VARCHAR(100) DEFAULT '',
                    username        VARCHAR(100) DEFAULT '',
                    notes           NVARCHAR(MAX) DEFAULT '',
                    agent_installed BIT DEFAULT 0,
                    status          VARCHAR(20) DEFAULT 'offline',
                    last_seen       DATETIME2,
                    ping_ms         INTEGER,
                    created_at      DATETIME2 DEFAULT GETDATE(),
                    updated_at      DATETIME2 DEFAULT GETDATE()
                );
            END
        `);

        // device_status_logs tablosu
        await client.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'device_status_logs')
            BEGIN
                CREATE TABLE device_status_logs (
                    id               INT IDENTITY(1,1) PRIMARY KEY,
                    device_id        INTEGER REFERENCES devices(id) ON DELETE CASCADE,
                    status           VARCHAR(20) NOT NULL,
                    response_time_ms INTEGER,
                    checked_at       DATETIME2 DEFAULT GETDATE()
                );
            END
        `);

        // heartbeats tablosu
        await client.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'heartbeats')
            BEGIN
                CREATE TABLE heartbeats (
                    id              INT IDENTITY(1,1) PRIMARY KEY,
                    device_id       INTEGER REFERENCES devices(id) ON DELETE CASCADE,
                    cpu_usage       DECIMAL(5,2),
                    ram_usage       DECIMAL(5,2),
                    disk_usage      DECIMAL(5,2),
                    uptime_seconds  BIGINT,
                    last_seen       DATETIME2 DEFAULT GETDATE()
                );
            END
        `);

        // printers tablosu
        await client.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'printers')
            BEGIN
                CREATE TABLE printers (
                    id              INT IDENTITY(1,1) PRIMARY KEY,
                    name            VARCHAR(255) NOT NULL,
                    ip_address      VARCHAR(45) UNIQUE NOT NULL,
                    model           VARCHAR(255) DEFAULT '',
                    is_online       BIT DEFAULT 0,
                    last_updated    DATETIME2,
                    error_message   NVARCHAR(MAX) DEFAULT '',
                    has_paper_jam   BIT DEFAULT 0,
                    printer_status  VARCHAR(100) DEFAULT 'Unknown',
                    total_page_count BIGINT DEFAULT 0,
                    created_at      DATETIME2 DEFAULT GETDATE(),
                    updated_at      DATETIME2 DEFAULT GETDATE()
                );
            END
        `);

        // printer_toners tablosu
        await client.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'printer_toners')
            BEGIN
                CREATE TABLE printer_toners (
                    id              INT IDENTITY(1,1) PRIMARY KEY,
                    printer_id      INTEGER REFERENCES printers(id) ON DELETE CASCADE,
                    color           VARCHAR(50) NOT NULL,
                    level           INTEGER DEFAULT 0,
                    max_capacity    INTEGER DEFAULT 100,
                    pages_printed   BIGINT DEFAULT 0
                );
            END
        `);

        // printer_jam_logs tablosu
        await client.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'printer_jam_logs')
            BEGIN
                CREATE TABLE printer_jam_logs (
                    id              INT IDENTITY(1,1) PRIMARY KEY,
                    printer_id      INTEGER REFERENCES printers(id) ON DELETE CASCADE,
                    printer_name    VARCHAR(255),
                    status_detail   NVARCHAR(MAX),
                    is_resolved     BIT DEFAULT 0,
                    resolved_at     DATETIME2,
                    created_at      DATETIME2 DEFAULT GETDATE()
                );
            END
        `);

        // Performans indexleri
        await client.query(`IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_device_status_logs_device_id') CREATE INDEX idx_device_status_logs_device_id ON device_status_logs(device_id);`);
        await client.query(`IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_device_status_logs_checked_at') CREATE INDEX idx_device_status_logs_checked_at ON device_status_logs(checked_at);`);
        await client.query(`IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_heartbeats_device_id') CREATE INDEX idx_heartbeats_device_id ON heartbeats(device_id);`);
        await client.query(`IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_heartbeats_last_seen') CREATE INDEX idx_heartbeats_last_seen ON heartbeats(last_seen);`);
        await client.query(`IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_devices_status') CREATE INDEX idx_devices_status ON devices(status);`);
        await client.query(`IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_printers_ip') CREATE INDEX idx_printers_ip ON printers(ip_address);`);

        // device_software tablosu
        await client.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'device_software')
            BEGIN
                CREATE TABLE device_software (
                    id              INT IDENTITY(1,1) PRIMARY KEY,
                    device_id       INTEGER REFERENCES devices(id) ON DELETE CASCADE,
                    name            VARCHAR(500) NOT NULL,
                    version         VARCHAR(100) DEFAULT '',
                    publisher       VARCHAR(255) DEFAULT '',
                    install_date    VARCHAR(50) DEFAULT '',
                    source          VARCHAR(50) DEFAULT 'registry',
                    updated_at      DATETIME2 DEFAULT GETDATE()
                );
            END
        `);

        await client.query(`IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_device_software_device_id') CREATE INDEX idx_device_software_device_id ON device_software(device_id);`);
        await client.query(`IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_device_software_name') CREATE INDEX idx_device_software_name ON device_software(name);`);

        console.log('✅ All database migrations completed successfully.');
    } catch (err) {
        console.error('❌ Migration error:', err.message);
        throw err;
    } finally {
        client.release();
    }
}

module.exports = { runMigrations };
