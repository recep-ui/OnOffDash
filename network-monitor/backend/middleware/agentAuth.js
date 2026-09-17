const crypto = require('crypto');

/**
 * Validates agent API requests using X-Agent-Key header and timing-safe comparison.
 */
function authenticateAgent(req, res, next) {
    const serverKey = process.env.AGENT_API_KEY;

    if (!serverKey || serverKey.trim().length === 0) {
        console.error('⚠️ SECURITY MISCONFIGURATION: AGENT_API_KEY is not set on the server.');
        return res.status(500).json({ error: 'Ajan kimlik doğrulama anahtarı sunucuda yapılandırılmamış.' });
    }

    const clientKey = req.headers['x-agent-key'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '');

    if (!clientKey) {
        return res.status(401).json({ error: 'Ajan kimlik doğrulaması başarısız. X-Agent-Key başlığı eksik.' });
    }

    try {
        const clientBuffer = Buffer.from(String(clientKey));
        const serverBuffer = Buffer.from(String(serverKey));

        // Use timing-safe comparison to prevent timing attacks
        if (clientBuffer.length !== serverBuffer.length || !crypto.timingSafeEqual(clientBuffer, serverBuffer)) {
            return res.status(401).json({ error: 'Geçersiz ajan kimlik doğrulama anahtarı.' });
        }

        req.isAgent = true;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Ajan kimlik doğrulama hatası.' });
    }
}

module.exports = { authenticateAgent };
