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

module.exports = {
    isValidIPv4,
    isValidIPv6,
    isValidIP,
    isValidMAC,
    isValidHostname,
    isValidPort,
    sanitizePagination
};
