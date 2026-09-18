require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const cron = require('node-cron');

const { ensureDatabase } = require('./db/connection');
const { runMigrations, ensureBootstrapAdmin } = require('./db/migrations');
const { validateConfig } = require('./utils/configValidator');
const PingService = require('./services/pingService');
const PrinterMonitorService = require('./services/printerMonitorService');
const CleanupService = require('./services/cleanupService');

const { authenticateToken } = require('./middleware/auth');
const authRouter = require('./routes/auth');
const analyticsRouter = require('./routes/analytics');
const devicesRouter = require('./routes/devices');
const heartbeatRouter = require('./routes/heartbeat');
const dashboardRouter = require('./routes/dashboard');
const printersRouter = require('./routes/printers');
const softwareRouter = require('./routes/software');
const agentUpdateRouter = require('./routes/agentUpdate');
const maintenanceRouter = require('./routes/maintenance');
const actionsRouter = require('./routes/actions');
const phoneDirectoryRouter = require('./routes/phoneDirectory');
const ipamRouter = require('./routes/ipam');

const helmet = require('helmet');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);

// Trust first proxy (Nginx) for accurate client IP in express-rate-limit
app.set('trust proxy', 1);

// Standardized CORS_ORIGINS configuration
const rawOrigins = process.env.CORS_ORIGINS || process.env.CORS_ORIGIN;
const allowedOrigins = rawOrigins 
    ? rawOrigins.split(',').map(s => s.trim()).filter(Boolean)
    : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:80', 'http://localhost:3000', 'http://localhost'];

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
};

const io = new Server(server, {
    cors: {
        origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        credentials: true
    }
});

// Socket.IO JWT Authentication Middleware (Strict: auth.token or Authorization header only, NO query token)
const JWT_SECRET = process.env.JWT_SECRET;
io.use((socket, next) => {
    const token = socket.handshake.auth?.token || 
                  socket.handshake.headers?.authorization?.replace(/^Bearer\s+/, '');
    if (!token) {
        return next(new Error('Authentication error: token required'));
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.user = decoded;
        next();
    } catch (err) {
        return next(new Error('Authentication error: invalid or expired token'));
    }
});

// Security & Body Parsing Middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));
app.use(cors(corsOptions));
app.use(express.json({ limit: '5mb' })); // Yazılım envanteri büyük olabilir

// Socket.IO instance'ını Express app'e bağla
app.set('io', io);

// Routes
app.use('/api/auth', authRouter);
app.use('/api/analytics', authenticateToken, analyticsRouter);
app.use('/api/devices', authenticateToken, devicesRouter);
app.use('/api/heartbeat', heartbeatRouter); // Agent heartbeats (uses authenticateAgent)
app.use('/api/dashboard', authenticateToken, dashboardRouter);
app.use('/api/printers', authenticateToken, printersRouter);
app.use('/api/software', softwareRouter); // Agent POST uses authenticateAgent, Client GET uses authenticateToken
app.use('/api/agent', agentUpdateRouter); // Agent updates (uses authenticateAgent)
app.use('/api/maintenance', authenticateToken, maintenanceRouter);
app.use('/api/actions', authenticateToken, actionsRouter);
app.use('/api/phone-directory', authenticateToken, phoneDirectoryRouter);
app.use('/api/ipam', authenticateToken, ipamRouter);

// Liveness health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Readiness probe (verifies database connectivity)
const { poolPromise } = require('./db/connection');
app.get('/api/ready', async (req, res) => {
    try {
        const pool = await poolPromise;
        await pool.request().query('SELECT 1 AS ready');
        res.json({ status: 'ready', database: 'connected', timestamp: new Date().toISOString() });
    } catch (err) {
        res.status(503).json({ status: 'not_ready', database: 'disconnected', error: err.message });
    }
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

        // 0. Startup configuration validation
        validateConfig();

        // 1. Veritabanını oluştur/kontrol et
        await ensureDatabase();

        // 2. Migration'ları çalıştır
        await runMigrations();

        // 2.1 Güvenli admin bootstrap kontrolü (schema migration tablosundan bağımsız)
        await ensureBootstrapAdmin();

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
        app.set('printerMonitorService', printerMonitorService);

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

if (require.main === module) {
    startServer();
}

module.exports = { app, server, startServer };
