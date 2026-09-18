const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db/connection');
const { 
    authenticateToken, 
    requireRole, 
    JWT_SECRET, 
    setUserSession, 
    markUserDeleted 
} = require('../middleware/auth');
const { 
    parseCookies, 
    setRefreshTokenCookie, 
    clearRefreshTokenCookie 
} = require('../utils/cookieHelper');

const ACCESS_TOKEN_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';

// Rate limiting on login: max 10 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Çok fazla giriş denemesi. Lütfen 15 dakika sonra tekrar deneyiniz.' }
});

const ALLOWED_ROLES = ['admin', 'operator', 'viewer'];

// POST /api/auth/login — Giriş Yap (Brute-force protected)
router.post('/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Kullanıcı adı ve şifre gereklidir.' });
    }

    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username.trim()]);
        const user = result.rows[0];

        // Generic error message to prevent username enumeration
        if (!user) {
            return res.status(401).json({ error: 'Hatalı kullanıcı adı veya şifre.' });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Hatalı kullanıcı adı veya şifre.' });
        }

        // Token oluştur (kısa ömürlü access token: 15-30 dk, token_version ve must_change_password dahil)
        const tokenVersion = user.token_version !== undefined ? user.token_version : 1;
        const token = jwt.sign(
            { 
                id: user.id, 
                username: user.username, 
                role: user.role, 
                token_version: tokenVersion,
                must_change_password: Boolean(user.must_change_password) 
            },
            JWT_SECRET,
            { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
        );

        // Güvenli rastgele refresh token üret ve hash'ini DB'ye kaydet
        const rawRefreshToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

        try {
            await pool.query(
                `INSERT INTO user_refresh_tokens (user_id, token_hash, token_version, expires_at, created_at)
                 VALUES ($1, $2, $3, DATEADD(day, 7, GETDATE()), GETDATE())`,
                [user.id, tokenHash, tokenVersion]
            );
        } catch (rtErr) {
            console.warn('Notice: user_refresh_tokens insert:', rtErr.message);
        }

        // HttpOnly, SameSite=Strict cookie ata (JavaScript erişemez)
        setRefreshTokenCookie(res, rawRefreshToken);
        setUserSession(user.id, { token_version: tokenVersion, role: user.role });

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                must_change_password: Boolean(user.must_change_password)
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Giriş yapılırken sunucu hatası oluştu.' });
    }
});

// GET /api/auth/me — Mevcut kullanıcı oturumu
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, username, role, must_change_password, created_at FROM users WHERE id = $1',
            [req.user.id]
        );
        const user = result.rows[0];
        if (!user) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
        }
        res.json({
            user: {
                ...user,
                must_change_password: Boolean(user.must_change_password)
            }
        });
    } catch (err) {
        console.error('Get me error:', err);
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// POST /api/auth/change-password — Kullanıcının kendi şifresini değiştirmesi
router.post('/change-password', authenticateToken, async (req, res) => {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
        return res.status(400).json({ error: 'Eski şifre ve yeni şifre alanları zorunludur.' });
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
        return res.status(400).json({ error: 'Yeni şifre en az 8 karakter uzunluğunda olmalıdır.' });
    }

    try {
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
        const user = result.rows[0];
        if (!user) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
        }

        const validOldPassword = await bcrypt.compare(oldPassword, user.password_hash);
        if (!validOldPassword) {
            return res.status(401).json({ error: 'Mevcut şifreniz hatalı.' });
        }

        const newHash = await bcrypt.hash(newPassword, 10);
        const updateResult = await pool.query(
            'UPDATE users SET password_hash = $1, must_change_password = 0, token_version = COALESCE(token_version, 1) + 1, updated_at = GETDATE() OUTPUT INSERTED.token_version WHERE id = $2',
            [newHash, req.user.id]
        );
        const newTokenVersion = updateResult.rows[0]?.token_version || 2;

        // Eski refresh session'ları iptal et
        try {
            await pool.query('UPDATE user_refresh_tokens SET revoked_at = GETDATE() WHERE user_id = $1', [req.user.id]);
        } catch (_) {}

        // Yeni refresh token üret ve cookie güncelle
        const rawRefreshToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
        try {
            await pool.query(
                `INSERT INTO user_refresh_tokens (user_id, token_hash, token_version, expires_at, created_at)
                 VALUES ($1, $2, $3, DATEADD(day, 7, GETDATE()), GETDATE())`,
                [req.user.id, tokenHash, newTokenVersion]
            );
        } catch (_) {}
        setRefreshTokenCookie(res, rawRefreshToken);

        // Şifre güncellendikten sonra kısıtlaması kaldırılmış ve güncel token_version ile yeni bir access token üret
        const newToken = jwt.sign(
            { 
                id: user.id, 
                username: user.username, 
                role: user.role, 
                token_version: newTokenVersion,
                must_change_password: false 
            },
            JWT_SECRET,
            { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
        );

        setUserSession(user.id, { token_version: newTokenVersion, role: user.role });

        res.json({ 
            message: 'Şifreniz başarıyla güncellendi.',
            token: newToken,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                must_change_password: false
            }
        });
    } catch (err) {
        console.error('Change password error:', err);
        res.status(500).json({ error: 'Şifre güncellenirken sunucu hatası oluştu.' });
    }
});

