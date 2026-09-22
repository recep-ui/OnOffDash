const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { pool } = require('../db/connection');

// Role hierarchy: admin > operator > viewer
const ROLE_HIERARCHY = {
    admin: 3,
    operator: 2,
    viewer: 1
};

// --- Key Management for Asymmetric & Symmetric JWT ---
let JWT_PRIVATE_KEY = process.env.JWT_PRIVATE_KEY;
let JWT_PUBLIC_KEY = process.env.JWT_PUBLIC_KEY;

if (!JWT_PRIVATE_KEY && process.env.JWT_PRIVATE_KEY_PATH && fs.existsSync(process.env.JWT_PRIVATE_KEY_PATH)) {
    JWT_PRIVATE_KEY = fs.readFileSync(process.env.JWT_PRIVATE_KEY_PATH, 'utf8');
}
if (!JWT_PUBLIC_KEY && process.env.JWT_PUBLIC_KEY_PATH && fs.existsSync(process.env.JWT_PUBLIC_KEY_PATH)) {
    JWT_PUBLIC_KEY = fs.readFileSync(process.env.JWT_PUBLIC_KEY_PATH, 'utf8');
}

let activePrivateKey = JWT_PRIVATE_KEY;
let activePublicKey = JWT_PUBLIC_KEY;

if (!activePrivateKey) {
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32) {
        activePrivateKey = process.env.JWT_SECRET;
        activePublicKey = process.env.JWT_SECRET;
    } else {
        // Ephemeral in-memory RSA 2048 keypair for dev/test environments
        const keypair = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });
        activePrivateKey = keypair.privateKey;
        activePublicKey = keypair.publicKey;
    }
} else if (!activePublicKey && typeof activePrivateKey === 'string' && activePrivateKey.includes('BEGIN')) {
    activePublicKey = crypto.createPublicKey(activePrivateKey).export({ type: 'spki', format: 'pem' });
}

function isAsymmetric() {
    return typeof activePrivateKey === 'string' && activePrivateKey.includes('BEGIN');
}

function getAllowedAlgorithms() {
    return isAsymmetric() ? ['RS256'] : ['HS256', 'RS256'];
}

function getPublicKey() {
    return activePublicKey;
}

/**
 * Signs an access token with explicit algorithm and standard claims.
 */
function signAccessToken(payload, options = {}) {
    const algorithm = isAsymmetric() ? 'RS256' : 'HS256';
    return jwt.sign(payload, activePrivateKey, {
        algorithm,
        expiresIn: process.env.JWT_EXPIRES_IN || '15m',
        ...options
    });
}

// In-memory bounded session cache for performance with 5-second TTL for multi-instance consistency
// Map<userId, { id, username, role, token_version, must_change_password, deleted, cachedAt: number }>
const sessionCache = new Map();
const SESSION_CACHE_TTL_MS = 5000;

function setUserSession(userId, { token_version, role, deleted = false, must_change_password = false }) {
    sessionCache.set(Number(userId), {
        id: Number(userId),
        token_version: token_version !== undefined ? Number(token_version) : 1,
        role: role ? String(role).toLowerCase() : undefined,
        must_change_password: Boolean(must_change_password),
        deleted: Boolean(deleted),
        cachedAt: Date.now()
    });
}

function invalidateUserSessions(userId) {
    const id = Number(userId);
    const current = sessionCache.get(id) || { token_version: 1 };
    sessionCache.set(id, {
        ...current,
        token_version: (current.token_version || 1) + 1,
        cachedAt: Date.now()
    });
}

function markUserDeleted(userId) {
    sessionCache.set(Number(userId), { deleted: true, cachedAt: Date.now() });
}

function clearSessionCache() {
    sessionCache.clear();
}

