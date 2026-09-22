const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { pool } = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');

const analyticsLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    message: { error: 'Çok fazla istek yapıldı, lütfen daha sonra tekrar deneyiniz.' }
});

router.use(analyticsLimiter);

// GET /api/analytics/summary — Grafikler için analitik özet
router.get('/summary', authenticateToken, async (req, res) => {
    try {
        // 1. Cihaz Durum Dağılımı
        const statusRes = await pool.query(`
            SELECT status, COUNT(*) as count 
            FROM devices 
            GROUP BY status
        `);
        const deviceStatus = {
            online: 0,
            offline: 0,
            warning: 0
        };
        statusRes.rows.forEach(r => {
            if (r.status === 'online') deviceStatus.online = parseInt(r.count);
            else if (r.status === 'offline') deviceStatus.offline = parseInt(r.count);
            else if (r.status === 'warning') deviceStatus.warning = parseInt(r.count);
        });

        // 2. Ortalama Kaynak Kullanımı (Online ve Ajan Kurulu Cihazların Son Durumları)
        const resourceRes = await pool.query(`
            SELECT d.hostname, h.cpu_usage, h.ram_usage
            FROM devices d
            INNER JOIN (
                SELECT device_id, cpu_usage, ram_usage,
                       ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY last_seen DESC) as rn
                FROM heartbeats
            ) h ON h.device_id = d.id AND h.rn = 1
            WHERE d.status = 'online' AND d.agent_installed = 1
        `);

        // 3. Yazıcı Toner Seviyeleri
        const printerTonerRes = await pool.query(`
            SELECT p.id, p.name, p.ip_address, p.description,
                   t.color, t.level, t.max_capacity
            FROM printers p
            INNER JOIN printer_toners t ON t.printer_id = p.id
            WHERE p.is_online = 1
        `);
        // Gruplayarak yazıcı nesnelerine çevirelim
        const printersMap = {};
        printerTonerRes.rows.forEach(row => {
            const pid = row.id;
            const displayName = row.description || row.name || row.ip_address;
            if (!printersMap[pid]) {
                printersMap[pid] = {
                    id: pid,
                    name: displayName,
                    toners: []
                };
            }
            const percentage = row.max_capacity > 0 ? Math.round((row.level / row.max_capacity) * 100) : 0;
            printersMap[pid].toners.push({
                color: row.color,
                level: row.level,
                max_capacity: row.max_capacity,
                percentage: Math.min(100, Math.max(0, percentage))
            });
        });
        const printerToners = Object.values(printersMap);

        // 4. Bakım Durum İlerlemesi (Tamamlanan / Kalan)
        const maintRes = await pool.query(`
            SELECT is_completed, COUNT(*) as count 
            FROM device_maintenance 
            GROUP BY is_completed
        `);
        const maintenance = {
            completed: 0,
            pending: 0
        };
        maintRes.rows.forEach(r => {
            if (r.is_completed === true || r.is_completed === 1) {
                maintenance.completed = parseInt(r.count);
            } else {
                maintenance.pending = parseInt(r.count);
            }
        });

        // 5. Malzeme Akışı (Son 30 günün Giriş / Çıkış Miktarı)
        const flowRes = await pool.query(`
            SELECT 
                CONVERT(VARCHAR(10), arrival_date, 120) as date_val,
                SUM(CASE WHEN came_from <> '' AND came_from IS NOT NULL THEN quantity ELSE 0 END) as incoming,
                SUM(CASE WHEN (came_from = '' OR came_from IS NULL) AND location <> '' AND location IS NOT NULL THEN quantity ELSE 0 END) as outgoing
            FROM device_actions
            WHERE action_type = 'material' 
              AND arrival_date >= DATEADD(day, -30, GETDATE())
            GROUP BY CONVERT(VARCHAR(10), arrival_date, 120)
            ORDER BY date_val
        `);
        const materialFlow = flowRes.rows.map(r => ({
            date: r.date_val,
            incoming: parseInt(r.incoming || 0),
            outgoing: parseInt(r.outgoing || 0)
        }));

        // 6. Ping Gecikme Geçmişi (Son 7 gün, saatlik)
        const latencyRes = await pool.query(`
            SELECT 
                CONVERT(VARCHAR(13), checked_at, 120) + ':00' as time_val,
                AVG(response_time_ms) as avg_latency
            FROM device_status_logs
            WHERE checked_at >= DATEADD(day, -7, GETDATE())
              AND response_time_ms IS NOT NULL AND response_time_ms > 0
            GROUP BY CONVERT(VARCHAR(13), checked_at, 120)
            ORDER BY time_val ASC
        `);
        const latencyHistory = latencyRes.rows.map(r => ({
            time: r.time_val.substring(5), // 'MM-DD HH:00'
            latency: Math.round(r.avg_latency || 0)
        }));

        // 7. Departman Bazlı Bakım Tamamlama Oranları
        const maintDeptRes = await pool.query(`
            SELECT 
                d.department,
                m.month_name,
                SUM(CASE WHEN m.is_completed = 1 THEN 1 ELSE 0 END) as completed,
                COUNT(*) as total
            FROM device_maintenance m
            INNER JOIN devices d ON m.device_id = d.id
            WHERE d.department IS NOT NULL AND d.department <> ''
            GROUP BY d.department, m.month_name
            ORDER BY m.month_name, d.department
        `);
        const maintDeptRates = maintDeptRes.rows.map(r => ({
            department: r.department,
            month: r.month_name,
            completed: parseInt(r.completed || 0),
            total: parseInt(r.total || 0),
            rate: r.total > 0 ? Math.round((r.completed / r.total) * 100) : 0
        }));

        // 8. Toner Öngörü Analizi (Tüketim hızları ve tahmini bitiş)
        const printerTonerForecastRes = await pool.query(`
            SELECT p.id, p.name as printer_name, p.department, p.toner_model,
                   t.color, t.level, t.max_capacity
            FROM printers p
            INNER JOIN printer_toners t ON t.printer_id = p.id
            WHERE p.toner_model IS NOT NULL AND p.toner_model <> ''
        `);

        const tonerReplacementsRes = await pool.query(`
            SELECT toner_model, COUNT(*) as replacement_count
            FROM toner_replacements
            WHERE replacement_date >= DATEADD(day, -90, GETDATE())
            GROUP BY toner_model
        `);

        const tonerStockRes = await pool.query(`
            SELECT toner_model, quantity FROM toner_stock
        `);

        function cleanTonerName(name) {
            if (!name) return '';
            return String(name).toLowerCase()
                .replace(/\s+/g, '')
                .replace(/ı/g, 'i')
                .replace(/ş/g, 's')
                .replace(/ğ/g, 'g')
                .replace(/ü/g, 'u')
                .replace(/ö/g, 'o')
                .replace(/ç/g, 'c')
                .replace(/siyah/g, '')
                .replace(/mavi/g, '')
                .replace(/sari/g, '')
                .replace(/kirmizi/g, '')
                .replace(/drum/g, '')
                .replace(/toner/g, '')
                .trim();
        }

        const replacementsMap = {};
        tonerReplacementsRes.rows.forEach(r => {
            const clean = cleanTonerName(r.toner_model);
            if (clean) replacementsMap[clean] = (replacementsMap[clean] || 0) + parseInt(r.replacement_count || 0);
        });

        const stockMap = {};
        tonerStockRes.rows.forEach(r => {
            const clean = cleanTonerName(r.toner_model);
            if (clean) stockMap[clean] = (stockMap[clean] || 0) + parseInt(r.quantity || 0);
        });

        const tonerForecast = printerTonerForecastRes.rows.map(row => {
            const cleanModel = cleanTonerName(row.toner_model);
            const replacementsCount = replacementsMap[cleanModel] || 0;
            const stockQty = stockMap[cleanModel] || 0;

            // 90 gün boyunca hiç değişmediyse varsayılan tüketim hızı: aylık 0.5 adet
            const monthlyConsumptionRate = replacementsCount > 0 ? (replacementsCount / 90) * 30 : 0.5;
            const averageLifespanDays = 30 / monthlyConsumptionRate;

            const currentPercentage = row.max_capacity > 0 ? (row.level / row.max_capacity) : 0;
            const currentTonerRemainingDays = Math.round(currentPercentage * averageLifespanDays);
            const totalEstimatedRemainingDays = Math.round(currentTonerRemainingDays + (stockQty * averageLifespanDays));

            return {
                id: row.id,
                printerName: row.printer_name,
                department: row.department || 'Genel',
                tonerModel: row.toner_model,
                color: row.color,
                levelPercentage: Math.round(currentPercentage * 100),
                monthlyConsumptionRate: parseFloat(monthlyConsumptionRate.toFixed(2)),
                stockQuantity: stockQty,
                estimatedRemainingDays: totalEstimatedRemainingDays
            };
        });

        res.json({
            deviceStatus,
            resourceUsage: resourceRes.rows,
            printerToners,
            maintenance,
            materialFlow,
            latencyHistory,
            maintDeptRates,
            tonerForecast
        });

    } catch (err) {
        console.error('Error fetching analytics summary:', err);
        res.status(500).json({ error: 'Analitik verileri hazırlanamadı.' });
    }
});

module.exports = router;
