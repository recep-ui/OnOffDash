const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { authenticateAgent } = require('../middleware/agentAuth');

const VERSION_FILE = path.join(__dirname, '..', 'agent_version.json');
const AGENT_DIR = path.join(__dirname, '..', 'agent_binaries');

function getAgentBinaryInfo() {
    if (!fs.existsSync(AGENT_DIR)) return null;
    const files = fs.readdirSync(AGENT_DIR).filter(f => f.endsWith('.exe'));
    if (files.length === 0) return null;

    const filePath = path.join(AGENT_DIR, files[0]);
    const stat = fs.statSync(filePath);
    const content = fs.readFileSync(filePath);
    const sha256 = crypto.createHash('sha256').update(content).digest('hex');

    return {
        fileName: files[0],
        filePath,
        size: stat.size,
        sha256
    };
}

// GET /api/agent/version — Güncel agent versiyon ve SHA-256 bütünlük bilgisi (Serves pre-signed manifest)
router.get('/version', authenticateAgent, (req, res) => {
    try {
        let versionData = { version: '1.0.0', minVersion: '1.0.0' };
        if (fs.existsSync(VERSION_FILE)) {
            versionData = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
        }

        const binaryInfo = getAgentBinaryInfo();
        if (binaryInfo) {
            versionData.sha256 = versionData.sha256 || binaryInfo.sha256;
            versionData.size = versionData.size || binaryInfo.size;
        }

        if (process.env.NODE_ENV === 'production' && !versionData.signature) {
            console.warn('⚠️ WARNING: Agent manifest served in production without release-time digital signature.');
        }

        res.json(versionData);
    } catch (err) {
        console.error('Error reading agent version:', err);
        res.status(500).json({ error: 'Failed to read agent version manifest' });
    }
});

// GET /api/agent/download — Güncel agent exe dosyasını indir (Authenticated)
router.get('/download', authenticateAgent, (req, res) => {
    try {
        const binaryInfo = getAgentBinaryInfo();
        if (binaryInfo) {
            res.setHeader('X-Agent-SHA256', binaryInfo.sha256);
            res.setHeader('X-Agent-Size', String(binaryInfo.size));
            return res.download(binaryInfo.filePath, 'OnOffDash_Agent.exe');
        }

        res.status(404).json({ error: 'Agent binary not found on server.' });
    } catch (err) {
        console.error('Error downloading agent binary:', err);
        res.status(500).json({ error: 'Failed to download agent binary' });
    }
});

// GET /api/agent/changelog — Değişiklik notları
router.get('/changelog', authenticateAgent, (req, res) => {
    try {
        if (!fs.existsSync(VERSION_FILE)) {
            return res.json({ changelog: '' });
        }
        const versionData = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
        res.json({ changelog: versionData.changelog || '' });
    } catch (err) {
        res.json({ changelog: '' });
    }
});

const { authenticateToken, requireRole } = require('../middleware/auth');
const { pool } = require('../db/connection');
const { isValidIP } = require('../utils/validators');

// GET /api/agent/credentials — Ajan kimlik bilgilerinin meta verilerini listele (Operator/Admin)
// Asla key_hash veya secret döndürmez
router.get('/credentials', authenticateToken, requireRole('operator'), async (req, res) => {
    try {
        const { device_id } = req.query;
        let query = `
            SELECT c.key_id, c.device_id, d.hostname, d.ip_address, c.created_at, c.last_used_at, c.revoked_at, c.is_revoked
            FROM agent_credentials c
            LEFT JOIN devices d ON c.device_id = d.id
        `;
        const params = [];

        if (device_id !== undefined && device_id !== '') {
            const devId = parseInt(device_id, 10);
            if (isNaN(devId)) {
                return res.status(400).json({ error: 'device_id geçerli bir tamsayı olmalıdır.' });
            }
            query += ' WHERE c.device_id = $1';
            params.push(devId);
        }

        query += ' ORDER BY c.created_at DESC';

        const result = await pool.query(query, params);
        res.json(result.rows.map(row => ({
            key_id: row.key_id,
            device_id: row.device_id,
            hostname: row.hostname || null,
            ip_address: row.ip_address || null,
            created_at: row.created_at,
            last_used_at: row.last_used_at,
            revoked_at: row.revoked_at,
            is_revoked: Boolean(row.is_revoked)
        })));
    } catch (err) {
        console.error('Error fetching agent credentials metadata:', err);
        res.status(500).json({ error: 'Ajan kimlik listesi alınamadı.' });
    }
});