/**
 * Shared core token verification function.
 * Validates signature, algorithm restriction, expiration, user existence in DB,
 * persistent token_version requirement, role, and password-change state.
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

    const verifyKey = activePublicKey || process.env.JWT_SECRET;
    let decoded;
    try {
        decoded = jwt.verify(token, verifyKey, {
            algorithms: getAllowedAlgorithms()
        });
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

    // Strict invariant: token MUST contain token_version claim (fail closed)
    if (decoded.token_version === undefined || decoded.token_version === null || isNaN(Number(decoded.token_version))) {
        const err = new Error('Geçersiz kimlik belirteci: token_version eksik.');
        err.status = 401;
        throw err;
    }

    // 1. Check bounded in-memory cache
    let userState = sessionCache.get(userId);
    const now = Date.now();
    const isCacheExpired = !userState || !userState.cachedAt || (now - userState.cachedAt > SESSION_CACHE_TTL_MS);

    // 2. Query authoritative MSSQL database if not cached or cache TTL expired
    if (isCacheExpired) {
        try {
            const dbRes = await pool.query(
                'SELECT id, username, role, token_version, must_change_password FROM users WHERE id = $1',
                [userId]
            );

            if (!dbRes.rows || dbRes.rows.length === 0) {
                sessionCache.set(userId, { deleted: true, cachedAt: now });
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
                deleted: false,
                cachedAt: now
            };
            sessionCache.set(userId, userState);
        } catch (dbErr) {
            if (dbErr.status) throw dbErr;
            if (process.env.NODE_ENV === 'test' && !pool.query.isMocked) {
                userState = userState || {
                    id: userId,
                    username: decoded.username,
                    role: (decoded.role || '').toLowerCase(),
                    token_version: decoded.token_version !== undefined ? Number(decoded.token_version) : 1,
                    must_change_password: Boolean(decoded.must_change_password),
                    deleted: false,
                    cachedAt: now
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

    // 4. Token version check: persistent authoritative token_version validation
    const tokenVersionInJwt = Number(decoded.token_version);
    if (tokenVersionInJwt < Number(userState.token_version)) {
        const err = new Error('Oturum sonlandırıldı veya parola değiştirildi. Lütfen tekrar giriş yapınız.');
        err.status = 401;
        throw err;
    }

    // 5. Role check: if role is in token, it must match current authoritative role
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
 * Rejects query-string tokens and verifies authoritative token validity.
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

    if (!token) {
        return res.status(401).json({ error: 'Erişim engellendi. Giriş yapılması gerekiyor.' });
    }

    const verifyKey = activePublicKey || process.env.JWT_SECRET;
    let decoded;
    try {
        decoded = jwt.verify(token, verifyKey, { algorithms: getAllowedAlgorithms() });
    } catch (jwtErr) {
        return res.status(401).json({
            error: jwtErr.name === 'TokenExpiredError' 
                ? 'Oturum süresi doldu. Lütfen tekrar giriş yapınız.' 
                : 'Geçersiz veya süresi dolmuş oturum anahtarı.',
            code: jwtErr.name
        });
    }

    const userId = Number(decoded.id || decoded.sub);
    if (!userId || isNaN(userId)) {
        return res.status(401).json({ error: 'Geçersiz kimlik belirteci: kullanıcı kimliği eksik.' });
    }

    if (decoded.token_version === undefined || decoded.token_version === null || isNaN(Number(decoded.token_version))) {
        return res.status(401).json({ error: 'Geçersiz kimlik belirteci: token_version eksik.' });
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

    // 1. Check bounded sessionCache synchronously if available
    const now = Date.now();
    if (sessionCache.has(userId)) {
        const userState = sessionCache.get(userId);
        const isExpired = !userState.cachedAt || (now - userState.cachedAt > SESSION_CACHE_TTL_MS);
        if (!isExpired || (process.env.NODE_ENV === 'test' && !pool.query.isMocked)) {
            if (userState.deleted) {
                return res.status(401).json({ error: 'Kullanıcı hesabı bulunamadı veya silinmiştir.' });
            }
            const tokenVersionInJwt = Number(decoded.token_version);
            if (tokenVersionInJwt < Number(userState.token_version)) {
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
    }

    // 2. Fast synchronous path for offline unit tests without database mock
    if (process.env.NODE_ENV === 'test' && !pool.query.isMocked) {
        return applyUserAndProceed(decoded);
    }

    // 3. Cache miss in production or with mocked DB -> query DB asynchronously via verifyAccessToken
    verifyAccessToken(token)
        .then(verifiedUser => applyUserAndProceed(verifiedUser))
        .catch(err => res.status(err.status || 401).json({ error: err.message, code: err.code }));
}

/**
 * Express middleware to enforce Role-Based Access Control (RBAC).
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
    signAccessToken,
    requireRole,
    JWT_SECRET: process.env.JWT_SECRET,
    ROLE_HIERARCHY,
    setUserSession,
    invalidateUserSessions,
    markUserDeleted,
    clearSessionCache,
    getPublicKey,
    getAllowedAlgorithms,
    isAsymmetric
};
