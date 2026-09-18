const net = require('net');

const IPV4_REGEX = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
const MAC_REGEX = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
const HOSTNAME_REGEX = /^(?=.{1,253}$)(?!-)[A-Za-z0-9-_]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-_]{1,63}(?<!-))*$/;

function isValidIPv4(ip) {
    if (typeof ip !== 'string') return false;
    return IPV4_REGEX.test(ip.trim()) && net.isIPv4(ip.trim());
}

function isValidIPv6(ip) {
    if (typeof ip !== 'string') return false;
    return net.isIPv6(ip.trim());
}

function isValidIP(ip) {
    return isValidIPv4(ip) || isValidIPv6(ip);
}

function isValidMAC(mac) {
    if (typeof mac !== 'string') return false;
    return MAC_REGEX.test(mac.trim());
}

function isValidHostname(hostname) {
    if (typeof hostname !== 'string') return false;
    const trimmed = hostname.trim();
    return HOSTNAME_REGEX.test(trimmed);
}

function isValidPort(port) {
    const p = Number(port);
    return Number.isInteger(p) && p >= 1 && p <= 65535;
}

/**
 * Normalizes and bounds pagination parameters to prevent Denial of Service (DoS)
 * via unbounded limit queries.
 * @param {Object} query - Express req.query object
 * @param {number} defaultLimit - Default limit if missing or invalid (default: 50)
 * @param {number} maxLimit - Hard upper limit clamp (default: 500)
 * @returns {{page: number, limit: number, offset: number}}
 */
function sanitizePagination(query = {}, defaultLimit = 50, maxLimit = 500) {
    const rawPage = parseInt(query.page, 10);
    const rawLimit = parseInt(query.limit, 10);

    const page = (!isNaN(rawPage) && rawPage >= 1) ? rawPage : 1;
    let limit = (!isNaN(rawLimit) && rawLimit >= 1) ? rawLimit : defaultLimit;

    // Strict upper bounding
    if (limit > maxLimit) {
        limit = maxLimit;
    }

    const offset = (page - 1) * limit;

    return { page, limit, offset };
}

/**
 * Validates agent heartbeat incoming payload schema.
 * Rejects oversized, missing, or malformed metrics and identifiers before DB operations.
 */
function validateHeartbeatPayload(data) {
    if (!data || typeof data !== 'object') {
        return { valid: false, error: 'Request body must be a JSON object' };
    }

    const { hostname, ip_address, mac_address, os_name, username, cpu_usage, ram_usage, disk_usage, uptime_seconds } = data;

    if (!hostname || typeof hostname !== 'string' || hostname.trim().length === 0 || hostname.trim().length > 255 || !isValidHostname(hostname.trim())) {
        return { valid: false, error: 'Invalid or missing hostname (must be a valid RFC hostname up to 255 characters)' };
    }

    if (!ip_address || typeof ip_address !== 'string' || !isValidIP(ip_address.trim())) {
        return { valid: false, error: 'Invalid or missing ip_address (must be valid IPv4 or IPv6)' };
    }

    if (mac_address && (typeof mac_address !== 'string' || !isValidMAC(mac_address.trim()))) {
        return { valid: false, error: 'Invalid mac_address format' };
    }

    if (os_name !== undefined && os_name !== null) {
        if (typeof os_name !== 'string' || os_name.length > 100) {
            return { valid: false, error: 'os_name must be a string up to 100 characters' };
        }
    }

    if (username !== undefined && username !== null) {
        if (typeof username !== 'string' || username.length > 100) {
            return { valid: false, error: 'username must be a string up to 100 characters' };
        }
    }

    for (const [metric, val] of Object.entries({ cpu_usage, ram_usage, disk_usage })) {
        if (val !== undefined && val !== null && val !== '') {
            const num = Number(val);
            if (isNaN(num) || num < 0 || num > 100) {
                return { valid: false, error: `${metric} must be a numeric value between 0 and 100` };
            }
        }
    }

    if (uptime_seconds !== undefined && uptime_seconds !== null && uptime_seconds !== '') {
        const uptime = Number(uptime_seconds);
        if (!Number.isInteger(uptime) || uptime < 0) {
            return { valid: false, error: 'uptime_seconds must be a non-negative integer' };
        }
    }

    return { valid: true };
}

/**
 * Validates agent software inventory payload schema.
 */
function validateSoftwarePayload(device_ip, software, maxItems = 2000) {
    if (!device_ip || typeof device_ip !== 'string' || !isValidIP(device_ip.trim())) {
        return { valid: false, status: 400, error: 'Valid device_ip (IPv4 or IPv6) is required' };
    }

    if (!Array.isArray(software)) {
        return { valid: false, status: 400, error: 'software must be an array' };
    }

    if (software.length > maxItems) {
        return { valid: false, status: 413, error: `Software inventory exceeds maximum allowed limit of ${maxItems} items` };
    }

    for (let i = 0; i < software.length; i++) {
        const sw = software[i];
        if (!sw || typeof sw !== 'object' || typeof sw.name !== 'string' || sw.name.trim() === '') {
            return { valid: false, status: 400, error: `Malformed software item at index ${i}: name must be a non-empty string` };
        }
    }

    return { valid: true, status: 200 };
}

module.exports = {
    isValidIPv4,
    isValidIPv6,
    isValidIP,
    isValidMAC,
    isValidHostname,
    isValidPort,
    sanitizePagination,
    validateHeartbeatPayload,
    validateSoftwarePayload
};