// POST /api/agent/enroll — Yeni cihaz ajanı için benzersiz kimlik bilgisi üret (Operator/Admin)
router.post('/enroll', authenticateToken, requireRole('operator'), async (req, res) => {
    try {
        const { device_id, device_ip, rotate = true } = req.body;
        if (!device_id && !device_ip) {
            return res.status(400).json({ error: 'device_id veya device_ip parametresi zorunludur.' });
        }

        let targetDeviceId = null;

        // 1. device_id doğrulaması
        if (device_id !== undefined && device_id !== null) {
            const parsedId = parseInt(device_id, 10);
            if (isNaN(parsedId) || parsedId <= 0 || String(parsedId) !== String(device_id).trim()) {
                return res.status(400).json({ error: 'device_id geçerli bir pozitif tamsayı olmalıdır.' });
            }
            targetDeviceId = parsedId;
        }

        // 2. device_ip doğrulaması
        if (device_ip !== undefined && device_ip !== null) {
            if (typeof device_ip !== 'string' || !isValidIP(device_ip.trim())) {
                return res.status(400).json({ error: 'device_ip geçerli bir IPv4 veya IPv6 adresi olmalıdır.' });
            }
        }

        // 3. Hedef cihazın varlığını ve tutarlılığını doğrula
        let targetDevice = null;
        if (targetDeviceId && device_ip) {
            const devRes = await pool.query(
                'SELECT id, hostname, ip_address FROM devices WHERE id = $1',
                [targetDeviceId]
            );
            if (devRes.rows.length === 0) {
                return res.status(404).json({ error: 'Belirtilen device_id ile eşleşen cihaz bulunamadı.' });
            }
            if (devRes.rows[0].ip_address.trim() !== device_ip.trim()) {
                return res.status(400).json({ 
                    error: 'Belirtilen device_id ve device_ip parametreleri aynı cihaza ait değil.' 
                });
            }
            targetDevice = devRes.rows[0];
        } else if (targetDeviceId) {
            const devRes = await pool.query(
                'SELECT id, hostname, ip_address FROM devices WHERE id = $1',
                [targetDeviceId]
            );
            if (devRes.rows.length === 0) {
                return res.status(404).json({ error: 'Belirtilen device_id ile eşleşen cihaz bulunamadı.' });
            }
            targetDevice = devRes.rows[0];
        } else {
            const devRes = await pool.query(
                'SELECT id, hostname, ip_address FROM devices WHERE ip_address = $1',
                [device_ip.trim()]
            );
            if (devRes.rows.length === 0) {
                return res.status(404).json({ error: 'Belirtilen IP adresi ile eşleşen cihaz bulunamadı.' });
            }
            targetDevice = devRes.rows[0];
            targetDeviceId = targetDevice.id;
        }

        // 4. Transactional duplicate active credentials & rotation support
        const client = await pool.connect();
        let keyId;
        let secret;
        let rotated = false;
        try {
            await client.query('BEGIN');

            const existingActive = await client.query(
                'SELECT id, key_id FROM agent_credentials WHERE device_id = $1 AND is_revoked = 0',
                [targetDeviceId]
            );

            if (existingActive.rows.length > 0) {
                if (rotate) {
                    await client.query(
                        'UPDATE agent_credentials SET is_revoked = 1, revoked_at = GETDATE() WHERE device_id = $1 AND is_revoked = 0',
                        [targetDeviceId]
                    );
                    rotated = true;
                } else {
                    await client.query('ROLLBACK');
                    return res.status(409).json({
                        error: 'Bu cihaza ait aktif bir ajan anahtarı zaten mevcut. Yenilemek için rotate: true gönderin.',
                        active_keys: existingActive.rows.map(r => r.key_id)
                    });
                }
            }

            // Benzersiz key_id ve secret üret
            keyId = `agk_${crypto.randomBytes(8).toString('hex')}`;
            secret = crypto.randomBytes(32).toString('hex');
            const keyHash = crypto.createHash('sha256').update(secret).digest('hex');

            // Veritabanına kaydet: Secret asla saklanmaz, yalnızca SHA-256 hash'i saklanır
            await client.query(
                `INSERT INTO agent_credentials (device_id, key_id, key_hash, is_revoked, created_at)
                 VALUES ($1, $2, $3, 0, GETDATE())`,
                [targetDeviceId, keyId, keyHash]
            );

            // Cihazın agent_installed durumunu güncelle
            await client.query('UPDATE devices SET agent_installed = 1, updated_at = GETDATE() WHERE id = $1', [targetDeviceId]);

            await client.query('COMMIT');
        } catch (txErr) {
            await client.query('ROLLBACK').catch(() => {});
            throw txErr;
        } finally {
            client.release();
        }

        // Denetim günlüğü (Audit Log)
        try {
            await pool.query(
                `INSERT INTO audit_logs (user_id, username, action, target_type, target_id, details, ip_address, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, GETDATE())`,
                [
                    req.user?.id || null,
                    req.user?.username || 'system',
                    'AGENT_ENROLLED',
                    'device',
                    String(targetDeviceId),
                    JSON.stringify({ key_id: keyId, rotated }),
                    req.ip || null
                ]
            );
        } catch (_) {
            // Tablo henüz mevcut değilse veya hata verirse akışı engelleme
            console.log(`[AUDIT] AGENT_ENROLLED by user=${req.user?.username} for device_id=${targetDeviceId}, key_id=${keyId}`);
        }

        const fullKey = `${keyId}.${secret}`;

        res.status(201).json({
            message: 'Ajan başarıyla kaydedildi.',
            device_id: targetDeviceId,
            key_id: keyId,
            agent_key: fullKey,
            note: 'Bu anahtarı ajanın .env dosyasında AGENT_API_KEY olarak yapılandırın. Gizli anahtar tekrar görüntülenemez.'
        });
    } catch (err) {
        console.error('Error enrolling agent:', err);
        res.status(500).json({ error: 'Ajan kaydı oluşturulamadı.' });
    }
});

