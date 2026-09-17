const { pool } = require('./db/connection');

async function test() {
    try {
        console.log('Testing query...');
        const result = await pool.query(
            `SELECT a.*, d.hostname, d.ip_address 
             FROM device_actions a 
             LEFT JOIN devices d ON a.device_id = d.id 
             WHERE a.action_type = $1
             ORDER BY a.action_date DESC, a.id DESC`,
            ['material']
        );
        console.log('Success! Row count:', result.rows.length);
        if (result.rows.length > 0) {
            console.log('Sample row:', result.rows[0]);
        }
    } catch (e) {
        console.error('Error:', e);
    } finally {
        process.exit();
    }
}

test();
