require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const cron = require('node-cron');

const { ensureDatabase } = require('./db/connection');
const { runMigrations } = require('./db/migrations');
const PingService = require('./services/pingService');
const PrinterMonitorService = require('./services/printerMonitorService');
const CleanupService = require('./services/cleanupService');

const devicesRouter = require('./routes/devices');
const heartbeatRouter = require('./routes/heartbeat');
const dashboardRouter = require('./routes/dashboard');
const printersRouter = require('./routes/printers');
const softwareRouter = require('./routes/software');
const agentUpdateRouter = require('./routes/agentUpdate');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE']
    }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' })); // Yazılım envanteri büyük olabilir

// Socket.IO instance'ını Express app'e bağla
app.set('io', io);

// Routes
app.use('/api/devices', devicesRouter);
app.use('/api/heartbeat', heartbeatRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/printers', printersRouter);
app.use('/api/software', softwareRouter);
app.use('/api/agent', agentUpdateRouter);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Socket.IO bağlantı yönetimi
io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    socket.on('disconnect', () => {
        console.log(`🔌 Client disconnected: ${socket.id}`);
    });
});

// Sunucu başlatma
async function startServer() {
    try {
        console.log('🚀 Network Monitor Backend starting...');
        console.log('');

        // 1. Veritabanını oluştur/kontrol et
        await ensureDatabase();

        // 2. Migration'ları çalıştır
        await runMigrations();

        // 3. Ping servisini başlat
        const pingService = new PingService(io);

        // 4. Periyodik ping taraması (setInterval — saniye düzeyinde hassasiyet)
        const intervalSeconds = parseInt(process.env.PING_INTERVAL_SECONDS || '60');
        const intervalMs = intervalSeconds * 1000;

        setInterval(() => {
            pingService.scanAllDevices();
        }, intervalMs);

        // İlk ping taramasını 5 saniye sonra başlat
        setTimeout(() => {
            pingService.scanAllDevices();
        }, 5000);

        // 5. Printer Monitor servisini başlat
        const printerMonitorService = new PrinterMonitorService(io);

        // 6. Periyodik yazıcı taraması (Her 5 dakikada bir)
        cron.schedule('*/5 * * * *', () => {
            printerMonitorService.scanAllPrinters();
        });

        // İlk yazıcı taramasını 10 saniye sonra başlat
        setTimeout(() => {
            printerMonitorService.scanAllPrinters();
        }, 10000);

        // 7. Eski veri temizleme servisi
        const cleanupService = new CleanupService();

        // Her gün gece 03:00'te eski kayıtları temizle
        cron.schedule('0 3 * * *', () => {
            cleanupService.runCleanup();
        });

        // İlk temizliği 30 saniye sonra çalıştır
        setTimeout(() => {
            cleanupService.runCleanup();
        }, 30000);

        // 8. Sunucuyu başlat
        const HOST = process.env.SERVER_HOST || '0.0.0.0';
        const PORT = parseInt(process.env.SERVER_PORT || '3001');

        server.listen(PORT, HOST, () => {
            console.log('');
            console.log('═══════════════════════════════════════════════');
            console.log('  🖥️  Network Monitor Backend');
            console.log('═══════════════════════════════════════════════');
            console.log(`  🌐  Server:     http://${HOST}:${PORT}`);
            console.log(`  📡  API:        http://${HOST}:${PORT}/api`);
            console.log(`  🔌  Socket.IO:  ws://${HOST}:${PORT}`);
            console.log(`  ⏱️   Ping interval: ${intervalSeconds}s`);
            console.log(`  ⏰  Heartbeat timeout: ${process.env.HEARTBEAT_TIMEOUT_SECONDS || 90}s`);
            console.log('═══════════════════════════════════════════════');
            console.log('');
        });

    } catch (err) {
        console.error('❌ Failed to start server:', err);
        process.exit(1);
    }
}

startServer();
