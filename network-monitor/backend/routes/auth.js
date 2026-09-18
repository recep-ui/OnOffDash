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
    invalidateUserSessions, 
    markUserDeleted 
} = require('../middleware/auth');

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

        // Token oluştur (30 dk geçerli, token_version ve must_change_password claim'leri dahil)
        const tokenVersion = user.token_version !== undefined ? user.token_version : 1;
        const expiresIn = process.env.JWT_EXPIRES_IN || '30m';
        const token = jwt.sign(
            { 
                id: user.id, 
                username: user.username, 
                role: user.role, 
                token_version: tokenVersion,
                must_change_password: Boolean(user.must_change_password) 
            },
            JWT_SECRET,
            { expiresIn }
        );

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

        // Şifre güncellendikten sonra kısıtlaması kaldırılmış ve güncel token_version ile yeni bir token üret
        const expiresIn = process.env.JWT_EXPIRES_IN || '30m';
        const newToken = jwt.sign(
            { 
                id: user.id, 
                username: user.username, 
                role: user.role, 
                token_version: newTokenVersion,
                must_change_password: false 
            },
            JWT_SECRET,
            { expiresIn }
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

// POST /api/auth/refresh — Kısa ömürlü token'ı yenile
router.post('/refresh', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, username, role, token_version, must_change_password FROM users WHERE id = $1',
            [req.user.id]
        );
        const user = result.rows[0];
        if (!user) {
            return res.status(401).json({ error: 'Kullanıcı bulunamadı.' });
        }

        const tokenVersion = user.token_version !== undefined ? user.token_version : 1;
        const expiresIn = process.env.JWT_EXPIRES_IN || '30m';
        const token = jwt.sign(
            {
                id: user.id,
                username: user.username,
                role: user.role,
                token_version: tokenVersion,
                must_change_password: Boolean(user.must_change_password)
            },
            JWT_SECRET,
            { expiresIn }
        );

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
        console.error('Refresh token error:', err);
        res.status(500).json({ error: 'Token yenilenirken sunucu hatası oluştu.' });
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
        res.json({ message: `Kullanıcı '${result.rows[0].username}' başarıyla silindi.` });
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ error: 'Kullanıcı silinemedi.' });
    }
});

module.exports = router;
