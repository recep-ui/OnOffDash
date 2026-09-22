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

const { authenticateToken, verifyAccessToken } = require('./middleware/auth');
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
const { pool } = require('./db/connection');

const app = express();
const server = http.createServer(app);

// Trust first proxy (Nginx) for accurate client IP in express-rate-limit
app.set('trust proxy', 1);

// Standardized CORS_ORIGINS configuration
const isProd = process.env.NODE_ENV === 'production';
const rawOrigins = process.env.CORS_ORIGINS || process.env.CORS_ORIGIN;
let allowedOrigins = [];

if (rawOrigins) {
    allowedOrigins = rawOrigins.split(',').map(s => s.trim()).filter(Boolean);
    if (isProd && allowedOrigins.includes('*')) {
        throw new Error('FATAL: Wildcard CORS origin (*) is forbidden in production.');
    }
} else if (isProd) {
    throw new Error('FATAL: CORS_ORIGINS environment variable is mandatory in production.');
} else {
    allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:80', 'http://localhost:3000', 'http://localhost'];
}

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (!isProd && allowedOrigins.includes('*')) {
            return callback(null, true);
        }
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
};

const io = new Server(server, {
    cors: {
        origin: (!isProd && allowedOrigins.includes('*')) ? '*' : allowedOrigins,
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        credentials: true
    }
});

// Socket.IO JWT Authentication Middleware (Strict: auth.token or Authorization header only, NO query token)
// Enforces the EXACT SAME session/token validity rules as REST API (token_version, existence, role, must_change_password)
io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token || 
                  socket.handshake.headers?.authorization?.replace(/^Bearer\s+/, '');
    if (!token) {
        return next(new Error('Authentication error: token required'));
    }
    try {
        const verifiedUser = await verifyAccessToken(token);
        if (verifiedUser.must_change_password) {
            return next(new Error('Authentication error: password change required'));
        }
        socket.user = verifiedUser;
        next();
    } catch (err) {
        return next(new Error(`Authentication error: ${err.message || 'invalid or expired token'}`));
    }
});

// Helper to disconnect active sockets when a user's session is revoked
io.disconnectUser = (userId) => {
    const targetId = Number(userId);
    for (const [, socket] of io.sockets.sockets) {
        if (socket.user && Number(socket.user.id) === targetId) {
            socket.emit('auth:revoked', { message: 'Oturumunuz sonlandırılmıştır.' });
            socket.disconnect(true);
        }
    }
};

// Security & Body Parsing Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'", "ws:", "wss:"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            frameAncestors: ["'none'"]
        }
    },
    crossOriginEmbedderPolicy: false
}));
app.use(cors(corsOptions));
app.use(express.json({ limit: '5mb' })); // Yazılım envanteri büyük olabilir

// Socket.IO instance'ını Express app'e bağla
app.set('io', io);

