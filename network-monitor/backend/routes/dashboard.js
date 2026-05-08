const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');

// GET /api/dashboard/stats — Dashboard istatistikleri
router.get('/stats', async (req, res) => {
    try {
        const totalResult = await pool.query('SELECT COUNT(*) as count FROM devices');
        const onlineResult = await pool.query(`SELECT COUNT(*) as count FROM devices WHERE status = 'online'`);
        const offlineResult = await pool.query(`SELECT COUNT(*) as count FROM devices WHERE status = 'offline'`);
        const warningResult = await pool.query(`SELECT COUNT(*) as count FROM devices WHERE status = 'warning'`);
        const agentResult = await pool.query(`SELECT COUNT(*) as count FROM devices WHERE agent_installed = true`);

        // Yazıcı istatistikleri
        const printerTotalResult = await pool.query('SELECT COUNT(*) as count FROM printers');
        const printerOnlineResult = await pool.query(`SELECT COUNT(*) as count FROM printers WHERE is_online = true`);
        const printerJamResult = await pool.query(`SELECT COUNT(*) as count FROM printers WHERE has_paper_jam = true`);

        // Düşük toner kontrolü — herhangi bir toneri %10 altında olan yazıcı sayısı
        const lowTonerResult = await pool.query(`
            SELECT COUNT(DISTINCT p.id) as count
            FROM printers p
            INNER JOIN printer_toners pt ON pt.printer_id = p.id
            WHERE p.is_online = true
              AND pt.max_capacity > 0
              AND (pt.level::float / pt.max_capacity::float) * 100 < 10
        `);

        res.json({
            devices: {
                total: parseInt(totalResult.rows[0].count),
                online: parseInt(onlineResult.rows[0].count),
                offline: parseInt(offlineResult.rows[0].count),
                warning: parseInt(warningResult.rows[0].count),
                agentInstalled: parseInt(agentResult.rows[0].count),
            },
            printers: {
                total: parseInt(printerTotalResult.rows[0].count),
                online: parseInt(printerOnlineResult.rows[0].count),
                jam: parseInt(printerJamResult.rows[0].count),
                lowToner: parseInt(lowTonerResult.rows[0].count),
            },
            lastScanTime: new Date().toISOString()
        });
    } catch (err) {
        console.error('Error fetching stats:', err);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

module.exports = router;
