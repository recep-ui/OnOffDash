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

        // envanter alanlarını ekle
        await client.query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('devices') AND name = 'pc_type')
            BEGIN
                ALTER TABLE devices ADD 
                    pc_type VARCHAR(100) DEFAULT '',
                    device_manufacturer VARCHAR(255) DEFAULT '',
                    device_model VARCHAR(255) DEFAULT '',
                    serial_number VARCHAR(100) DEFAULT '',
                    cpu_description VARCHAR(255) DEFAULT '',
                    cpu_cores INT DEFAULT 0,
                    ram_mb INT DEFAULT 0,
                    storage_mb INT DEFAULT 0,
                    monitor_model VARCHAR(255) DEFAULT '',
                    monitor_serial VARCHAR(100) DEFAULT '',
                    keyboard_model VARCHAR(255) DEFAULT '',
                    keyboard_serial VARCHAR(100) DEFAULT '',
                    mouse_model VARCHAR(255) DEFAULT '',
                    mouse_serial VARCHAR(100) DEFAULT '',
                    phone_model VARCHAR(255) DEFAULT '',
                    phone_serial VARCHAR(100) DEFAULT '';
            END
        `);

        // printers envanter alanlarını ekle
        await client.query(`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('printers') AND name = 'location')
            BEGIN
                ALTER TABLE printers ADD 
                    location VARCHAR(255) DEFAULT '',
                    department VARCHAR(255) DEFAULT '',
                    description NVARCHAR(MAX) DEFAULT '',
                    print_type VARCHAR(100) DEFAULT '',
                    serial_no VARCHAR(100) DEFAULT '',
                    toner_model VARCHAR(255) DEFAULT '';
            END
        `);


        // device_maintenance tablosu
        await client.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'device_maintenance')
            BEGIN
                CREATE TABLE device_maintenance (
                    id              INT IDENTITY(1,1) PRIMARY KEY,
                    device_id       INTEGER REFERENCES devices(id) ON DELETE CASCADE,
                    month_name      VARCHAR(20) NOT NULL,
                    is_completed    BIT DEFAULT 0,
                    year_val        INTEGER DEFAULT 2026
                );
            END
        `);

        // device_actions tablosu
        await client.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'device_actions')
            BEGIN
                CREATE TABLE device_actions (
                    id              INT IDENTITY(1,1) PRIMARY KEY,
                    device_id       INTEGER REFERENCES devices(id) ON DELETE SET NULL,
                    arrival_date    DATETIME2,
                    action_date     DATETIME2,
                    serial_no       VARCHAR(100) DEFAULT '',
                    came_from       VARCHAR(255) DEFAULT '',
                    brand           VARCHAR(100) DEFAULT '',
                    model           VARCHAR(100) DEFAULT '',
                    part_type       VARCHAR(100) DEFAULT '',
                    quantity        INT DEFAULT 1,
                    action_taken    NVARCHAR(MAX) DEFAULT '',
                    username        VARCHAR(100) DEFAULT '',
                    location        VARCHAR(100) DEFAULT '',
                    warranty_status VARCHAR(255) DEFAULT '',
                    action_type     VARCHAR(50) DEFAULT 'action'
                );
            END
            ELSE
            BEGIN
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('device_actions') AND name = 'action_type')
                BEGIN
                    ALTER TABLE device_actions ADD action_type VARCHAR(50) DEFAULT 'action';
                END
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('device_actions') AND name = 'arrival_date')
                BEGIN
                    ALTER TABLE device_actions ADD arrival_date DATETIME2;
                END
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('device_actions') AND name = 'came_from')
                BEGIN
                    ALTER TABLE device_actions ADD came_from VARCHAR(255) DEFAULT '';
                END
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('device_actions') AND name = 'quantity')
                BEGIN
                    ALTER TABLE device_actions ADD quantity INT DEFAULT 1;
                END
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('device_actions') AND name = 'warranty_status')
                BEGIN
                    ALTER TABLE device_actions ADD warranty_status VARCHAR(255) DEFAULT '';
                END
            END
        `);

        // Mevcut verileri güncelle (tarihsel malzeme akışı verilerini ayırt et)
        await client.query(`
            UPDATE device_actions 
            SET action_type = 'material' 
            WHERE action_taken LIKE 'Gelen Giden Malzeme Raporu:%' AND (action_type IS NULL OR action_type = 'action')
        `);

        // toner_stock tablosu
        await client.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'toner_stock')
            BEGIN
                CREATE TABLE toner_stock (
                    toner_model     VARCHAR(100) PRIMARY KEY,
                    quantity        INTEGER DEFAULT 0
                );
            END
        `);

        // toner_replacements tablosu
        await client.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'toner_replacements')
            BEGIN
                CREATE TABLE toner_replacements (
                    id              INT IDENTITY(1,1) PRIMARY KEY,
                    replacement_date DATETIME2 DEFAULT GETDATE(),
                    username        VARCHAR(100) DEFAULT '',
                    toner_model     VARCHAR(100) DEFAULT ''
                );
            END
        `);

        // users tablosu
        await client.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'users')
            BEGIN
                CREATE TABLE users (
                    id              INT IDENTITY(1,1) PRIMARY KEY,
                    username        VARCHAR(100) UNIQUE NOT NULL,
                    password_hash   VARCHAR(255) NOT NULL,
                    role            VARCHAR(50) DEFAULT 'viewer',
                    created_at      DATETIME2 DEFAULT GETDATE(),
                    updated_at      DATETIME2 DEFAULT GETDATE()
                );
            END
        `);

        // phone_directory tablosu
        await client.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'phone_directory')
            BEGIN
                CREATE TABLE phone_directory (
                    id              INT IDENTITY(1,1) PRIMARY KEY,
                    building        VARCHAR(100) NOT NULL,
                    department      VARCHAR(100) DEFAULT '',
                    extension       VARCHAR(50) DEFAULT '',
                    name            NVARCHAR(255) NOT NULL,
                    job_title       NVARCHAR(255) DEFAULT '',
                    created_at      DATETIME2 DEFAULT GETDATE(),
                    updated_at      DATETIME2 DEFAULT GETDATE()
                );
            END
        `);

        await client.query(`IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_phone_directory_building') CREATE INDEX idx_phone_directory_building ON phone_directory(building);`);
        await client.query(`IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_phone_directory_name') CREATE INDEX idx_phone_directory_name ON phone_directory(name);`);



        // Seed default admin user
        const usersCountRes = await client.query('SELECT COUNT(*) as count FROM users');
        if (parseInt(usersCountRes.rows[0].count) === 0) {
            const bcrypt = require('bcryptjs');
            const defaultPasswordHash = await bcrypt.hash('admin123', 10);
            await client.query(`
                INSERT INTO users (username, password_hash, role)
                VALUES ('admin', $1, 'admin')
            `, [defaultPasswordHash]);
            console.log('👤 Default admin user created (admin / admin123).');
        }

        console.log('✅ All database migrations completed successfully.');
    } catch (err) {
        console.error('❌ Migration error:', err.message);
        throw err;
    } finally {
        client.release();
    }
}

module.exports = { runMigrations };
