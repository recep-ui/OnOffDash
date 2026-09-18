const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { getLowTonerThreshold } = require('../utils/tonerConfig');
const { 
    ipToLong, 
    longToIp, 
    isIpv6, 
    parseCidr, 
    getSubnetForIp, 
    getDefaultSubnetPrefix 
} = require('../utils/ipamUtils');
const PrinterMonitorService = require('../services/printerMonitorService');

describe('Phase 5 — Configuration, SNMP & IPAM Suite', () => {
    describe('1. Low Toner Threshold Configuration', () => {
        const originalEnv = process.env.LOW_TONER_THRESHOLD_PERCENT;

        it('should default to 10% when LOW_TONER_THRESHOLD_PERCENT is not set', () => {
            delete process.env.LOW_TONER_THRESHOLD_PERCENT;
            assert.strictEqual(getLowTonerThreshold(), 10);
        });

        it('should respect valid LOW_TONER_THRESHOLD_PERCENT within 1-100', () => {
            process.env.LOW_TONER_THRESHOLD_PERCENT = '15';
            assert.strictEqual(getLowTonerThreshold(), 15);

            process.env.LOW_TONER_THRESHOLD_PERCENT = '1';
            assert.strictEqual(getLowTonerThreshold(), 1);

            process.env.LOW_TONER_THRESHOLD_PERCENT = '100';
            assert.strictEqual(getLowTonerThreshold(), 100);
        });

        it('should fall back to default 10% when value is out of range or malformed', () => {
            process.env.LOW_TONER_THRESHOLD_PERCENT = '0';
            assert.strictEqual(getLowTonerThreshold(), 10);

            process.env.LOW_TONER_THRESHOLD_PERCENT = '105';
            assert.strictEqual(getLowTonerThreshold(), 10);

            process.env.LOW_TONER_THRESHOLD_PERCENT = 'not-a-number';
            assert.strictEqual(getLowTonerThreshold(), 10);

            process.env.LOW_TONER_THRESHOLD_PERCENT = '-5';
            assert.strictEqual(getLowTonerThreshold(), 10);

            if (originalEnv !== undefined) {
                process.env.LOW_TONER_THRESHOLD_PERCENT = originalEnv;
            } else {
                delete process.env.LOW_TONER_THRESHOLD_PERCENT;
            }
        });
    });

    describe('2. CIDR-Aware IPAM Network Model', () => {
        it('should convert IPv4 to 32-bit integer and back accurately', () => {
            const ip = '192.168.1.100';
            const long = ipToLong(ip);
            assert.ok(typeof long === 'number');
            assert.strictEqual(longToIp(long), ip);

            assert.strictEqual(ipToLong('invalid.ip'), null);
            assert.strictEqual(ipToLong('256.1.1.1'), null);
        });

        it('should calculate usable hosts and network bounds for /24', () => {
            const cidr = parseCidr('192.168.1.0/24');
            assert.strictEqual(cidr.cidr, 24);
            assert.strictEqual(cidr.networkIp, '192.168.1.0');
            assert.strictEqual(cidr.broadcastIp, '192.168.1.255');
            assert.strictEqual(cidr.netmaskIp, '255.255.255.0');
            assert.strictEqual(cidr.totalHosts, 256);
            assert.strictEqual(cidr.usableHosts, 254);
            assert.strictEqual(cidr.firstUsableIp, '192.168.1.1');
            assert.strictEqual(cidr.lastUsableIp, '192.168.1.254');
        });

        it('should calculate usable hosts and network bounds for /23', () => {
            const cidr = parseCidr('10.0.80.0/23');
            assert.strictEqual(cidr.cidr, 23);
            assert.strictEqual(cidr.networkIp, '10.0.80.0');
            assert.strictEqual(cidr.broadcastIp, '10.0.81.255');
            assert.strictEqual(cidr.netmaskIp, '255.255.254.0');
            assert.strictEqual(cidr.totalHosts, 512);
            assert.strictEqual(cidr.usableHosts, 510);
            assert.strictEqual(cidr.firstUsableIp, '10.0.80.1');
            assert.strictEqual(cidr.lastUsableIp, '10.0.81.254');
        });

        it('should calculate usable hosts and network bounds for /22', () => {
            const cidr = parseCidr('172.16.0.0/22');
            assert.strictEqual(cidr.cidr, 22);
            assert.strictEqual(cidr.networkIp, '172.16.0.0');
            assert.strictEqual(cidr.broadcastIp, '172.16.3.255');
            assert.strictEqual(cidr.netmaskIp, '255.255.252.0');
            assert.strictEqual(cidr.totalHosts, 1024);
            assert.strictEqual(cidr.usableHosts, 1022);
        });

        it('should explicitly mark IPv6 as not supported yet', () => {
            const ipv6Check = parseCidr('2001:db8::/32');
            assert.strictEqual(ipv6Check.isIpv6, true);
            assert.strictEqual(ipv6Check.supported, false);
            assert.ok(ipv6Check.error.includes('not supported yet'));

            assert.strictEqual(isIpv6('2001:db8::1'), true);
            assert.strictEqual(isIpv6('192.168.1.1'), false);
        });

        it('should resolve default subnet prefix from configuration', () => {
            const original = process.env.DEFAULT_SUBNET_PREFIX;
            process.env.DEFAULT_SUBNET_PREFIX = '192.168.10';
            assert.strictEqual(getDefaultSubnetPrefix(), '192.168.10');

            delete process.env.DEFAULT_SUBNET_PREFIX;
            assert.strictEqual(getDefaultSubnetPrefix(), '10.0.80');

            if (original) process.env.DEFAULT_SUBNET_PREFIX = original;
        });
    });

    describe('3. Hardened Printer SNMP Configuration', () => {
        const originalNodeEnv = process.env.NODE_ENV;
        const originalCommunity = process.env.SNMP_COMMUNITY;

        it('should fail-closed in production if SNMP_COMMUNITY is missing and no per-printer community', () => {
            process.env.NODE_ENV = 'production';
            delete process.env.SNMP_COMMUNITY;

            const service = new PrinterMonitorService({});
            assert.throws(() => {
                service.createSnmpSession('192.168.1.200');
            }, /SNMP_COMMUNITY environment variable is mandatory in production/);

            process.env.NODE_ENV = originalNodeEnv;
            if (originalCommunity) process.env.SNMP_COMMUNITY = originalCommunity;
        });

        it('should use configured SNMP_COMMUNITY when provided', () => {
            process.env.SNMP_COMMUNITY = 'custom-corp-snmp-comm';
            const service = new PrinterMonitorService({});
            const session = service.createSnmpSession('127.0.0.1');
            assert.ok(session);
            if (typeof session.close === 'function') session.close();

            if (originalCommunity) {
                process.env.SNMP_COMMUNITY = originalCommunity;
            } else {
                delete process.env.SNMP_COMMUNITY;
            }
        });

        it('should allow per-printer custom community override', () => {
            const service = new PrinterMonitorService({});
            const session = service.createSnmpSession('127.0.0.1', { snmp_community: 'printer-unique-comm' });
            assert.ok(session);
            if (typeof session.close === 'function') session.close();
        });
    });
});