// Global API rate limiting
const rateLimit = require('express-rate-limit');
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    message: { error: 'Çok fazla istek yapıldı, lütfen daha sonra tekrar deneyiniz.' }
});
app.use('/api', apiLimiter);

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
const dbConnection = require('./db/connection');
app.get('/api/ready', async (req, res) => {
    try {
        const poolInst = await dbConnection.poolPromise;
        await poolInst.request().query('SELECT 1 AS ready');
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

        // 1. Database readiness and schema validation (least-privilege runtime)
        const isProduction = process.env.NODE_ENV === 'production';
        const hasAdminCredentials = Boolean(process.env.DB_ADMIN_PASSWORD || process.env.MSSQL_SA_PASSWORD);

        if (!isProduction && hasAdminCredentials) {
            // Development convenience path only: SA provisioning allowed when explicitly provided
            console.log('🛠️ [DEV-MODE] Running local database setup and schema migrations...');
            await ensureDatabase();
            await runMigrations();
            await ensureBootstrapAdmin();
        } else {
            // Production runtime: Least-privilege application account check.
            // Architectural responsibility: db-init container performs DDL/migrations with SA privileges.
            // Backend runtime connects with onoffdash_app and verifies schema readiness.
            console.log('🔒 [RUNTIME] Connecting with least-privilege application account. Verifying schema readiness...');
            try {
                const schemaCheck = await dbConnection.pool.query(
                    "SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME IN ('devices', 'users', 'printers', 'schema_migrations')"
                );
                const tableCount = parseInt(schemaCheck.rows[0]?.count || 0, 10);
                if (tableCount < 4) {
                    throw new Error(`Required database tables missing (found ${tableCount}/4). Ensure the db-init container has completed successfully.`);
                }
                console.log('✅ [RUNTIME] Database schema verified successfully.');
            } catch (schemaErr) {
                console.error('❌ FATAL: Database schema readiness check failed:', schemaErr.message);
                throw schemaErr;
            }
        }

        const cronTasks = [];
        const intervalHandles = [];
        const timeoutHandles = [];

        // 3. Ping servisini başlat
        const pingService = new PingService(io);

        // 4. Periyodik ping taraması (setInterval — saniye düzeyinde hassasiyet)
        const intervalSeconds = parseInt(process.env.PING_INTERVAL_SECONDS || '60');
        const intervalMs = intervalSeconds * 1000;

        intervalHandles.push(
            setInterval(() => {
                pingService.scanAllDevices();
            }, intervalMs)
        );

        // İlk ping taramasını 5 saniye sonra başlat
        timeoutHandles.push(
            setTimeout(() => {
                pingService.scanAllDevices();
            }, 5000)
        );

        // 5. Printer Monitor servisini başlat
        const printerMonitorService = new PrinterMonitorService(io);
        app.set('printerMonitorService', printerMonitorService);

        // 6. Periyodik yazıcı taraması (Her 5 dakikada bir)
        cronTasks.push(
            cron.schedule('*/5 * * * *', () => {
                printerMonitorService.scanAllPrinters();
            })
        );

        // İlk yazıcı taramasını 10 saniye sonra başlat
        timeoutHandles.push(
            setTimeout(() => {
                printerMonitorService.scanAllPrinters();
            }, 10000)
        );

        // 7. Eski veri temizleme servisi
        const cleanupService = new CleanupService();

        // Her gün gece 03:00'te eski kayıtları temizle
        cronTasks.push(
            cron.schedule('0 3 * * *', () => {
                cleanupService.runCleanup();
            })
        );

        // İlk temizliği 30 saniye sonra çalıştır
        timeoutHandles.push(
            setTimeout(() => {
                cleanupService.runCleanup();
            }, 30000)
        );

        // 8. Graceful Shutdown Handlers (SIGTERM, SIGINT)
        let isShuttingDown = false;
        const gracefulShutdown = async (signal) => {
            if (isShuttingDown) return;
            isShuttingDown = true;
            console.log(`\n🛑 [${signal}] Graceful shutdown sequence initiated...`);

            // Bounded timeout to prevent hanging process (max 10 seconds)
            const forceTimer = setTimeout(() => {
                console.error('⚠️ Graceful shutdown timed out after 10 seconds. Forcing process exit.');
                process.exit(1);
            }, 10000);
            forceTimer.unref();

            try {
                // Stop cron jobs
                cronTasks.forEach(task => task && task.stop());

                // Clear intervals and timeouts
                intervalHandles.forEach(h => clearInterval(h));
                timeoutHandles.forEach(h => clearTimeout(h));

                // Stop accepting new HTTP requests
                await new Promise(resolve => server.close(resolve));
                console.log('✅ HTTP server closed.');

                // Close Socket.IO server and disconnect clients
                await new Promise(resolve => io.close(resolve));
                console.log('✅ Socket.IO server closed.');

                // Close MSSQL connection pool
                await pool.close();
                console.log('✅ Database connection pool closed.');

                console.log('👋 Graceful shutdown completed cleanly.');
                process.exit(0);
            } catch (shutdownErr) {
                console.error('❌ Error during graceful shutdown:', shutdownErr);
                process.exit(1);
            }
        };

        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));

        // 9. Sunucuyu başlat
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
