const sql = require('mssql');
require('dotenv').config();
const { runMigrations, ensureBootstrapAdmin } = require('./migrations');
const { createWrappedPool } = require('./connection');

/**
 * One-shot database provisioning script for clean Docker install.
 * Connects with SA credentials, provisions the database, executes migrations (DDL),
 * creates the application login with least-privilege roles (datareader, datawriter only),
 * seeds bootstrap admin, and exits cleanly.
 */
async function initializeDatabase() {
    console.log('🔄 [DB-INIT] Starting one-shot database initialization & provisioning...');

    const dbHost = process.env.DB_HOST || 'localhost';
    const dbPort = parseInt(process.env.DB_PORT || '1433', 10);
    const dbName = process.env.DB_NAME || 'network_monitor';
    const saUser = process.env.DB_ADMIN_USER || 'sa';
    const saPassword = process.env.DB_ADMIN_PASSWORD || process.env.MSSQL_SA_PASSWORD;

    const appUser = process.env.DB_APP_USER || process.env.DB_USER || 'onoffdash_app';
    const appPassword = process.env.DB_APP_PASSWORD || process.env.DB_PASSWORD;

    if (!saPassword) {
        console.error('❌ [DB-INIT] FATAL: Neither DB_ADMIN_PASSWORD nor MSSQL_SA_PASSWORD was provided.');
        process.exit(1);
    }

    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(dbName)) {
        console.error(`❌ [DB-INIT] FATAL: Invalid database name "${dbName}".`);
        process.exit(1);
    }

    const masterConfig = {
        server: dbHost,
        port: dbPort,
        database: 'master',
        user: saUser,
        password: String(saPassword),
        options: {
            encrypt: process.env.DB_ENCRYPT === 'true',
            trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== 'false',
            enableArithAbort: true
        }
    };

    let masterPool;
    try {
        console.log(`🔌 [DB-INIT] Connecting to master as "${saUser}" at ${dbHost}:${dbPort}...`);
        masterPool = new sql.ConnectionPool(masterConfig);
        await masterPool.connect();
        console.log('✅ [DB-INIT] Connected to master database.');

        // 1. Create database if it does not exist
        const req = masterPool.request();
        req.input('dbName', sql.VarChar, dbName);
        const checkDb = await req.query('SELECT 1 FROM sys.databases WHERE name = @dbName');
        if (checkDb.recordset.length === 0) {
            console.log(`🔨 [DB-INIT] Creating database [${dbName}]...`);
            await masterPool.request().query(`CREATE DATABASE [${dbName}]`);
            console.log(`✅ [DB-INIT] Database [${dbName}] created.`);
        } else {
            console.log(`ℹ️ [DB-INIT] Database [${dbName}] already exists.`);
        }

        // 2. Provision application SQL login if configured and not 'sa'
        if (appUser && appPassword && appUser.toLowerCase() !== 'sa') {
            if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(appUser)) {
                throw new Error(`Invalid application user name "${appUser}".`);
            }
            const loginReq = masterPool.request();
            loginReq.input('appUser', sql.VarChar, appUser);
            const checkLogin = await loginReq.query('SELECT 1 FROM sys.server_principals WHERE name = @appUser');
            const safePass = String(appPassword).replace(/'/g, "''");
            if (checkLogin.recordset.length === 0) {
                console.log(`👤 [DB-INIT] Creating SQL login [${appUser}]...`);
                await masterPool.request().query(`CREATE LOGIN [${appUser}] WITH PASSWORD = '${safePass}', CHECK_POLICY = OFF`);
                console.log(`✅ [DB-INIT] SQL login [${appUser}] created.`);
            } else {
                console.log(`ℹ️ [DB-INIT] SQL login [${appUser}] exists, verifying password...`);
                await masterPool.request().query(`ALTER LOGIN [${appUser}] WITH PASSWORD = '${safePass}'`);
            }
        }
    } catch (err) {
        console.error('❌ [DB-INIT] Failed during master database operations:', err.message);
        if (masterPool) {
            try { await masterPool.close(); } catch (_) {}
        }
        process.exit(1);
    } finally {
        if (masterPool) {
            try { await masterPool.close(); } catch (_) {}
        }
    }

    // Connect directly to target database with SA privileges for DDL migrations & user scoping
    const targetDbConfig = {
        ...masterConfig,
        database: dbName
    };

    let wrappedTargetPool;
    try {
        console.log(`🔌 [DB-INIT] Connecting to [${dbName}] with DDL privileges for schema provisioning...`);
        wrappedTargetPool = createWrappedPool(targetDbConfig);

        // 3. Run schema migrations
        console.log('🚀 [DB-INIT] Running schema migrations...');
        await runMigrations(wrappedTargetPool);
        console.log('✅ [DB-INIT] Schema migrations successfully applied.');

        // 4. Configure least-privilege user mapping inside target database
        if (appUser && appUser.toLowerCase() !== 'sa') {
            console.log(`🔒 [DB-INIT] Scoping application user [${appUser}] with least-privilege roles...`);
            const adminRawPool = await wrappedTargetPool.getPool();
            await adminRawPool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = '${appUser}')
                BEGIN
                    CREATE USER [${appUser}] FOR LOGIN [${appUser}];
                END
                ALTER ROLE db_datareader ADD MEMBER [${appUser}];
                ALTER ROLE db_datawriter ADD MEMBER [${appUser}];
                IF IS_ROLEMEMBER('db_ddladmin', '${appUser}') = 1
                BEGIN
                    ALTER ROLE db_ddladmin DROP MEMBER [${appUser}];
                END
            `);
            console.log(`✅ [DB-INIT] App user [${appUser}] granted db_datareader & db_datawriter (db_ddladmin removed).`);
        }

        // 5. Ensure bootstrap admin is created
        console.log('👤 [DB-INIT] Checking bootstrap administrator account...');
        await ensureBootstrapAdmin(wrappedTargetPool);
        console.log('✅ [DB-INIT] Bootstrap check complete.');

        await wrappedTargetPool.close();
        console.log('🎉 [DB-INIT] Database initialization completed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('❌ [DB-INIT] Fatal error during database initialization:', err);
        if (wrappedTargetPool) {
            try { await wrappedTargetPool.close(); } catch (_) {}
        }
        process.exit(1);
    }
}

if (require.main === module) {
    initializeDatabase();
}

module.exports = { initializeDatabase };
