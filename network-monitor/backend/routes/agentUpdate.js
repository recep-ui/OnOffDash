const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const VERSION_FILE = path.join(__dirname, '..', 'agent_version.json');
const AGENT_DIR = path.join(__dirname, '..', 'agent_binaries');

// GET /api/agent/version — Güncel agent versiyon bilgisi
router.get('/version', (req, res) => {
    try {
        if (!fs.existsSync(VERSION_FILE)) {
            return res.json({ version: '1.0.0', minVersion: '1.0.0' });
        }
        const versionData = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
        res.json(versionData);
    } catch (err) {
        console.error('Error reading version file:', err);
        res.json({ version: '1.0.0', minVersion: '1.0.0' });
    }
});

// GET /api/agent/download — Güncel agent exe dosyasını indir
router.get('/download', (req, res) => {
    try {
        // Önce agent_binaries klasöründe ara
        if (fs.existsSync(AGENT_DIR)) {
            const files = fs.readdirSync(AGENT_DIR).filter(f => f.endsWith('.exe'));
            if (files.length > 0) {
                const filePath = path.join(AGENT_DIR, files[0]);
                return res.download(filePath, 'OnOffDash_Agent.exe');
            }
        }

        res.status(404).json({ error: 'Agent binary not found. Upload agent exe to backend/agent_binaries/ directory.' });
    } catch (err) {
        console.error('Error downloading agent:', err);
        res.status(500).json({ error: 'Failed to download agent' });
    }
});

// GET /api/agent/changelog — Değişiklik notları (opsiyonel)
router.get('/changelog', (req, res) => {
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
