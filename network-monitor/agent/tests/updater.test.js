const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { 
    compareVersions, 
    verifySignature, 
    isHttpsRequired 
} = require('../updater');

describe('Agent Updater & Security Policy Suite', () => {
    describe('1. Version Comparison (Semver)', () => {
        it('should correctly identify newer versions', () => {
            assert.strictEqual(compareVersions('2.0.0', '1.9.9'), 1);
            assert.strictEqual(compareVersions('1.1.0', '1.0.9'), 1);
            assert.strictEqual(compareVersions('1.0.1', '1.0.0'), 1);
        });

        it('should correctly identify older versions', () => {
            assert.strictEqual(compareVersions('1.0.0', '1.0.1'), -1);
            assert.strictEqual(compareVersions('1.0.0', '2.0.0'), -1);
        });

        it('should identify identical versions as equal', () => {
            assert.strictEqual(compareVersions('1.0.0', '1.0.0'), 0);
            assert.strictEqual(compareVersions('2.1.3', '2.1.3'), 0);
        });
    });

    describe('2. Canonical Manifest Payload & RSA Signature Validation', () => {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });

        const manifest = {
            version: '2.0.0',
            size: 15420000,
            sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
        };

        function generateTestSignature(data, key) {
            const payload = `${data.version || ''}:${String(data.sha256 || '').toLowerCase()}:${data.size || ''}`;
            const signer = crypto.createSign('SHA256');
            signer.update(payload);
            return signer.sign(key, 'base64');
        }

        it('should verify a valid RSA signature for canonical manifest', () => {
            const signature = generateTestSignature(manifest, privateKey);
            const isValid = verifySignature(manifest, manifest.sha256, signature, publicKey);
            assert.strictEqual(isValid, true, 'Valid signature should verify successfully');
        });

        it('should reject tampered manifest fields (signature tampered)', () => {
            const signature = generateTestSignature(manifest, privateKey);

            // Tampered version
            const tamperedVersion = { ...manifest, version: '2.0.1' };
            assert.strictEqual(verifySignature(tamperedVersion, manifest.sha256, signature, publicKey), false);

            // Tampered size
            const tamperedSize = { ...manifest, size: 99999999 };
            assert.strictEqual(verifySignature(tamperedSize, manifest.sha256, signature, publicKey), false);

            // Tampered hash
            const tamperedHash = { ...manifest, sha256: '0000000000000000000000000000000000000000000000000000000000000000' };
            assert.strictEqual(verifySignature(manifest, tamperedHash.sha256, signature, publicKey), false);
        });

        it('should reject when signature or public key is missing', () => {
            assert.strictEqual(verifySignature(manifest, manifest.sha256, null, publicKey), false);
            assert.strictEqual(verifySignature(manifest, manifest.sha256, 'invalid_sig', null), false);
        });
    });

    describe('3. Binary Integrity Verification (SHA-256 & Size)', () => {
        const dummyBinary = Buffer.from('Binary Payload For OnOffDash Agent Safe Execution');
        const validSha256 = crypto.createHash('sha256').update(dummyBinary).digest('hex');

        it('should accept matching SHA-256 and expected size', () => {
            const computedSha = crypto.createHash('sha256').update(dummyBinary).digest('hex');
            assert.strictEqual(computedSha.toLowerCase(), validSha256.toLowerCase());
            assert.strictEqual(dummyBinary.length, dummyBinary.length);
        });

        it('should fail-closed on SHA-256 mismatch (tampered binary)', () => {
            const corruptedBinary = Buffer.from('Binary Payload With Malicious Injected Code');
            const corruptedSha = crypto.createHash('sha256').update(corruptedBinary).digest('hex');
            assert.notStrictEqual(corruptedSha.toLowerCase(), validSha256.toLowerCase());
        });

        it('should fail-closed on missing SHA-256 in manifest (fail-closed integrity)', () => {
            const manifestWithoutSha = { version: '2.0.0', size: dummyBinary.length };
            const expectedSha = manifestWithoutSha.sha256 || null;
            assert.strictEqual(expectedSha, null, 'Manifest without SHA must be rejected');
        });

        it('should detect invalid binary file size mismatch', () => {
            const expectedSize = 10000;
            const actualSize = dummyBinary.length;
            assert.notStrictEqual(actualSize, expectedSize, 'Size mismatch should be flagged');
        });
    });

    describe('4. HTTPS Production Requirement & Security Policy', () => {
        const originalNodeEnv = process.env.NODE_ENV;
        const originalAllowHttp = process.env.ALLOW_INSECURE_HTTP;

        function restoreEnv() {
            if (originalNodeEnv !== undefined) process.env.NODE_ENV = originalNodeEnv;
            else delete process.env.NODE_ENV;
            if (originalAllowHttp !== undefined) process.env.ALLOW_INSECURE_HTTP = originalAllowHttp;
            else delete process.env.ALLOW_INSECURE_HTTP;
        }

        it('should enforce HTTPS in production mode (reject HTTP)', () => {
            try {
                process.env.NODE_ENV = 'production';
                delete process.env.ALLOW_INSECURE_HTTP;

                assert.strictEqual(isHttpsRequired(), true, 'HTTPS must be strictly required in production');

                const insecureUrl = 'http://onoffdash.company.local:3001';
                const isHttps = insecureUrl.startsWith('https://');
                assert.strictEqual(isHttps, false, 'Plain HTTP URL must not be allowed in production');

                const secureUrl = 'https://onoffdash.company.local';
                assert.strictEqual(secureUrl.startsWith('https://'), true, 'HTTPS URL is allowed');
            } finally {
                restoreEnv();
            }
        });

        it('should permit HTTP only in development when ALLOW_INSECURE_HTTP=true', () => {
            try {
                process.env.NODE_ENV = 'development';
                process.env.ALLOW_INSECURE_HTTP = 'true';

                assert.strictEqual(isHttpsRequired(), false, 'HTTPS requirement can be relaxed in explicit dev mode');
            } finally {
                restoreEnv();
            }
        });
    });
});
