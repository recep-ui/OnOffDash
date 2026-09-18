/**
 * IPAM CIDR & Subnet Calculation Utilities
 * Supports arbitrary IPv4 CIDR blocks (/24, /23, /22, /16, etc.)
 * Explicitly flags IPv6 as "not supported yet".
 */

function ipToLong(ip) {
    if (!ip || typeof ip !== 'string') return null;
    const parts = ip.trim().split('.');
    if (parts.length !== 4) return null;
    let res = 0;
    for (let i = 0; i < 4; i++) {
        const n = parseInt(parts[i], 10);
        if (isNaN(n) || n < 0 || n > 255) return null;
        res = ((res << 8) | n) >>> 0;
    }
    return res;
}

function longToIp(long) {
    return [
        (long >>> 24) & 255,
        (long >>> 16) & 255,
        (long >>> 8) & 255,
        long & 255
    ].join('.');
}

function isIpv6(ip) {
    return typeof ip === 'string' && ip.includes(':');
}

/**
 * Calculates network parameters for a given IPv4 CIDR.
 * @param {string} cidrString e.g. "10.0.80.0/23" or "192.168.1.0/24"
 */
function parseCidr(cidrString) {
    if (!cidrString || typeof cidrString !== 'string') return null;

    if (isIpv6(cidrString)) {
        return {
            isIpv6: true,
            supported: false,
            error: 'IPv6 is not supported yet in IPAM calculation'
        };
    }

    const [ipPart, prefixPart] = cidrString.trim().split('/');
    const prefix = prefixPart !== undefined ? parseInt(prefixPart, 10) : 24;
    if (isNaN(prefix) || prefix < 0 || prefix > 32) return null;

    const ipLong = ipToLong(ipPart);
    if (ipLong === null) return null;

    const netmaskLong = prefix === 0 ? 0 : (((0xFFFFFFFF << (32 - prefix)) >>> 0));
    const networkLong = (ipLong & netmaskLong) >>> 0;
    const broadcastLong = (networkLong | (~netmaskLong >>> 0)) >>> 0;

    const totalHosts = prefix === 32 ? 1 : Math.pow(2, 32 - prefix);
    let usableHosts = 0;
    let firstUsableLong = networkLong;
    let lastUsableLong = broadcastLong;

    if (prefix <= 30) {
        usableHosts = totalHosts - 2;
        firstUsableLong = networkLong + 1;
        lastUsableLong = broadcastLong - 1;
    } else if (prefix === 31) {
        usableHosts = 2; // RFC 3021 point-to-point
    } else {
        usableHosts = 1; // /32 host
    }

    return {
        cidr: prefix,
        networkIp: longToIp(networkLong),
        broadcastIp: longToIp(broadcastLong),
        netmaskIp: longToIp(netmaskLong),
        totalHosts,
        usableHosts,
        firstUsableIp: longToIp(firstUsableLong),
        lastUsableIp: longToIp(lastUsableLong),
        networkLong,
        broadcastLong,
        firstUsableLong,
        lastUsableLong,
        subnet: `${longToIp(networkLong)}/${prefix}`
    };
}

/**
 * Derives the subnet string for an IPv4 address given a CIDR prefix length (default 24).
 */
function getSubnetForIp(ip, prefix = 24) {
    if (isIpv6(ip)) {
        return { isIpv6: true, supported: false, error: 'IPv6 is not supported yet in IPAM calculation' };
    }
    const long = ipToLong(ip);
    if (long === null) return null;
    const netmaskLong = prefix === 0 ? 0 : (((0xFFFFFFFF << (32 - prefix)) >>> 0));
    const networkLong = (long & netmaskLong) >>> 0;
    return `${longToIp(networkLong)}/${prefix}`;
}

function getDefaultSubnetPrefix() {
    return process.env.DEFAULT_SUBNET_PREFIX || '10.0.80';
}

module.exports = {
    ipToLong,
    longToIp,
    isIpv6,
    parseCidr,
    getSubnetForIp,
    getDefaultSubnetPrefix
};
