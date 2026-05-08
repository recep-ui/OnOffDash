const { Pool } = require('pg');
require('dotenv').config();

// Connection pool for the application database
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'network_monitor',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD ? String(process.env.DB_PASSWORD) : undefined,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
    console.error('❌ Unexpected PostgreSQL pool error:', err);
});

// Create the database if it doesn't exist
async function ensureDatabase() {
    const adminPool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: 'postgres',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD ? String(process.env.DB_PASSWORD) : undefined,
    });

    try {
        const dbName = process.env.DB_NAME || 'network_monitor';

        // Sanitize: Only allow alphanumeric and underscores to prevent SQL injection
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(dbName)) {
            throw new Error(`Invalid database name: "${dbName}". Only alphanumeric characters and underscores are allowed.`);
        }

        const result = await adminPool.query(
            `SELECT 1 FROM pg_database WHERE datname = $1`,
            [dbName]
        );

        if (result.rows.length === 0) {
            // dbName is sanitized above — safe to use in template literal
            await adminPool.query(`CREATE DATABASE "${dbName}"`);
            console.log(`✅ Database "${dbName}" created successfully.`);
        } else {
            console.log(`✅ Database "${dbName}" already exists.`);
        }
    } catch (err) {
        console.error('❌ Error ensuring database:', err.message);
        throw err;
    } finally {
        await adminPool.end();
    }
}

module.exports = { pool, ensureDatabase };
