const sql = require('mssql');
require('dotenv').config();

const config = {
    server: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '1433'),
    database: process.env.DB_NAME || 'network_monitor',
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD ? String(process.env.DB_PASSWORD) : undefined,
    options: {
        encrypt: false, // For local dev
        trustServerCertificate: true,
        enableArithAbort: true
    },
    pool: {
        max: 20,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

const adminConfig = {
    ...config,
    database: 'master'
};

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
                    console.error('With params:', params);
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
            console.error('With params:', params);
            throw error;
        }
    }
};

async function ensureDatabase() {
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
    } catch (err) {
        console.error('❌ Error ensuring database:', err.message);
        throw err;
    } finally {
        await adminPool.close();
    }
}

module.exports = { pool, ensureDatabase, sql };
