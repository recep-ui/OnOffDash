const jwt = require('jsonwebtoken');

// Validate JWT_SECRET on module load — never allow silent fallback in production
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || typeof JWT_SECRET !== 'string' || JWT_SECRET.trim().length < 32) {
    if (process.env.NODE_ENV === 'production' && !process.env.npm_lifecycle_event?.includes('test')) {
        console.error('FATAL CONFIGURATION ERROR: JWT_SECRET environment variable is missing or shorter than 32 characters.');
        console.error('Set a secure JWT_SECRET in your .env file before starting the application.');
        process.exit(1);
    }
}

// Role hierarchy: admin > operator > viewer
const ROLE_HIERARCHY = {
    admin: 3,
    operator: 2,
    viewer: 1
};

const { pool } = require('../db/connection');

// In-memory session tracking for instant revocation and high-performance validation
// Map<userId, { token_version: number, role: string, deleted: boolean }>
const sessionCache = new Map();

function setUserSession(userId, { token_version, role, deleted = false }) {
    sessionCache.set(Number(userId), {
        token_version: token_version !== undefined ? Number(token_version) : 1,
        role: role ? String(role).toLowerCase() : undefined,
        deleted: Boolean(deleted)
    });
}

function invalidateUserSessions(userId) {
    const current = sessionCache.get(Number(userId)) || { token_version: 1 };
    sessionCache.set(Number(userId), {
        ...current,
        token_version: (current.token_version || 1) + 1
    });
}

function markUserDeleted(userId) {
    sessionCache.set(Number(userId), { deleted: true });
}

function clearSessionCache() {
    sessionCache.clear();
}

/**
 * Express middleware to authenticate requests using JWT in Authorization header.
 * Rejects any query-string token parameter to prevent token leakage in URLs and logs.
 * Enforces server-side session invalidation (token_version, role change, user deletion).
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

    if (!token) {
        return res.status(401).json({ error: 'Erişim engellendi. Giriş yapılması gerekiyor.' });
    }

    jwt.verify(token, process.env.JWT_SECRET || JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş oturum anahtarı.' });
        }

        const userId = Number(decoded.id);

        // Instant session invalidation check against session cache
        if (userId && sessionCache.has(userId)) {
            const cached = sessionCache.get(userId);
            if (cached.deleted) {
                return res.status(401).json({ error: 'Kullanıcı hesabı bulunamadı veya silinmiştir.' });
            }
            if (decoded.token_version !== undefined && cached.token_version !== undefined && Number(decoded.token_version) < Number(cached.token_version)) {
                return res.status(401).json({ error: 'Oturum sonlandırıldı veya parola değiştirildi. Lütfen tekrar giriş yapınız.' });
            }
            if (cached.role && decoded.role && cached.role !== decoded.role.toLowerCase()) {
                return res.status(401).json({ error: 'Kullanıcı rolü güncellenmiştir. Lütfen tekrar giriş yapınız.' });
            }
        }

        req.user = decoded;

        // Enforce password change restriction: only /api/auth/me and /api/auth/change-password allowed
        if (decoded.must_change_password) {
            const requestPath = req.originalUrl ? req.originalUrl.split('?')[0] : ((req.baseUrl || '') + (req.path || ''));
            const allowedPaths = ['/api/auth/me', '/api/auth/change-password'];
            const isAllowed = allowedPaths.some(p => requestPath === p || requestPath.endsWith(p));
            if (!isAllowed) {
                return res.status(403).json({
                    error: 'Parola değişimi zorunludur. Lütfen önce şifrenizi güncelleyiniz.',
                    code: 'PASSWORD_CHANGE_REQUIRED',
                    must_change_password: true
                });
            }
        }

        next();
    });
}

/**
 * Express middleware to enforce Role-Based Access Control (RBAC).
 * Supports minimum role hierarchy (e.g., 'operator' allows both operator and admin)
 * or explicit array of allowed roles.
 *
 * @param {string|string[]} roles - Minimum role required or list of allowed roles
 */
function requireRole(roles) {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(401).json({ error: 'Yetkilendirme başarısız. Kullanıcı oturumu bulunamadı.' });
        }

        const userRole = req.user.role.toLowerCase();
        const userLevel = ROLE_HIERARCHY[userRole] || 0;

        let hasPermission = false;

        if (Array.isArray(roles)) {
            const normalized = roles.map(r => r.toLowerCase());
            hasPermission = normalized.includes(userRole) || userRole === 'admin';
        } else if (typeof roles === 'string') {
            const minRequiredLevel = ROLE_HIERARCHY[roles.toLowerCase()] || 999;
            hasPermission = userLevel >= minRequiredLevel;
        }

        if (!hasPermission) {
            return res.status(403).json({ error: 'Bu işlem için yetkiniz bulunmamaktadır.' });
        }

        next();
    };
}

module.exports = {
    authenticateToken,
    requireRole,
    JWT_SECRET: process.env.JWT_SECRET || JWT_SECRET,
    ROLE_HIERARCHY,
    setUserSession,
    invalidateUserSessions,
    markUserDeleted,
    clearSessionCache
};
