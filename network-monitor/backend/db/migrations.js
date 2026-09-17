const { pool } = require('./connection');

/**
 * Migration runner with schema_migrations table version tracking.
 * Ensures all migration steps are recorded and executed only once.
 */
async function runMigrations() {
    const client = await pool.connect();
    try {
        // 0. Ensure schema_migrations table exists
        await client.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'schema_migrations')
            BEGIN
                CREATE TABLE schema_migrations (
                    id          INT IDENTITY(1,1) PRIMARY KEY,
                    version     VARCHAR(100) UNIQUE NOT NULL,
                    description NVARCHAR(255),
                    applied_at  DATETIME2 DEFAULT GETDATE()
                );
            END
        `);

        // Helper to check if a migration version has already run
        async function isMigrationApplied(version) {
            const res = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [version]);
            return res.rows.length > 0;
        }

        async function recordMigration(version, description) {
            await client.query('INSERT INTO schema_migrations (version, description) VALUES ($1, $2)', [version, description]);
            console.log(`  ✓ Applied migration: ${version} — ${description}`);
        }

        // --- 001: Core Monitoring Tables ---
        if (!await isMigrationApplied('001_core_tables')) {
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

                IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_device_status_logs_device_id') CREATE INDEX idx_device_status_logs_device_id ON device_status_logs(device_id);
                IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_device_status_logs_checked_at') CREATE INDEX idx_device_status_logs_checked_at ON device_status_logs(checked_at);
                IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_heartbeats_device_id') CREATE INDEX idx_heartbeats_device_id ON heartbeats(device_id);
                IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_heartbeats_last_seen') CREATE INDEX idx_heartbeats_last_seen ON heartbeats(last_seen);
                IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_devices_status') CREATE INDEX idx_devices_status ON devices(status);
                IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_printers_ip') CREATE INDEX idx_printers_ip ON printers(ip_address);
            `);
            await recordMigration('001_core_tables', 'Initial core monitoring tables & indices');
        }

        // --- 002: Device Software Inventory ---
        if (!await isMigrationApplied('002_device_software')) {
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

                IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_device_software_device_id') CREATE INDEX idx_device_software_device_id ON device_software(device_id);
                IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_device_software_name') CREATE INDEX idx_device_software_name ON device_software(name);
            `);
            await recordMigration('002_device_software', 'Software inventory table and indices');
        }

        // --- 003: Inventory Columns ---
        if (!await isMigrationApplied('003_inventory_columns')) {
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
            await recordMigration('003_inventory_columns', 'Hardware and peripheral inventory columns');
        }

        // --- 004: Operations & Maintenance Tables ---
        if (!await isMigrationApplied('004_operations_tables')) {
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

                UPDATE device_actions 
                SET action_type = 'material' 
                WHERE action_taken LIKE 'Gelen Giden Malzeme Raporu:%' AND (action_type IS NULL OR action_type = 'action');

                IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'toner_stock')
                BEGIN
                    CREATE TABLE toner_stock (
                        toner_model     VARCHAR(100) PRIMARY KEY,
                        quantity        INTEGER DEFAULT 0
                    );
                END

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
            await recordMigration('004_operations_tables', 'Maintenance, device actions, and toner inventory');
        }

        // --- 005: Users & Role Management with must_change_password ---
        if (!await isMigrationApplied('005_users_table')) {
            await client.query(`
                IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'users')
                BEGIN
                    CREATE TABLE users (
                        id                   INT IDENTITY(1,1) PRIMARY KEY,
                        username             VARCHAR(100) UNIQUE NOT NULL,
                        password_hash        VARCHAR(255) NOT NULL,
                        role                 VARCHAR(50) DEFAULT 'viewer',
                        must_change_password BIT DEFAULT 0,
                        created_at           DATETIME2 DEFAULT GETDATE(),
                        updated_at           DATETIME2 DEFAULT GETDATE()
                    );
                END
                ELSE
                BEGIN
                    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'must_change_password')
                    BEGIN
                        ALTER TABLE users ADD must_change_password BIT DEFAULT 0;
                    END
                END
            `);
            await recordMigration('005_users_table', 'Users table with role hierarchy and password expiration');
        }

        // --- 006: Phone Directory ---
        if (!await isMigrationApplied('006_phone_directory')) {
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

                IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_phone_directory_building') CREATE INDEX idx_phone_directory_building ON phone_directory(building);
                IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_phone_directory_name') CREATE INDEX idx_phone_directory_name ON phone_directory(name);
            `);
            await recordMigration('006_phone_directory', 'Internal phone directory table and indices');
        }

        // --- 007: Composite Indices for High Performance & DB Growth Control ---
        if (!await isMigrationApplied('007_performance_composite_indices') && !await isMigrationApplied('008_performance_composite_indices')) {
            await client.query(`
                IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_heartbeats_device_seen')
                    CREATE INDEX idx_heartbeats_device_seen ON heartbeats(device_id, last_seen DESC);

                IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_status_logs_device_time')
                    CREATE INDEX idx_status_logs_device_time ON device_status_logs(device_id, checked_at DESC);
            `);
            await recordMigration('007_performance_composite_indices', 'Composite indices for rapid telemetry queries');
        }

        console.log('✅ All database schema migrations verified and up to date.');
    } catch (err) {
        console.error('❌ Migration error:', err.message);
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Standalone Bootstrap Admin Provisioner.
 * Decoupled from schema migrations table so environment variables can be provided
 * or updated on any restart when the users table is empty.
 */
async function ensureBootstrapAdmin() {
    const client = await pool.connect();
    try {
        const usersCountRes = await client.query('SELECT COUNT(*) as count FROM users');
        const totalUsers = parseInt(usersCountRes.rows[0].count);

        if (totalUsers > 0) {
            return; // Users already exist, nothing to do
        }

        const bootstrapUser = process.env.BOOTSTRAP_ADMIN_USERNAME;
        const bootstrapPass = process.env.BOOTSTRAP_ADMIN_PASSWORD;

        if (bootstrapUser && bootstrapPass) {
            if (bootstrapPass.length < 8) {
                console.error('❌ BOOTSTRAP_ADMIN_PASSWORD must be at least 8 characters long.');
                return;
            }
            const bcrypt = require('bcryptjs');
            const hash = await bcrypt.hash(bootstrapPass, 10);
            await client.query(`
                INSERT INTO users (username, password_hash, role, must_change_password)
                VALUES ($1, $2, 'admin', 1)
            `, [bootstrapUser.trim(), hash]);
            console.log(`👤 Bootstrap admin created: "${bootstrapUser}" (must change password on first login).`);
        } else {
            console.warn('⚠️ WARNING: No users exist in database and no BOOTSTRAP_ADMIN credentials provided.');
            console.warn('Set BOOTSTRAP_ADMIN_USERNAME and BOOTSTRAP_ADMIN_PASSWORD in environment to initialize admin.');
        }
    } catch (err) {
        console.error('❌ Error during ensureBootstrapAdmin:', err.message);
        throw err;
    } finally {
        client.release();
    }
}

module.exports = { runMigrations, ensureBootstrapAdmin };