// POST /api/auth/refresh — HttpOnly refresh cookie ile oturum/access token yenile (Semantically correct refresh)
router.post('/refresh', async (req, res) => {
    try {
        const cookies = parseCookies(req);
        const rawRefreshToken = cookies.refreshToken || req.body?.refreshToken;

        if (!rawRefreshToken || typeof rawRefreshToken !== 'string') {
            return res.status(401).json({ error: 'Yenileme belirteci bulunamadı. Lütfen tekrar giriş yapınız.' });
        }

        const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

        const sessionRes = await pool.query(
            `SELECT r.id, r.user_id, r.token_version, r.expires_at, r.revoked_at,
                    u.id AS uid, u.username, u.role, u.token_version AS current_token_version, u.must_change_password
             FROM user_refresh_tokens r
             JOIN users u ON r.user_id = u.id
             WHERE r.token_hash = $1`,
            [tokenHash]
        );

        if (sessionRes.rows.length === 0) {
            clearRefreshTokenCookie(res);
            return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş yenileme oturumu.' });
        }

        const session = sessionRes.rows[0];

        if (session.revoked_at || new Date() > new Date(session.expires_at)) {
            clearRefreshTokenCookie(res);
            return res.status(401).json({ error: 'Yenileme oturumu süresi dolmuş veya iptal edilmiş.' });
        }

        // Token version kontrolü (parola veya rol değiştiyse eski oturum geçersiz)
        if (Number(session.token_version) < Number(session.current_token_version)) {
            await pool.query('UPDATE user_refresh_tokens SET revoked_at = GETDATE() WHERE id = $1', [session.id]);
            clearRefreshTokenCookie(res);
            return res.status(401).json({ error: 'Oturum sonlandırıldı veya parola değiştirildi. Lütfen tekrar giriş yapınız.' });
        }

        // Refresh token rotation: eski token'ı iptal et ve yenisini oluştur
        await pool.query('UPDATE user_refresh_tokens SET revoked_at = GETDATE() WHERE id = $1', [session.id]);

        const nextRefreshToken = crypto.randomBytes(32).toString('hex');
        const nextHash = crypto.createHash('sha256').update(nextRefreshToken).digest('hex');
        await pool.query(
            `INSERT INTO user_refresh_tokens (user_id, token_hash, token_version, expires_at, created_at)
             VALUES ($1, $2, $3, DATEADD(day, 7, GETDATE()), GETDATE())`,
            [session.uid, nextHash, session.current_token_version]
        );
        setRefreshTokenCookie(res, nextRefreshToken);

        const newAccessToken = jwt.sign(
            {
                id: session.uid,
                username: session.username,
                role: session.role,
                token_version: session.current_token_version,
                must_change_password: Boolean(session.must_change_password)
            },
            JWT_SECRET,
            { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
        );

        setUserSession(session.uid, { token_version: session.current_token_version, role: session.role });

        res.json({
            token: newAccessToken,
            user: {
                id: session.uid,
                username: session.username,
                role: session.role,
                must_change_password: Boolean(session.must_change_password)
            }
        });
    } catch (err) {
        console.error('Refresh token error:', err);
        clearRefreshTokenCookie(res);
        res.status(500).json({ error: 'Token yenilenirken sunucu hatası oluştu.' });
    }
});

// POST /api/auth/logout — Oturumu sonlandır ve refresh token'ı iptal et
router.post('/logout', async (req, res) => {
    try {
        const cookies = parseCookies(req);
        const rawRefreshToken = cookies.refreshToken || req.body?.refreshToken;
        if (rawRefreshToken) {
            const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
            await pool.query('UPDATE user_refresh_tokens SET revoked_at = GETDATE() WHERE token_hash = $1', [tokenHash]);
        }
    } catch (err) {
        console.error('Logout error:', err);
    } finally {
        clearRefreshTokenCookie(res);
        res.json({ message: 'Başarıyla çıkış yapıldı.' });
    }
});

// GET /api/auth/users — Tüm kullanıcıları listele (Admin yetkisi gerekir)
router.get('/users', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, username, role, must_change_password, created_at, updated_at FROM users ORDER BY username'
        );
        res.json(result.rows.map(u => ({ ...u, must_change_password: Boolean(u.must_change_password) })));
    } catch (err) {
        console.error('Get users error:', err);
        res.status(500).json({ error: 'Kullanıcı listesi alınamadı.' });
    }
});

