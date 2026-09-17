const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'on-off-dash-secret-key-2026';

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.split(' ')[1];

    if (!token && req.query.token) {
        token = req.query.token;
    }

    if (!token) {
        return res.status(401).json({ error: 'Erişim engellendi. Giriş yapılması gerekiyor.' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Geçersiz veya süresi dolmuş oturum anahtarı.' });
        }
        req.user = user;
        next();
    });
}

function requireRole(roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Yetkilendirme başarısız.' });
        }
        const hasRole = Array.isArray(roles) ? roles.includes(req.user.role) : req.user.role === roles;
        if (!hasRole) {
            return res.status(403).json({ error: 'Bu işlem için yetkiniz bulunmamaktadır.' });
        }
        next();
    };
}

module.exports = {
    authenticateToken,
    requireRole,
    JWT_SECRET
};