// POST /api/agent/revoke/:keyId — Belirtilen ajan anahtarını iptal et (Admin)
router.post('/revoke/:keyId', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { keyId } = req.params;
        const result = await pool.query(
            `UPDATE agent_credentials 
             SET is_revoked = 1, revoked_at = GETDATE() 
             OUTPUT INSERTED.key_id, INSERTED.device_id
             WHERE key_id = $1`,
            [keyId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Ajan kimlik kaydı bulunamadı.' });
        }

        try {
            await pool.query(
                `INSERT INTO audit_logs (user_id, username, action, target_type, target_id, details, ip_address, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, GETDATE())`,
                [
                    req.user?.id || null,
                    req.user?.username || 'system',
                    'AGENT_KEY_REVOKED',
                    'agent_credential',
                    String(keyId),
                    JSON.stringify({ device_id: result.rows[0].device_id }),
                    req.ip || null
                ]
            );
        } catch (_) {
            console.log(`[AUDIT] AGENT_KEY_REVOKED by user=${req.user?.username} for key_id=${keyId}`);
        }

        res.json({ message: `Ajan anahtarı (${keyId}) başarıyla iptal edildi.`, credential: result.rows[0] });
    } catch (err) {
        console.error('Error revoking agent credential:', err);
        res.status(500).json({ error: 'Ajan anahtarı iptal edilemedi.' });
    }
});

module.exports = router;
