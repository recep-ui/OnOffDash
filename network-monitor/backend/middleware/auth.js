const jwt = require('jsonwebtoken');

// Validate JWT_SECRET on module load — never allow silent fallback in production
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || typeof JWT_SECRET !== 'string' || JWT_SECRET.trim().length < 32) {
    console.error('FATAL CONFIGURATION ERROR: JWT_SECRET environment variable is missing or shorter than 32 characters.');
    console.error('Set a secure JWT_SECRET in your .env file before starting the application.');
    // In test or non-production environments where tests might import before env is loaded, throw or exit
    if (process.env.NODE_ENV !== 'test') {
        process.exit(1);
    }
}

// Role hierarchy: admin > operator > viewer
const ROLE_HIERARCHY = {
    admin: 3,
    operator: 2,
    viewer: 1
};

/**
 * Express middleware to authenticate requests using JWT in Authorization header.
 * Rejects any query-string token parameter to prevent token leakage in URLs and logs.
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

    if (!token) {
        return res.status(401).json({ error: 'Erişim engellendi. Giriş yapılması gerekiyor.' });
    }

    jwt.verify(token, process.env.JWT_SECRET || JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Geçersiz veya süresi dolmuş oturum anahtarı.' });
        }
        req.user = user;
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
    ROLE_HIERARCHY
};
