const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('Backend Startup & Router Smoke Test Suite', () => {
    it('should successfully require server.js without module resolution errors', () => {
        const serverModule = require('../server');
        assert.ok(serverModule.app, 'server.js must export express app');
        assert.ok(serverModule.server, 'server.js must export http server');
        assert.equal(typeof serverModule.startServer, 'function', 'server.js must export startServer function');
    });

    it('should successfully require every registered route file without missing dependencies', () => {
        const routesDir = path.join(__dirname, '..', 'routes');
        const routeFiles = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));
        assert.ok(routeFiles.length >= 10, `Expected at least 10 router files, found ${routeFiles.length}`);

        for (const file of routeFiles) {
            const fullPath = path.join(routesDir, file);
            assert.doesNotThrow(() => {
                const router = require(fullPath);
                assert.ok(router, `Route module ${file} should export router`);
            }, `Router file ${file} failed to load (possible missing dependency or syntax error)`);
        }
    });

    it('should verify printer router specifically loads without xlsx package', () => {
        assert.doesNotThrow(() => {
            const printerRouter = require('../routes/printers');
            assert.ok(printerRouter);
        });
    });

    it('should verify Express app has all mandatory API prefixes mounted', () => {
        const { app } = require('../server');
        const mountedRoutes = [];
        
        if (app._router && app._router.stack) {
            for (const layer of app._router.stack) {
                if (layer.route) {
                    mountedRoutes.push(layer.route.path);
                } else if (layer.name === 'router' && layer.regexp) {
                    mountedRoutes.push(layer.regexp.toString());
                }
            }
        }

        const requiredPrefixes = [
            'auth',
            'devices',
            'heartbeat',
            'printers',
            'software',
            'agent',
            'ipam'
        ];

        for (const prefix of requiredPrefixes) {
            const matched = mountedRoutes.some(r => r.includes(prefix));
            assert.ok(matched, `Required router prefix "${prefix}" must be mounted on Express app`);
        }
    });
});
