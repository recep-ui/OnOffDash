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

module.exports = router;
