const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const CleanupService = require('../services/cleanupService');

describe('CleanupService Data Retention & Safety', () => {
    it('should initialize with default 30 days retention when env is empty', () => {
        const originalEnv = process.env.RETENTION_DAYS;
        delete process.env.RETENTION_DAYS;
        try {
            const service = new CleanupService();
            assert.strictEqual(service.retentionDays, 30);
        } finally {
            if (originalEnv) process.env.RETENTION_DAYS = originalEnv;
        }
    });

    it('should respect custom RETENTION_DAYS environment variable', () => {
        const originalEnv = process.env.RETENTION_DAYS;
        process.env.RETENTION_DAYS = '60';
        try {
            const service = new CleanupService();
            assert.strictEqual(service.retentionDays, 60);
        } finally {
            if (originalEnv) process.env.RETENTION_DAYS = originalEnv;
            else delete process.env.RETENTION_DAYS;
        }
    });

    it('should execute cleanup without unhandled rejections when db returns mock counts', async () => {
        const service = new CleanupService();
        // Mock the clean methods to verify orchestration
        service.cleanDeviceStatusLogs = async () => 10;
        service.cleanHeartbeats = async () => 20;
        service.cleanPrinterJamLogs = async () => 5;

        let errorLogged = false;
        const originalError = console.error;
        console.error = () => { errorLogged = true; };

        try {
            await service.runCleanup();
            assert.strictEqual(errorLogged, false, 'No error should be logged during clean run');
        } finally {
            console.error = originalError;
        }
    });

    it('should handle partial failures in cleanup gracefully (settled promises)', async () => {
        const service = new CleanupService();
        service.cleanDeviceStatusLogs = async () => { throw new Error('DB timeout'); };
        service.cleanHeartbeats = async () => 15;
        service.cleanPrinterJamLogs = async () => 2;

        // runCleanup uses Promise.allSettled so one failure does not abort others
        await service.runCleanup();
    });
});
