const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_PRIVATE_KEY_PATH = path.join(__dirname, '..', 'keys', 'agent_update_private.pem');
const DEFAULT_PUBLIC_KEY_PATH = path.join(__dirname, '..', 'keys', 'agent_update_public.pem');

function getCanonicalManifestPayload(manifest) {
    const version = String(manifest.version || '');
    const sha256 = String(manifest.sha256 || '').toLowerCase();
    const size = String(manifest.size || '');
    return `${version}:${sha256}:${size}`;
}

function getPrivateKey() {
    if (process.env.AGENT_UPDATE_PRIVATE_KEY) {
        return process.env.AGENT_UPDATE_PRIVATE_KEY;
    }
    const keyPath = process.env.AGENT_UPDATE_PRIVATE_KEY_PATH || DEFAULT_PRIVATE_KEY_PATH;
    if (fs.existsSync(keyPath)) {
        return fs.readFileSync(keyPath, 'utf8');
    }
    return null;
}

function getPublicKey() {
    if (process.env.AGENT_UPDATE_PUBLIC_KEY) {
        return process.env.AGENT_UPDATE_PUBLIC_KEY;
    }
    const keyPath = process.env.AGENT_UPDATE_PUBLIC_KEY_PATH || DEFAULT_PUBLIC_KEY_PATH;
    if (fs.existsSync(keyPath)) {
        return fs.readFileSync(keyPath, 'utf8');
    }
    return null;
}

function signManifest(manifest, privateKey = null) {
    const key = privateKey || getPrivateKey();
    if (!key) return null;

    try {
        const payload = getCanonicalManifestPayload(manifest);
        const signer = crypto.createSign('SHA256');
        signer.update(payload);
        return signer.sign(key, 'base64');
    } catch (err) {
        console.error('Failed to sign agent manifest:', err.message);
        return null;
    }
}

function verifyManifest(manifest, signature, publicKey = null) {
    const key = publicKey || getPublicKey();
    if (!key || !signature) return false;

    try {
        const payload = getCanonicalManifestPayload(manifest);
        const verifier = crypto.createVerify('SHA256');
        verifier.update(payload);
        return verifier.verify(key, signature, 'base64');
    } catch (err) {
        console.error('Failed to verify agent manifest signature:', err.message);
        return false;
    }
}

module.exports = {
    getCanonicalManifestPayload,
    signManifest,
    verifyManifest,
    getPrivateKey,
    getPublicKey
};
