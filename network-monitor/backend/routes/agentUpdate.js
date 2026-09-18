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

// POST /api/agent/enroll — Yeni cihaz ajanı için benzersiz kimlik bilgisi üret (Operator/Admin)
router.post('/enroll', authenticateToken, requireRole('operator'), async (req, res) => {
    try {
        const { device_id, device_ip } = req.body;
        if (!device_id && !device_ip) {
            return res.status(400).json({ error: 'device_id veya device_ip parametresi zorunludur.' });
        }

        let targetDeviceId = device_id;
        if (!targetDeviceId && device_ip) {
            const devRes = await pool.query('SELECT id FROM devices WHERE ip_address = $1', [device_ip.trim()]);
            if (devRes.rows.length === 0) {
                return res.status(404).json({ error: 'Kayıt edilecek hedef cihaz bulunamadı.' });
            }
            targetDeviceId = devRes.rows[0].id;
        }

        // Benzersiz key_id ve secret üret
        const keyId = `agk_${crypto.randomBytes(8).toString('hex')}`;
        const secret = crypto.randomBytes(32).toString('hex');
        const keyHash = crypto.createHash('sha256').update(secret).digest('hex');

        // Veritabanına kaydet: Secret asla saklanmaz, yalnızca SHA-256 hash'i saklanır
        await pool.query(
            `INSERT INTO agent_credentials (device_id, key_id, key_hash, is_revoked, created_at)
             VALUES ($1, $2, $3, 0, GETDATE())`,
            [targetDeviceId, keyId, keyHash]
        );

        // Cihazın agent_installed durumunu güncelle
        await pool.query('UPDATE devices SET agent_installed = 1, updated_at = GETDATE() WHERE id = $1', [targetDeviceId]);

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

        res.json({ message: `Ajan anahtarı (${keyId}) başarıyla iptal edildi.`, credential: result.rows[0] });
    } catch (err) {
        console.error('Error revoking agent credential:', err);
        res.status(500).json({ error: 'Ajan anahtarı iptal edilemedi.' });
    }
});

module.exports = router;
