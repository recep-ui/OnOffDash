const sql = require('mssql');
require('dotenv').config();

const runtimeUser = process.env.DB_APP_USER || process.env.DB_USER || 'sa';
const runtimePassword = process.env.DB_APP_PASSWORD || process.env.DB_PASSWORD;

const config = {
    server: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '1433'),
    database: process.env.DB_NAME || 'network_monitor',
    user: runtimeUser,
    password: runtimePassword ? String(runtimePassword) : undefined,
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== 'false',
        enableArithAbort: true
    },
    pool: {
        max: 20,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

const adminConfig = {
    server: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '1433'),
    database: 'master',
    user: process.env.DB_ADMIN_USER || 'sa',
    password: process.env.DB_ADMIN_PASSWORD || process.env.MSSQL_SA_PASSWORD || (process.env.DB_PASSWORD ? String(process.env.DB_PASSWORD) : undefined),
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== 'false',
        enableArithAbort: true
    }
};

function maskParamsForLog(queryText, params) {
    if (!Array.isArray(params)) return params;
    const lower = String(queryText).toLowerCase();
    if (lower.includes('password') || lower.includes('token') || lower.includes('secret') || lower.includes('key')) {
        return params.map(p => typeof p === 'string' ? '***REDACTED***' : p);
    }
    return params;
}

let connectionPool = null;

async function getConnection() {
    if (!connectionPool) {
        connectionPool = new sql.ConnectionPool(config);
        connectionPool.on('error', err => {
            console.error('❌ Unexpected MSSQL pool error:', err);
        });
        await connectionPool.connect();
    }
    return connectionPool;
}

const pool = {
    connect: async () => {
        const poolInst = await getConnection();
        const transaction = new sql.Transaction(poolInst);
        let inTransaction = false;

        return {
            query: async (text, params) => {
                const upperText = text.trim().toUpperCase();
                if (upperText === 'BEGIN' || upperText === 'BEGIN TRANSACTION') {
                    await transaction.begin();
                    inTransaction = true;
                    return { rows: [], rowCount: 0 };
                }
                if (upperText === 'COMMIT' || upperText === 'COMMIT TRANSACTION') {
                    if (inTransaction) {
                        await transaction.commit();
                        inTransaction = false;
                    }
                    return { rows: [], rowCount: 0 };
                }
                if (upperText === 'ROLLBACK' || upperText === 'ROLLBACK TRANSACTION') {
                    if (inTransaction) {
                        await transaction.rollback();
                        inTransaction = false;
                    }
                    return { rows: [], rowCount: 0 };
                }

                const request = inTransaction ? new sql.Request(transaction) : poolInst.request();
                
                let mssqlText = text;
                if (params && params.length > 0) {
                    params.forEach((param, index) => {
                        const paramName = `p${index + 1}`;
                        request.input(paramName, param);
                    });
                    mssqlText = mssqlText.replace(/\$(\d+)/g, '@p$1');
                }
                
                try {
                    const result = await request.query(mssqlText);
                    return {
                        rows: result.recordset || [],
                        rowCount: result.rowsAffected ? result.rowsAffected[0] : 0
                    };
                } catch (error) {
                    console.error('SQL Error on query:', mssqlText);
                    console.error('With params:', maskParamsForLog(mssqlText, params));
                    throw error;
                }
            },
            release: () => {
                if (inTransaction) {
                    transaction.rollback().catch(err => {});
                    inTransaction = false;
                }
            }
        };
    },
    query: async (text, params) => {
        const poolInst = await getConnection();
        const request = poolInst.request();
        
        let mssqlText = text;
        if (params && params.length > 0) {
            params.forEach((param, index) => {
                const paramName = `p${index + 1}`;
                request.input(paramName, param);
            });
            // Replace $1, $2 with @p1, @p2
            mssqlText = mssqlText.replace(/\$(\d+)/g, '@p$1');
        }
        
        try {
            const result = await request.query(mssqlText);
            return {
                rows: result.recordset || [],
                rowCount: result.rowsAffected ? result.rowsAffected[0] : 0
            };
        } catch (error) {
            console.error('SQL Error on query:', mssqlText);
            console.error('With params:', maskParamsForLog(mssqlText, params));
            throw error;
        }
    }
};

async function ensureDatabase() {
    if (!adminConfig.password) {
        return;
    }
    const adminPool = new sql.ConnectionPool(adminConfig);
    try {
        await adminPool.connect();
        const dbName = process.env.DB_NAME || 'network_monitor';

        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(dbName)) {
            throw new Error(`Invalid database name: "${dbName}". Only alphanumeric characters and underscores are allowed.`);
        }

        const request = adminPool.request();
        request.input('dbName', sql.VarChar, dbName);
        const result = await request.query(`SELECT 1 FROM sys.databases WHERE name = @dbName`);

        if (result.recordset.length === 0) {
            await adminPool.request().query(`CREATE DATABASE [${dbName}]`);
            console.log(`✅ Database "${dbName}" created successfully.`);
        } else {
            console.log(`✅ Database "${dbName}" already exists.`);
        }

        // Provision non-SA application user for least-privilege runtime access if configured
        const appUser = process.env.DB_APP_USER;
        const appPass = process.env.DB_APP_PASSWORD;
        if (appUser && appPass && appUser.toLowerCase() !== 'sa') {
            if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(appUser)) {
                throw new Error(`Invalid application database user name: "${appUser}".`);
            }
            const loginReq = adminPool.request();
            loginReq.input('appUser', sql.VarChar, appUser);
            const loginRes = await loginReq.query(`SELECT 1 FROM sys.server_principals WHERE name = @appUser`);
            if (loginRes.recordset.length === 0) {
                const safePass = appPass.replace(/'/g, "''");
                await adminPool.request().query(`CREATE LOGIN [${appUser}] WITH PASSWORD = '${safePass}', CHECK_POLICY = OFF`);
                console.log(`✅ Application SQL login "${appUser}" created.`);
            }

            await adminPool.request().query(`
                USE [${dbName}];
                IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = '${appUser}')
                BEGIN
                    CREATE USER [${appUser}] FOR LOGIN [${appUser}];
                    ALTER ROLE db_datareader ADD MEMBER [${appUser}];
                    ALTER ROLE db_datawriter ADD MEMBER [${appUser}];
                    ALTER ROLE db_ddladmin ADD MEMBER [${appUser}];
                END
            `);
            console.log(`✅ Scoped database user "${appUser}" provisioned on "${dbName}".`);
        }
    } catch (err) {
        console.warn('⚠️ Notice during database provisioning:', err.message);
    } finally {
        try { await adminPool.close(); } catch (_) {}
    }
}

module.exports = { 
    pool, 
    ensureDatabase, 
    sql, 
    getConnection,
    get poolPromise() {
        return getConnection();
    }
};