// POST /api/auth/users — Yeni kullanıcı oluştur (Admin yetkisi gerekir)
router.post('/users', authenticateToken, requireRole('admin'), async (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password || !role) {
        return res.status(400).json({ error: 'Kullanıcı adı, şifre ve rol alanları zorunludur.' });
    }

    if (!ALLOWED_ROLES.includes(role.toLowerCase())) {
        return res.status(400).json({ error: `Geçersiz rol. İzin verilen roller: ${ALLOWED_ROLES.join(', ')}` });
    }

    if (typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ error: 'Şifre en az 8 karakter uzunluğunda olmalıdır.' });
    }

    try {
        const checkUser = await pool.query('SELECT * FROM users WHERE username = $1', [username.trim()]);
        if (checkUser.rows.length > 0) {
            return res.status(409).json({ error: 'Bu kullanıcı adı zaten alınmış.' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const result = await pool.query(
            `INSERT INTO users (username, password_hash, role, must_change_password)
             OUTPUT INSERTED.id, INSERTED.username, INSERTED.role, INSERTED.must_change_password, INSERTED.created_at
             VALUES ($1, $2, $3, 0)`,
            [username.trim(), passwordHash, role.toLowerCase()]
        );

        res.status(201).json({
            ...result.rows[0],
            must_change_password: Boolean(result.rows[0].must_change_password)
        });
    } catch (err) {
        console.error('Create user error:', err);
        res.status(500).json({ error: 'Kullanıcı oluşturulamadı.' });
    }
});

// PUT /api/auth/users/:id — Kullanıcı rolünü veya şifresini güncelle (Admin yetkisi gerekir)
router.put('/users/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    const { id } = req.params;
    const { role, password, must_change_password } = req.body;

    try {
        // Kendi yetkisini düşürmesini engelle
        if (parseInt(id) === req.user.id && role && role !== 'admin') {
            return res.status(400).json({ error: 'Kendi yöneticilik (admin) rolünüzü kaldıramazsınız.' });
        }

        if (role && !ALLOWED_ROLES.includes(role.toLowerCase())) {
            return res.status(400).json({ error: `Geçersiz rol. İzin verilen roller: ${ALLOWED_ROLES.join(', ')}` });
        }

        if (password && (typeof password !== 'string' || password.length < 8)) {
            return res.status(400).json({ error: 'Şifre en az 8 karakter uzunluğunda olmalıdır.' });
        }

        let query = 'UPDATE users SET updated_at = GETDATE()';
        const params = [];
        let paramIndex = 1;

        if (role) {
            query += `, role = $${paramIndex++}`;
            params.push(role.toLowerCase());
        }

        if (password) {
            const passwordHash = await bcrypt.hash(password, 10);
            query += `, password_hash = $${paramIndex++}`;
            params.push(passwordHash);
        }

        if (must_change_password !== undefined) {
            query += `, must_change_password = $${paramIndex++}`;
            params.push(must_change_password ? 1 : 0);
        }

        if (role || password) {
            query += `, token_version = COALESCE(token_version, 1) + 1`;
        }

        query += ` OUTPUT INSERTED.id, INSERTED.username, INSERTED.role, INSERTED.token_version, INSERTED.must_change_password, INSERTED.created_at WHERE id = $${paramIndex}`;
        params.push(id);

        const result = await pool.query(query, params);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
        }

        const updatedUser = result.rows[0];
        setUserSession(updatedUser.id, { 
            token_version: updatedUser.token_version, 
            role: updatedUser.role 
        });

        if (role || password) {
            try {
                await pool.query('UPDATE user_refresh_tokens SET revoked_at = GETDATE() WHERE user_id = $1', [updatedUser.id]);
            } catch (_) {}
            const io = req.app.get('io');
            if (io && typeof io.disconnectUser === 'function') {
                io.disconnectUser(updatedUser.id);
            }
        }

        res.json({
            ...updatedUser,
            must_change_password: Boolean(updatedUser.must_change_password)
        });
    } catch (err) {
        console.error('Update user error:', err);
        res.status(500).json({ error: 'Kullanıcı güncellenemedi.' });
    }
});

// DELETE /api/auth/users/:id — Kullanıcıyı sil (Admin yetkisi gerekir)
router.delete('/users/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    const { id } = req.params;

    if (parseInt(id) === req.user.id) {
        return res.status(400).json({ error: 'Kendi kullanıcınızı silemezsiniz.' });
    }

    try {
        const result = await pool.query('DELETE FROM users OUTPUT DELETED.username WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
        }
        markUserDeleted(id);
        try {
            await pool.query('UPDATE user_refresh_tokens SET revoked_at = GETDATE() WHERE user_id = $1', [id]);
        } catch (_) {}
        const io = req.app.get('io');
        if (io && typeof io.disconnectUser === 'function') {
            io.disconnectUser(id);
        }
        res.json({ message: `Kullanıcı '${result.rows[0].username}' başarıyla silindi.` });
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ error: 'Kullanıcı silinemedi.' });
    }
});

module.exports = router;
