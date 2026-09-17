const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { 
    getCanonicalManifestPayload, 
    signManifest, 
    verifyManifest 
} = require('../utils/agentSigner');

describe('Agent Update Manifest & Integrity', () => {
    it('should calculate valid sha256 checksums for binary files', () => {
        const dummyContent = Buffer.from('OnOffDash Agent Test Binary Executable Content');
        const expectedHash = crypto.createHash('sha256').update(dummyContent).digest('hex');
        
        const computedHash = crypto.createHash('sha256').update(dummyContent).digest('hex');
        assert.strictEqual(computedHash, expectedHash);
        assert.strictEqual(computedHash.length, 64);
    });

    it('manifest file agent_version.json should contain required fields if present', () => {
        const manifestPath = path.join(__dirname, '..', 'agent_version.json');
        if (fs.existsSync(manifestPath)) {
            const content = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            assert.ok(content.version !== undefined, 'version should be defined');
            assert.ok(content.minVersion !== undefined, 'minVersion should be defined');
        }
    });

    it('canonical manifest payload format should match specification', () => {
        const manifest = {
            version: '2.1.0',
            sha256: 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855',
            size: 15420000
        };
        const payload = getCanonicalManifestPayload(manifest);
        assert.strictEqual(payload, '2.1.0:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855:15420000');
    });

    it('should sign manifest and verify with RSA key pair', () => {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });

        const manifest = {
            version: '2.1.0',
            sha256: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
            size: 1234567
        };

        const signature = signManifest(manifest, privateKey);
        assert.ok(signature, 'Signature should be generated');

        const isValid = verifyManifest(manifest, signature, publicKey);
        assert.strictEqual(isValid, true, 'Valid manifest signature should verify');

        // Tampered payload verification should fail
        const tamperedManifest = { ...manifest, size: 9999999 };
        const isTamperedValid = verifyManifest(tamperedManifest, signature, publicKey);
        assert.strictEqual(isTamperedValid, false, 'Tampered manifest should fail verification');
    });
});
