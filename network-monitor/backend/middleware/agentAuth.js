const crypto = require('crypto');
const { pool } = require('../db/connection');

/**
 * Validates unique per-device cryptographic token in format "agk_<keyId>.<tokenProof>".
 * Token proofs are random 256-bit entropy values verified against SHA-256 digests.
 */
async function verifyPerDeviceToken(tokenString, req, res, next) {
    const delimiter = tokenString.includes('.') ? '.' : (tokenString.indexOf('_', 4) !== -1 ? '_' : null);
    if (!delimiter) {
        return res.status(401).json({ error: 'Geçersiz veya biçimi bozuk ajan erişim anahtarı.' });
    }

    const lastIdx = tokenString.lastIndexOf(delimiter);
    const keyId = tokenString.substring(0, lastIdx);
    const tokenProof = tokenString.substring(lastIdx + 1);

    if (!tokenProof || tokenProof.trim().length === 0) {
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

        // Compute SHA-256 digest of the random 256-bit token proof
        const computedDigest = crypto.createHash('sha256').update(tokenProof).digest('hex');
        const computedBuffer = Buffer.from(computedDigest);
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
    } catch (_err) {
        return res.status(401).json({ error: 'Ajan kimlik doğrulama hatası.' });
    }
}

/**
 * Validates legacy shared agent API key (disabled by default in production).
 */
function verifyLegacySharedKey(clientKey, req, res, next) {
    if (process.env.ALLOW_LEGACY_AGENT_AUTH !== 'true') {
        return res.status(401).json({ 
            error: 'Paylaşımlı eski ajan erişim anahtarı devre dışı bırakılmıştır. Cihaza özel anahtar kullanınız.' 
        });
    }

    const serverSharedKey = process.env.AGENT_API_KEY;
    if (!serverSharedKey || serverSharedKey.trim().length === 0) {
        console.error('⚠️ SECURITY MISCONFIGURATION: AGENT_API_KEY is not set on the server.');
        return res.status(500).json({ error: 'Ajan kimlik doğrulama anahtarı sunucuda yapılandırılmamış.' });
    }

    try {
        const clientBuffer = Buffer.from(clientKey);
        const serverBuffer = Buffer.from(String(serverSharedKey));

        if (clientBuffer.length === serverBuffer.length && crypto.timingSafeEqual(clientBuffer, serverBuffer)) {
            req.isAgent = true;
            req.isLegacyAgent = true;
            if (typeof res.setHeader === 'function') {
                res.setHeader('X-Agent-Auth-Warning', 'Deprecated: shared AGENT_API_KEY is in use. Migrate to per-device credentials.');
            }
            return next();
        }

        return res.status(401).json({ error: 'Geçersiz ajan kimlik doğrulama anahtarı.' });
    } catch (_err) {
        return res.status(401).json({ error: 'Ajan kimlik doğrulama hatası.' });
    }
}

/**
 * Entry-point agent authentication router.
 */
async function authenticateAgent(req, res, next) {
    const headerVal = req.headers['x-agent-key'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '');

    if (!headerVal || typeof headerVal !== 'string' || headerVal.trim().length === 0) {
        return res.status(401).json({ error: 'Ajan kimlik doğrulaması başarısız. X-Agent-Key başlığı eksik.' });
    }

    const normalizedKey = headerVal.trim();

    // Route per-device credentials separately from legacy shared key
    if (normalizedKey.startsWith('agk_')) {
        return verifyPerDeviceToken(normalizedKey, req, res, next);
    }

    return verifyLegacySharedKey(normalizedKey, req, res, next);
}

module.exports = { authenticateAgent };
