const crypto = require('crypto');
const { pool } = require('../db/connection');

/**
 * Validates agent API requests using either:
 * 1. Per-device hashed agent credentials (format: "agk_<keyId>.<secret>")
 * 2. Legacy AGENT_API_KEY with timing-safe comparison and deprecation warning.
 */
async function authenticateAgent(req, res, next) {
    const clientKey = req.headers['x-agent-key'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '');

    if (!clientKey || typeof clientKey !== 'string' || clientKey.trim().length === 0) {
        return res.status(401).json({ error: 'Ajan kimlik doğrulaması başarısız. X-Agent-Key başlığı eksik.' });
    }

    const trimmedKey = clientKey.trim();

    // 1. Per-device key format: agk_<keyId>.<secret>
    if (trimmedKey.startsWith('agk_')) {
        const delimiter = trimmedKey.includes('.') ? '.' : (trimmedKey.indexOf('_', 4) !== -1 ? '_' : null);
        if (!delimiter) {
            return res.status(401).json({ error: 'Geçersiz veya biçimi bozuk ajan erişim anahtarı.' });
        }

        const lastIdx = trimmedKey.lastIndexOf(delimiter);
        const keyId = trimmedKey.substring(0, lastIdx);
        const secret = trimmedKey.substring(lastIdx + 1);

        if (!secret || secret.trim().length === 0) {
            return res.status(401).json({ error: 'Geçersiz veya biçimi bozuk ajan erişim anahtarı.' });
        }

        try {
            const credResult = await pool.query(
                'SELECT id, device_id, key_id, key_hash, is_revoked FROM agent_credentials WHERE key_id = $1',
                [keyId]
            );

            if (!credResult.rows || credResult.rows.length === 0) {
                return res.status(401).json({ error: 'Ajan kimlik kaydı bulunamadı.' });
            }

            const cred = credResult.rows[0];

            if (cred.is_revoked) {
                return res.status(401).json({ error: 'Bu ajan erişim anahtarı iptal edilmiştir (revoked).' });
            }

            // codeql[js/insufficient-password-hash] High-entropy random 256-bit API token hash, not a human password
            const computedHash = crypto.createHash('sha256').update(secret).digest('hex');
            const computedBuffer = Buffer.from(computedHash);
            const storedBuffer = Buffer.from(cred.key_hash);

            if (computedBuffer.length === storedBuffer.length && crypto.timingSafeEqual(computedBuffer, storedBuffer)) {
                req.isAgent = true;
                req.authenticatedDeviceId = cred.device_id;
                req.agentKeyId = cred.key_id;

                // Async update last_used_at without blocking request
                pool.query('UPDATE agent_credentials SET last_used_at = GETDATE() WHERE id = $1', [cred.id]).catch(() => {});

                return next();
            }

            return res.status(401).json({ error: 'Geçersiz ajan kimlik doğrulama anahtarı.' });
        } catch (err) {
            return res.status(401).json({ error: 'Ajan kimlik doğrulama hatası.' });
        }
    }

    // 2. Fallback: Legacy shared AGENT_API_KEY (Disabled by default)
    if (process.env.ALLOW_LEGACY_AGENT_AUTH !== 'true') {
        return res.status(401).json({ 
            error: 'Paylaşımlı eski ajan erişim anahtarı devre dışı bırakılmıştır. Cihaza özel anahtar kullanınız.' 
        });
    }

    const serverKey = process.env.AGENT_API_KEY;

    if (!serverKey || serverKey.trim().length === 0) {
        console.error('⚠️ SECURITY MISCONFIGURATION: AGENT_API_KEY is not set on the server.');
        return res.status(500).json({ error: 'Ajan kimlik doğrulama anahtarı sunucuda yapılandırılmamış.' });
    }

    try {
        const clientBuffer = Buffer.from(trimmedKey);
        const serverBuffer = Buffer.from(String(serverKey));

        if (clientBuffer.length === serverBuffer.length && crypto.timingSafeEqual(clientBuffer, serverBuffer)) {
            req.isAgent = true;
            req.isLegacyAgent = true;
            if (typeof res.setHeader === 'function') {
                res.setHeader('X-Agent-Auth-Warning', 'Deprecated: shared AGENT_API_KEY is in use. Migrate to per-device credentials.');
            }
            return next();
        }

        return res.status(401).json({ error: 'Geçersiz ajan kimlik doğrulama anahtarı.' });
    } catch (err) {
        return res.status(401).json({ error: 'Ajan kimlik doğrulama hatası.' });
    }
}

module.exports = { authenticateAgent };
