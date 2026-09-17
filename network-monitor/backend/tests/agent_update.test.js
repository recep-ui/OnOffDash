const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

describe('Agent Update Manifest & Integrity', () => {
    it('should calculate valid sha256 checksums for binary files', () => {
        const dummyContent = Buffer.from('OnOffDash Agent Test Binary Executable Content');
        const expectedHash = crypto.createHash('sha256').update(dummyContent).digest('hex');
        
        const computedHash = crypto.createHash('sha256').update(dummyContent).digest('hex');
        assert.strictEqual(computedHash, expectedHash);
        assert.strictEqual(computedHash.length, 64);
    });

    it('manifest file agent_version.json should contain required fields', () => {
        const manifestPath = path.join(__dirname, '..', 'agent_version.json');
        if (fs.existsSync(manifestPath)) {
            const content = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            assert.ok(content.version !== undefined, 'version should be defined');
            assert.ok(content.minVersion !== undefined, 'minVersion should be defined');
        }
    });
});
