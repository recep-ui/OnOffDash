const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');

const { getLowTonerThreshold } = require('../utils/tonerConfig');

// GET /api/dashboard/stats — Dashboard istatistikleri
router.get('/stats', async (req, res) => {
    try {
        const lowTonerThreshold = getLowTonerThreshold();
        const totalResult = await pool.query('SELECT COUNT(*) as count FROM devices');
        const onlineResult = await pool.query(`SELECT COUNT(*) as count FROM devices WHERE status = 'online'`);
        const offlineResult = await pool.query(`SELECT COUNT(*) as count FROM devices WHERE status = 'offline'`);
        const warningResult = await pool.query(`SELECT COUNT(*) as count FROM devices WHERE status = 'warning'`);
        const agentResult = await pool.query(`SELECT COUNT(*) as count FROM devices WHERE agent_installed = 1`);

        // Yazıcı istatistikleri
        const printerTotalResult = await pool.query('SELECT COUNT(*) as count FROM printers');
        const printerOnlineResult = await pool.query(`SELECT COUNT(*) as count FROM printers WHERE is_online = 1`);
        const printerJamResult = await pool.query(`SELECT COUNT(*) as count FROM printers WHERE has_paper_jam = 1`);

        // Düşük toner kontrolü — herhangi bir toneri eşik (%LOW_TONER_THRESHOLD_PERCENT) altında olan yazıcı sayısı
        const lowTonerResult = await pool.query(`
            SELECT COUNT(DISTINCT p.id) as count
            FROM printers p
            INNER JOIN printer_toners pt ON pt.printer_id = p.id
            WHERE p.is_online = 1
              AND pt.max_capacity > 0
              AND (CAST(pt.level AS FLOAT) / CAST(pt.max_capacity AS FLOAT)) * 100 < $1
        `, [lowTonerThreshold]);

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
