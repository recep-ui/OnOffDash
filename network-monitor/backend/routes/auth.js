const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db/connection');
const { authenticateToken, requireRole, JWT_SECRET } = require('../middleware/auth');

// POST /api/auth/login — Giriş Yap
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Kullanıcı adı ve şifre gereklidir.' });
    }

    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username.trim()]);
        const user = result.rows[0];

        if (!user) {
            return res.status(401).json({ error: 'Hatalı kullanıcı adı veya şifre.' });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Hatalı kullanıcı adı veya şifre.' });
        }

        // Token oluştur (12 saat geçerli)
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '12h' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role
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
        const result = await pool.query('SELECT id, username, role, created_at FROM users WHERE id = $1', [req.user.id]);
        const user = result.rows[0];
        if (!user) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
        }
        res.json({ user });
    } catch (err) {
        console.error('Get me error:', err);
        res.status(500).json({ error: 'Sunucu hatası.' });
    }
});

// GET /api/auth/users — Tüm kullanıcıları listele (Admin yetkisi gerekir)
router.get('/users', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username, role, created_at FROM users ORDER BY username');
        res.json(result.rows);
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

    try {
        const checkUser = await pool.query('SELECT * FROM users WHERE username = $1', [username.trim()]);
        if (checkUser.rows.length > 0) {
            return res.status(409).json({ error: 'Bu kullanıcı adı zaten alınmış.' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const result = await pool.query(
            `INSERT INTO users (username, password_hash, role)
             OUTPUT INSERTED.id, INSERTED.username, INSERTED.role, INSERTED.created_at
             VALUES ($1, $2, $3)`,
            [username.trim(), passwordHash, role]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Create user error:', err);
        res.status(500).json({ error: 'Kullanıcı oluşturulamadı.' });
    }
});

// PUT /api/auth/users/:id — Kullanıcı rolünü veya şifresini güncelle (Admin yetkisi gerekir)
router.put('/users/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    const { id } = req.params;
    const { role, password } = req.body;

    try {
        // Kendi yetkisini düşürmesini engelle
        if (parseInt(id) === req.user.id && role && role !== 'admin') {
            return res.status(400).json({ error: 'Kendi yöneticilik (admin) rolünüzü kaldıramazsınız.' });
        }

        let query = 'UPDATE users SET updated_at = GETDATE()';
        const params = [];
        let paramIndex = 1;

        if (role) {
            query += `, role = $${paramIndex++}`;
            params.push(role);
        }

        if (password) {
            const passwordHash = await bcrypt.hash(password, 10);
            query += `, password_hash = $${paramIndex++}`;
            params.push(passwordHash);
        }

        query += ` OUTPUT INSERTED.id, INSERTED.username, INSERTED.role, INSERTED.created_at WHERE id = $${paramIndex}`;
        params.push(id);

        const result = await pool.query(query, params);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
        }

        res.json(result.rows[0]);
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
        res.json({ message: `Kullanıcı '${result.rows[0].username}' başarıyla silindi.` });
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ error: 'Kullanıcı silinemedi.' });
    }
});

module.exports = router;
