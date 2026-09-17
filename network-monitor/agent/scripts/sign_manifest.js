#!/usr/bin/env node

/**
 * Release-Time Agent Manifest Signing Utility
 * Used exclusively in CI/Release environments to sign the agent manifest.
 * Private key MUST NOT be included in runtime containers or committed to git.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function getCanonicalPayload(version, sha256, size) {
    return `${String(version).trim()}:${String(sha256).trim().toLowerCase()}:${String(size).trim()}`;
}

function signManifest(options = {}) {
    const binaryPath = options.binaryPath || process.env.AGENT_BINARY_PATH;
    const version = options.version || process.env.AGENT_VERSION || '1.0.0';
    const minVersion = options.minVersion || process.env.AGENT_MIN_VERSION || '1.0.0';
    const changelog = options.changelog || process.env.AGENT_CHANGELOG || 'Production Release';
    const outputPath = options.outputPath || path.join(__dirname, '..', '..', 'backend', 'agent_version.json');
    
    let privateKey = options.privateKey || process.env.AGENT_SIGNING_PRIVATE_KEY;
    if (!privateKey && options.keyPath && fs.existsSync(options.keyPath)) {
        privateKey = fs.readFileSync(options.keyPath, 'utf8');
    }

    if (!privateKey) {
        console.error('❌ Error: AGENT_SIGNING_PRIVATE_KEY or valid --keyPath is required for release-time signing.');
        process.exit(1);
    }

    let size = 0;
    let sha256 = '';

    if (binaryPath && fs.existsSync(binaryPath)) {
        const fileBuffer = fs.readFileSync(binaryPath);
        size = fileBuffer.length;
        sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex').toLowerCase();
        console.log(`📦 Analyzed binary: ${path.basename(binaryPath)} (${size} bytes, sha256: ${sha256})`);
    } else if (options.sha256 && options.size) {
        size = options.size;
        sha256 = String(options.sha256).toLowerCase();
    } else {
        console.error('❌ Error: Target binary path or explicit sha256 & size must be provided.');
        process.exit(1);
    }

    const payload = getCanonicalPayload(version, sha256, size);
    console.log(`🔐 Signing canonical payload: "${payload}"`);

    const signer = crypto.createSign('SHA256');
    signer.update(payload);
    const signature = signer.sign(privateKey, 'base64');

    const manifestData = {
        version,
        minVersion,
        releaseDate: new Date().toISOString().split('T')[0],
        size,
        sha256,
        signature,
        changelog
    };

    fs.writeFileSync(outputPath, JSON.stringify(manifestData, null, 2), 'utf8');
    console.log(`✅ Signed manifest successfully written to: ${outputPath}`);
    return manifestData;
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const opts = {};
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--binary' && args[i + 1]) opts.binaryPath = args[++i];
        if (args[i] === '--version' && args[i + 1]) opts.version = args[++i];
        if (args[i] === '--key' && args[i + 1]) opts.keyPath = args[++i];
        if (args[i] === '--out' && args[i + 1]) opts.outputPath = args[++i];
    }
    signManifest(opts);
}

module.exports = { signManifest, getCanonicalPayload };
