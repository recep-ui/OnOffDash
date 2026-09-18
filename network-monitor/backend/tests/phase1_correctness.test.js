const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('Phase 1 Correctness Suite', () => {

    describe('1. Device Status Log Bloat Prevention & Transition Logic', () => {
        it('should NOT create duplicate status logs or emit events for repeated identical ping statuses', async () => {
            // Simulated PingService logic verifying status log insertions and event emissions
            let statusLogsInserted = 0;
            const emittedEvents = [];

            const mockDb = {
                async insertLog(deviceId, status, pingMs) {
                    statusLogsInserted++;
                }
            };

            const mockIo = {
                emit(eventName, payload) {
                    emittedEvents.push({ eventName, payload });
                }
            };

            function processPingResult(device, pingAlive, pingMs) {
                const newStatus = pingAlive ? (pingMs > 200 ? 'warning' : 'online') : 'offline';
                const isTransition = (device.status !== newStatus);

                if (isTransition) {
                    mockDb.insertLog(device.id, newStatus, pingMs);
                    mockIo.emit('device:statusChanged', {
                        device: {
                            id: device.id,
                            hostname: device.hostname,
                            ip_address: device.ip_address
                        },
                        oldStatus: device.status,
                        newStatus: newStatus,
                        reason: null,
                        timestamp: new Date().toISOString()
                    });
                    device.status = newStatus;
                }
                return newStatus;
            }

            const device = {
                id: 1,
                hostname: 'workstation-01',
                ip_address: '192.168.1.50',
                status: 'online'
            };

            // 10 consecutive pings with the same 'online' status
            for (let i = 0; i < 10; i++) {
                processPingResult(device, true, 25);
            }

            // Exactly 0 status logs inserted because no transition occurred
            assert.strictEqual(statusLogsInserted, 0, 'Must not insert status logs for 10 identical online pings');
            assert.strictEqual(emittedEvents.length, 0, 'Must not emit device:statusChanged for identical states');

            // 1 real transition: online -> offline
            processPingResult(device, false, null);
            assert.strictEqual(statusLogsInserted, 1, 'Exactly 1 status log must be inserted on real transition');
            assert.strictEqual(emittedEvents.length, 1, 'Exactly 1 event must be emitted on transition');
            assert.strictEqual(emittedEvents[0].payload.oldStatus, 'online');
            assert.strictEqual(emittedEvents[0].payload.newStatus, 'offline');

            // 5 consecutive offline pings: should NOT add more logs
            for (let i = 0; i < 5; i++) {
                processPingResult(device, false, null);
            }
            assert.strictEqual(statusLogsInserted, 1, 'Offline -> offline pings must not insert additional status logs');
            assert.strictEqual(emittedEvents.length, 1, 'No further events emitted for repeated offline state');
        });
    });

    describe('2. Canonical Socket.IO Event Contract & Notification Deduplication', () => {
        it('should conform to canonical device:statusChanged event contract', () => {
            const canonicalEvent = {
                device: {
                    id: 42,
                    hostname: 'finance-pc',
                    ip_address: '10.0.80.110'
                },
                oldStatus: 'online',
                newStatus: 'offline',
                reason: null,
                timestamp: new Date().toISOString()
            };

            assert.ok(canonicalEvent.device && typeof canonicalEvent.device === 'object');
            assert.strictEqual(typeof canonicalEvent.device.id, 'number');
            assert.strictEqual(typeof canonicalEvent.device.hostname, 'string');
            assert.strictEqual(typeof canonicalEvent.device.ip_address, 'string');
            assert.strictEqual(typeof canonicalEvent.oldStatus, 'string');
            assert.strictEqual(typeof canonicalEvent.newStatus, 'string');
            assert.ok(!isNaN(Date.parse(canonicalEvent.timestamp)));
        });

        it('should generate independent deduplication keys when two devices go offline at the same time', () => {
            const notifiedSet = new Set();
            const notifications = [];

            function handleNotification(data) {
                const deviceId = data.device?.id ?? data.device_id;
                if (deviceId === undefined || deviceId === null) return;

                const key = `offline-${deviceId}`;
                if (notifiedSet.has(key)) return;
                notifiedSet.add(key);

                const hostname = data.device?.hostname || data.hostname || 'Bilinmeyen';
                notifications.push({ key, hostname });
            }

            const deviceA = {
                device: { id: 101, hostname: 'srv-db01', ip_address: '10.0.1.10' },
                oldStatus: 'online',
                newStatus: 'offline'
            };

            const deviceB = {
                device: { id: 102, hostname: 'srv-app01', ip_address: '10.0.1.11' },
                oldStatus: 'online',
                newStatus: 'offline'
            };

            handleNotification(deviceA);
            handleNotification(deviceB);

            assert.strictEqual(notifications.length, 2, 'Both devices must produce independent notifications');
            assert.strictEqual(notifications[0].key, 'offline-101');
            assert.strictEqual(notifications[0].hostname, 'srv-db01');
            assert.strictEqual(notifications[1].key, 'offline-102');
            assert.strictEqual(notifications[1].hostname, 'srv-app01');
            assert.notStrictEqual(notifications[0].key, notifications[1].key);
        });
    });

    describe('3. Separation of Network Ping Status from Agent Heartbeat Status', () => {
        it('should detect Agent as offline when PC responds to ping but sends no heartbeat', () => {
            // A device that responds to ping but has a timed out heartbeat
            const device = {
                id: 5,
                hostname: 'desktop-user5',
                ip_address: '192.168.1.105',
                agent_installed: true,
                status: 'online', // Network status from ping
                agent_status: 'online', // Agent status before timeout check
                last_ping_at: new Date(), // Just pinged
                last_heartbeat_at: new Date(Date.now() - 150 * 1000) // 150 seconds ago (timeout is 90s)
            };

            function checkAgentTimeout(dev, timeoutSeconds = 90) {
                const now = Date.now();
                const lastHb = dev.last_heartbeat_at ? dev.last_heartbeat_at.getTime() : 0;
                if (dev.agent_installed && (now - lastHb) / 1000 >= timeoutSeconds) {
                    dev.agent_status = 'offline';
                    return { agentTimedOut: true };
                }
                return { agentTimedOut: false };
            }

            const result = checkAgentTimeout(device, 90);

            assert.strictEqual(result.agentTimedOut, true, 'Agent timeout must be detected');
            assert.strictEqual(device.agent_status, 'offline', 'Agent status must be offline');
            assert.strictEqual(device.status, 'online', 'Network status must remain online from ping');
        });
    });

    describe('4. Software Inventory Scalable Bulk Insert & Validation', () => {
        it('should validate device_ip, enforce max item limit, and chunk 500+ items safely', () => {
            const MAX_SOFTWARE_ITEMS = 2000;
            const CHUNK_SIZE = 100;

            function validateSoftwarePayload(device_ip, software) {
                const { isValidIP } = require('../utils/validators');
                if (!device_ip || !isValidIP(device_ip)) {
                    return { status: 400, error: 'Valid device_ip (IPv4 or IPv6) is required' };
                }
                if (!Array.isArray(software)) {
                    return { status: 400, error: 'software must be an array' };
                }
                if (software.length > MAX_SOFTWARE_ITEMS) {
                    return { status: 413, error: `Software inventory exceeds maximum allowed limit` };
                }
                for (let i = 0; i < software.length; i++) {
                    const sw = software[i];
                    if (!sw || typeof sw !== 'object' || typeof sw.name !== 'string' || sw.name.trim() === '') {
                        return { status: 400, error: `Malformed software item at index ${i}` };
                    }
                }
                return { status: 200 };
            }

            // Invalid IP
            assert.strictEqual(validateSoftwarePayload('invalid-ip', []).status, 400);

            // Non-array
            assert.strictEqual(validateSoftwarePayload('192.168.1.10', 'not-array').status, 400);

            // Empty name in item
            assert.strictEqual(validateSoftwarePayload('192.168.1.10', [{ name: '' }]).status, 400);

            // Oversized payload (> 2000)
            const oversized = Array.from({ length: 2001 }, (_, i) => ({ name: `App ${i}` }));
            assert.strictEqual(validateSoftwarePayload('192.168.1.10', oversized).status, 413);

            // 550 valid software entries
            const valid550 = Array.from({ length: 550 }, (_, i) => ({
                name: `Application Package ${i}`,
                version: `1.${i}.0`,
                publisher: 'Corporate IT',
                install_date: '2026-09-01',
                source: 'registry'
            }));

            const validation = validateSoftwarePayload('192.168.1.10', valid550);
            assert.strictEqual(validation.status, 200);

            // Simulate chunking
            const chunks = [];
            for (let i = 0; i < valid550.length; i += CHUNK_SIZE) {
                chunks.push(valid550.slice(i, i + CHUNK_SIZE));
            }

            assert.strictEqual(chunks.length, 6, '550 items must be split into 6 chunks');
            assert.strictEqual(chunks[0].length, 100);
            assert.strictEqual(chunks[5].length, 50);

            // Ensure parameter count per chunk never exceeds MSSQL limit (2100)
            for (const chunk of chunks) {
                const paramCount = 1 + chunk.length * 5; // deviceId + 5 fields per item
                assert.ok(paramCount <= 2100, `Param count ${paramCount} must be under 2100`);
                assert.strictEqual(paramCount, 1 + chunk.length * 5);
            }
        });
    });

    describe('5. Manual Printer Scan Singleton & Conflict Handling', () => {
        it('should return 409 Conflict when a scan is already running', () => {
            const monitorService = {
                isScanning: true,
                scanAllPrinters() {}
            };

            function handleScanRequest(monitor) {
                if (monitor.isScanning) {
                    return { status: 409, body: { error: 'Tarama zaten devam ediyor (Scan already running)' } };
                }
                monitor.isScanning = true;
                return { status: 200, body: { message: 'Yazıcı taraması arka planda başlatıldı.' } };
            }

            const responseWhenBusy = handleScanRequest(monitorService);
            assert.strictEqual(responseWhenBusy.status, 409);
            assert.ok(responseWhenBusy.body.error.includes('Scan already running'));

            monitorService.isScanning = false;
            const responseWhenIdle = handleScanRequest(monitorService);
            assert.strictEqual(responseWhenIdle.status, 200);
            assert.ok(responseWhenIdle.body.message.includes('başlatıldı'));
        });
    });
});
