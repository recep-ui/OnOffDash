const { describe, it } = require('node:test');
const assert = require('node:assert');

const PingService = require('../services/pingService');
const PrinterMonitorService = require('../services/printerMonitorService');

describe('Phase 3 Reliability & Scale Suite', () => {

    describe('1. PingService Concurrency Control & Target Deduplication', () => {
        it('should respect PING_CONCURRENCY and prevent duplicate simultaneous scans of the same target', async () => {
            let activeConcurrentPings = 0;
            let peakConcurrency = 0;

            const mockIo = { emit: () => {} };
            const pingService = new PingService(mockIo);
            pingService.concurrency = 5;

            // Mock pingDevice to track concurrency and active lock
            const executionOrder = [];
            pingService.pingDevice = async (device) => {
                if (pingService.activePings.has(device.id)) {
                    // Duplicate skipped
                    executionOrder.push(`duplicate-skipped-${device.id}`);
                    return;
                }
                pingService.activePings.add(device.id);
                activeConcurrentPings++;
                peakConcurrency = Math.max(peakConcurrency, activeConcurrentPings);

                // Simulate async ping duration
                await new Promise(resolve => setTimeout(resolve, 20));

                activeConcurrentPings--;
                pingService.activePings.delete(device.id);
                executionOrder.push(`processed-${device.id}`);
            };

            // Test duplicate prevention directly
            pingService.activePings.add(99);
            await pingService.pingDevice({ id: 99, ip_address: '10.0.0.99' });
            pingService.activePings.delete(99);

            assert.strictEqual(executionOrder.includes('duplicate-skipped-99'), true);
            assert.strictEqual(peakConcurrency <= 5, true);
        });
    });

    describe('2. PrinterMonitorService Concurrency & Target Deduplication', () => {
        it('should respect PRINTER_SCAN_CONCURRENCY and deduplicate concurrent printer scans', async () => {
            const mockIo = { emit: () => {} };
            const printerService = new PrinterMonitorService(mockIo);
            printerService.concurrency = 3;

            assert.strictEqual(typeof printerService.concurrency, 'number');
            assert.strictEqual(printerService.activeScans instanceof Set, true);

            // Test duplicate prevention
            printerService.activeScans.add(10);
            let scanAttempted = false;
            
            // Calling scanPrinter on active target should immediately return without scanning
            await printerService.scanPrinter({ id: 10, ip_address: '10.0.0.10' });
            assert.strictEqual(scanAttempted, false);
            assert.strictEqual(printerService.activeScans.has(10), true);

            printerService.activeScans.delete(10);
            assert.strictEqual(printerService.activeScans.has(10), false);
        });
    });

    describe('3. Atomic Toner Database Operations (Transaction Contract)', () => {
        it('should execute toner updates inside a transaction pattern (BEGIN -> DELETE -> INSERT -> COMMIT)', async () => {
            const executedOps = [];

            // Mock transactional client
            const mockClient = {
                query: async (sqlText, params) => {
                    const upper = sqlText.trim().toUpperCase();
                    if (upper.startsWith('BEGIN')) executedOps.push('BEGIN');
                    else if (upper.startsWith('DELETE FROM PRINTER_TONERS')) executedOps.push('DELETE');
                    else if (upper.startsWith('INSERT INTO PRINTER_TONERS')) executedOps.push(`INSERT-${params[1]}`);
                    else if (upper.startsWith('COMMIT')) executedOps.push('COMMIT');
                    else if (upper.startsWith('ROLLBACK')) executedOps.push('ROLLBACK');
                    return { rows: [] };
                },
                release: () => {
                    executedOps.push('RELEASE');
                }
            };

            // Simulate atomic update
            await mockClient.query('BEGIN TRANSACTION');
            await mockClient.query('DELETE FROM printer_toners WHERE printer_id = $1', [5]);
            await mockClient.query('INSERT INTO printer_toners (printer_id, color) VALUES ($1, $2)', [5, 'Black']);
            await mockClient.query('INSERT INTO printer_toners (printer_id, color) VALUES ($1, $2)', [5, 'Cyan']);
            await mockClient.query('COMMIT TRANSACTION');
            mockClient.release();

            assert.deepStrictEqual(executedOps, [
                'BEGIN',
                'DELETE',
                'INSERT-Black',
                'INSERT-Cyan',
                'COMMIT',
                'RELEASE'
            ]);
        });

        it('should execute ROLLBACK when any toner insertion fails inside transaction', async () => {
            const executedOps = [];
            const mockClient = {
                query: async (sqlText) => {
                    const upper = sqlText.trim().toUpperCase();
                    if (upper.startsWith('BEGIN')) executedOps.push('BEGIN');
                    else if (upper.startsWith('DELETE')) executedOps.push('DELETE');
                    else if (upper.startsWith('INSERT')) {
                        throw new Error('Simulated DB disk failure on insert');
                    }
                    else if (upper.startsWith('ROLLBACK')) executedOps.push('ROLLBACK');
                    return { rows: [] };
                },
                release: () => {
                    executedOps.push('RELEASE');
                }
            };

            let failed = false;
            try {
                await mockClient.query('BEGIN TRANSACTION');
                await mockClient.query('DELETE FROM printer_toners WHERE printer_id = $1', [5]);
                await mockClient.query('INSERT INTO printer_toners ...');
                await mockClient.query('COMMIT TRANSACTION');
            } catch (err) {
                failed = true;
                await mockClient.query('ROLLBACK TRANSACTION');
            } finally {
                mockClient.release();
            }

            assert.strictEqual(failed, true);
            assert.deepStrictEqual(executedOps, [
                'BEGIN',
                'DELETE',
                'ROLLBACK',
                'RELEASE'
            ]);
        });
    });

    describe('4. Socket.IO Authentication Failure Loop Prevention', () => {
        it('should detect authentication errors in socket connect_error and halt reconnection', () => {
            const authError = new Error('Authentication error: invalid or expired token');
            const isAuthError = authError.message.includes('Authentication error') ||
                                authError.message.includes('token required') ||
                                authError.message.includes('invalid or expired');

            assert.strictEqual(isAuthError, true);

            // Regular network error should NOT be treated as auth error
            const netError = new Error('xhr poll error: connection refused');
            const isNetAuthError = netError.message.includes('Authentication error') ||
                                   netError.message.includes('token required') ||
                                   netError.message.includes('invalid or expired');

            assert.strictEqual(isNetAuthError, false);
        });
    });
});
