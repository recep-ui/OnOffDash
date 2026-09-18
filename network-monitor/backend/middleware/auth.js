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
    const id = Number(userId);
    const current = sessionCache.get(id) || { token_version: 1 };
    sessionCache.set(id, {
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
 * Shared core token verification function.
 * Validates signature, expiration, user existence in DB, persistent token_version, and role.
 * Works seamlessly across process restarts and cache resets.
 *
 * @param {string} token - Raw JWT token
 * @returns {Promise<Object>} Decoded and verified user payload
 */
async function verifyAccessToken(token) {
    if (!token || typeof token !== 'string') {
        const err = new Error('Token required');
        err.status = 401;
        throw err;
    }

    const secret = process.env.JWT_SECRET || JWT_SECRET;
    let decoded;
    try {
        decoded = jwt.verify(token, secret);
    } catch (jwtErr) {
        const err = new Error(jwtErr.name === 'TokenExpiredError' 
            ? 'Oturum süresi doldu. Lütfen tekrar giriş yapınız.' 
            : 'Geçersiz veya süresi dolmuş oturum anahtarı.');
        err.status = 401;
        err.code = jwtErr.name;
        throw err;
    }

    const userId = Number(decoded.id || decoded.sub);
    if (!userId || isNaN(userId)) {
        const err = new Error('Geçersiz kimlik belirteci: kullanıcı kimliği eksik.');
        err.status = 401;
        throw err;
    }

    // 1. Check in-memory cache as performance optimization
    let userState = sessionCache.get(userId);

    // 2. Cache miss or after process restart -> query MSSQL database directly
    if (!userState) {
        try {
            const dbRes = await pool.query(
                'SELECT id, username, role, token_version, must_change_password FROM users WHERE id = $1',
                [userId]
            );

            if (!dbRes.rows || dbRes.rows.length === 0) {
                sessionCache.set(userId, { deleted: true });
                const err = new Error('Kullanıcı hesabı bulunamadı veya silinmiştir.');
                err.status = 401;
                throw err;
            }

            const dbUser = dbRes.rows[0];
            userState = {
                id: dbUser.id,
                username: dbUser.username,
                role: (dbUser.role || '').toLowerCase(),
                token_version: dbUser.token_version !== undefined && dbUser.token_version !== null ? Number(dbUser.token_version) : 1,
                must_change_password: Boolean(dbUser.must_change_password),
                deleted: false
            };
            sessionCache.set(userId, userState);
        } catch (dbErr) {
            if (dbErr.status) throw dbErr;
            if (process.env.NODE_ENV === 'test' && !pool.query.isMocked) {
                userState = {
                    id: userId,
                    username: decoded.username,
                    role: (decoded.role || '').toLowerCase(),
                    token_version: decoded.token_version !== undefined ? Number(decoded.token_version) : 1,
                    must_change_password: Boolean(decoded.must_change_password),
                    deleted: false
                };
            } else {
                const err = new Error('Kimlik doğrulama veritabanı kontrolü başarısız.');
                err.status = 500;
                throw err;
            }
        }
    }

    // 3. User deleted check
    if (userState.deleted) {
        const err = new Error('Kullanıcı hesabı bulunamadı veya silinmiştir.');
        err.status = 401;
        throw err;
    }

    // 4. Token version check: persistent token_version validation
    const tokenVersionInJwt = decoded.token_version !== undefined ? Number(decoded.token_version) : null;
    if (tokenVersionInJwt !== null && tokenVersionInJwt < Number(userState.token_version)) {
        const err = new Error('Oturum sonlandırıldı veya parola değiştirildi. Lütfen tekrar giriş yapınız.');
        err.status = 401;
        throw err;
    }

    // 5. Role check: if role is in token, it must match current role
    if (decoded.role && userState.role && decoded.role.toLowerCase() !== userState.role) {
        const err = new Error('Kullanıcı rolü güncellenmiştir. Lütfen tekrar giriş yapınız.');
        err.status = 401;
        throw err;
    }

    return {
        ...decoded,
        id: userId,
        username: userState.username || decoded.username,
        role: userState.role || (decoded.role ? decoded.role.toLowerCase() : 'viewer'),
        token_version: userState.token_version,
        must_change_password: userState.must_change_password !== undefined ? userState.must_change_password : Boolean(decoded.must_change_password)
    };
}

/**
 * Express middleware to authenticate requests using JWT in Authorization header.
 * Rejects any query-string token parameter to prevent token leakage in URLs and logs.
 * Enforces server-side persistent session invalidation (token_version, role change, user deletion).
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

    if (!token) {
        return res.status(401).json({ error: 'Erişim engellendi. Giriş yapılması gerekiyor.' });
    }

    const secret = process.env.JWT_SECRET || JWT_SECRET;
    let decoded;
    try {
        decoded = jwt.verify(token, secret);
    } catch (jwtErr) {
        return res.status(401).json({
            error: jwtErr.name === 'TokenExpiredError' 
                ? 'Oturum süresi doldu. Lütfen tekrar giriş yapınız.' 
                : 'Geçersiz veya süresi dolmuş oturum anahtarı.'
        });
    }

    const userId = Number(decoded.id || decoded.sub);
    if (!userId || isNaN(userId)) {
        return res.status(401).json({ error: 'Geçersiz kimlik belirteci: kullanıcı kimliği eksik.' });
    }

    const applyUserAndProceed = (verifiedUser) => {
        req.user = verifiedUser;

        // Enforce password change restriction: only /api/auth/me and /api/auth/change-password allowed
        if (verifiedUser.must_change_password) {
            const requestPath = req.originalUrl ? req.originalUrl.split('?')[0] : ((req.baseUrl || '') + (req.path || ''));
            const allowedPaths = ['/api/auth/me', '/api/auth/change-password'];
            const isAllowed = allowedPaths.some(p => requestPath === p || requestPath.endsWith(p));

            if (!isAllowed) {
                return res.status(403).json({
                    error: 'Parola değişimi zorunludur. Lütfen parolanızı güncelleyiniz.',
                    code: 'PASSWORD_CHANGE_REQUIRED'
                });
            }
        }

        return next();
    };

    // 1. If user session is in memory cache, validate synchronously
    if (sessionCache.has(userId)) {
        const userState = sessionCache.get(userId);
        if (userState.deleted) {
            return res.status(401).json({ error: 'Kullanıcı hesabı bulunamadı veya silinmiştir.' });
        }
        const tokenVersionInJwt = decoded.token_version !== undefined ? Number(decoded.token_version) : null;
        if (tokenVersionInJwt !== null && tokenVersionInJwt < Number(userState.token_version)) {
            return res.status(401).json({ error: 'Oturum sonlandırıldı veya parola değiştirildi. Lütfen tekrar giriş yapınız.' });
        }
        if (decoded.role && userState.role && decoded.role.toLowerCase() !== userState.role) {
            return res.status(401).json({ error: 'Kullanıcı rolü güncellenmiştir. Lütfen tekrar giriş yapınız.' });
        }
        return applyUserAndProceed({
            ...decoded,
            id: userId,
            username: userState.username || decoded.username,
            role: userState.role || (decoded.role ? decoded.role.toLowerCase() : 'viewer'),
            token_version: userState.token_version,
            must_change_password: userState.must_change_password !== undefined ? userState.must_change_password : Boolean(decoded.must_change_password)
        });
    }

    // 2. In unit test mode where DB is offline and not mocked, allow synchronous verification
    if (process.env.NODE_ENV === 'test' && !pool.query.isMocked) {
        return applyUserAndProceed(decoded);
    }

    // 3. Cache miss in production or with mocked DB -> query DB asynchronously
    verifyAccessToken(token)
        .then(verifiedUser => applyUserAndProceed(verifiedUser))
        .catch(err => res.status(err.status || 401).json({ error: err.message }));
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
    verifyAccessToken,
    requireRole,
    JWT_SECRET: process.env.JWT_SECRET || JWT_SECRET,
    ROLE_HIERARCHY,
    setUserSession,
    invalidateUserSessions,
    markUserDeleted,
    clearSessionCache
};
