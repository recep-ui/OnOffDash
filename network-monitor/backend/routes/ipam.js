const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');
const { 
    ipToLong, 
    longToIp, 
    isIpv6, 
    parseCidr, 
    getDefaultSubnetPrefix 
} = require('../utils/ipamUtils');

// Helper to parse IP into Subnet, Prefix and numeric Long (CIDR-aware IPv4 calculation)
function parseIp(ip, customPrefix = 24) {
    if (!ip || typeof ip !== 'string') return null;
    const clean = ip.trim();
    if (clean.startsWith('sanal-')) return null;

    // IPv6 limitation explicit handling
    if (isIpv6(clean)) {
        return {
            isIpv6: true,
            supported: false,
            error: 'IPv6 is not supported yet in IPAM calculation'
        };
    }

    const long = ipToLong(clean);
    if (long === null) return null;

    const cidrInfo = parseCidr(`${clean}/${customPrefix}`);
    if (!cidrInfo) return null;

    return {
        subnet: cidrInfo.subnet,
        cidrInfo,
        long,
        clean
    };
}

// GET /api/ipam/summary - Alt ağ doluluk oranları ve IP listesi (CIDR-aware)
router.get('/summary', async (req, res) => {
    try {
        const prefixParam = req.query.prefix ? parseInt(req.query.prefix, 10) : 24;
        const groupingPrefix = (!isNaN(prefixParam) && prefixParam >= 1 && prefixParam <= 32) ? prefixParam : 24;

        const devicesRes = await pool.query("SELECT id, hostname, ip_address, mac_address, department, status FROM devices");
        const printersRes = await pool.query("SELECT id, name, ip_address, department, is_online FROM printers");

        const subnetsMap = {};

        // Cihazları işle
        devicesRes.rows.forEach(d => {
            const parsed = parseIp(d.ip_address, groupingPrefix);
            if (parsed && !parsed.isIpv6) {
                if (!subnetsMap[parsed.subnet]) {
                    subnetsMap[parsed.subnet] = {
                        subnet: parsed.subnet,
                        cidrInfo: parsed.cidrInfo,
                        occupiedCount: 0,
                        occupiedLongs: new Set(),
                        devices: []
                    };
                }
                subnetsMap[parsed.subnet].occupiedCount++;
                subnetsMap[parsed.subnet].occupiedLongs.add(parsed.long);
                subnetsMap[parsed.subnet].devices.push({
                    ip: d.ip_address.trim(),
                    long: parsed.long,
                    name: d.hostname,
                    type: 'device',
                    status: d.status,
                    mac: d.mac_address || '-',
                    department: d.department || 'Genel'
                });
            }
        });

        // Yazıcıları işle
        printersRes.rows.forEach(p => {
            const parsed = parseIp(p.ip_address, groupingPrefix);
            if (parsed && !parsed.isIpv6) {
                if (!subnetsMap[parsed.subnet]) {
                    subnetsMap[parsed.subnet] = {
                        subnet: parsed.subnet,
                        cidrInfo: parsed.cidrInfo,
                        occupiedCount: 0,
                        occupiedLongs: new Set(),
                        devices: []
                    };
                }
                subnetsMap[parsed.subnet].occupiedCount++;
                subnetsMap[parsed.subnet].occupiedLongs.add(parsed.long);
                subnetsMap[parsed.subnet].devices.push({
                    ip: p.ip_address.trim(),
                    long: parsed.long,
                    name: p.name,
                    type: 'printer',
                    status: p.is_online ? 'online' : 'offline',
                    mac: '-',
                    department: p.department || 'Genel'
                });
            }
        });

        // Doluluk oranlarını ve sayısal IP aralığından boş IP'leri hesapla
        const subnetsList = Object.values(subnetsMap).map(subnet => {
            const usableCapacity = subnet.cidrInfo?.usableHosts || 254;
            const availableIps = [];

            if (subnet.cidrInfo) {
                for (let l = subnet.cidrInfo.firstUsableLong; l <= subnet.cidrInfo.lastUsableLong; l++) {
                    if (!subnet.occupiedLongs.has(l)) {
                        availableIps.push(longToIp(l));
                        if (availableIps.length >= 50) break; // İlk 50 kullanılabilir IP
                    }
                }
            }

            const occupancyRate = usableCapacity > 0 
                ? parseFloat(((subnet.occupiedCount / usableCapacity) * 100).toFixed(1))
                : 100.0;

            return {
                subnet: subnet.subnet,
                occupiedCount: subnet.occupiedCount,
                usableCapacity,
                occupancyRate,
                availableCount: Math.max(0, usableCapacity - subnet.occupiedCount),
                availableIps,
                devices: subnet.devices.sort((a, b) => a.long - b.long),
                ipv6_supported: false
            };
        });

        res.json(subnetsList.sort((a, b) => a.subnet.localeCompare(b.subnet)));
    } catch (err) {
        console.error('Error fetching IPAM summary:', err);
        res.status(500).json({ error: 'IPAM verileri alınırken bir hata oluştu.' });
    }
});

// GET /api/ipam/conflicts - Ağdaki IP ve MAC çakışmalarını tara
router.get('/conflicts', async (req, res) => {
    try {
        const devicesRes = await pool.query("SELECT id, hostname, ip_address, mac_address, department, status FROM devices");
        const printersRes = await pool.query("SELECT id, name, ip_address, department, is_online FROM printers");

        const allIps = [];

        devicesRes.rows.forEach(d => {
            const parsed = parseIp(d.ip_address);
            if (parsed && !parsed.isIpv6) {
                allIps.push({
                    ip: d.ip_address.trim(),
                    type: 'Cihaz',
                    name: d.hostname,
                    mac: d.mac_address || '-',
                    department: d.department || 'Genel',
                    status: d.status
                });
            }
        });

        printersRes.rows.forEach(p => {
            const parsed = parseIp(p.ip_address);
            if (parsed && !parsed.isIpv6) {
                allIps.push({
                    ip: p.ip_address.trim(),
                    type: 'Yazıcı',
                    name: p.name,
                    mac: '-',
                    department: p.department || 'Genel',
                    status: p.is_online ? 'online' : 'offline'
                });
            }
        });

        // 1. IP Çakışmaları (Aynı IP'ye sahip birden fazla cihaz veya yazıcı)
        const ipConflicts = [];
        const ipGroups = {};
        allIps.forEach(item => {
            if (!ipGroups[item.ip]) {
                ipGroups[item.ip] = [];
            }
            ipGroups[item.ip].push(item);
        });
        Object.keys(ipGroups).forEach(ip => {
            if (ipGroups[ip].length > 1) {
                ipConflicts.push({
                    ip,
                    conflictCount: ipGroups[ip].length,
                    details: ipGroups[ip]
                });
            }
        });

        // 2. MAC Adresi Çakışmaları
        const macConflicts = [];
        const macGroups = {};
        devicesRes.rows.forEach(d => {
            const mac = d.mac_address ? d.mac_address.trim().toLowerCase() : '';
            if (mac && mac !== '00:00:00:00:00:00' && mac !== '-' && mac !== 'none') {
                if (!macGroups[mac]) {
                    macGroups[mac] = [];
                }
                macGroups[mac].push({
                    id: d.id,
                    hostname: d.hostname,
                    ip: d.ip_address,
                    mac: d.mac_address,
                    status: d.status
                });
            }
        });
        Object.keys(macGroups).forEach(mac => {
            if (macGroups[mac].length > 1) {
                macConflicts.push({
                    mac: mac.toUpperCase(),
                    devices: macGroups[mac]
                });
            }
        });

        res.json({
            ipConflicts,
            macConflicts
        });
    } catch (err) {
        console.error('Error scanning IPAM conflicts:', err);
        res.status(500).json({ error: 'Çakışmalar taranırken bir hata oluştu.' });
    }
});

// GET /api/ipam/suggest - Alt ağ için ilk kullanılabilir boş IP'yi öner (Arbitrary IPv4 CIDR aware)
router.get('/suggest', async (req, res) => {
    try {
        const { subnet } = req.query;

        if (subnet) {
            const trimmed = String(subnet).trim();
            if (isIpv6(trimmed)) {
                return res.status(400).json({ 
                    error: 'IPv6 is not supported yet in IPAM calculation', 
                    isIpv6: true, 
                    supported: false 
                });
            }
        }

        // Tüm aktif IP'leri çek ve sayısal long değerlerini Set'e kaydet
        const devRes = await pool.query("SELECT ip_address FROM devices");
        const priRes = await pool.query("SELECT ip_address FROM printers");
        
        const occupiedLongs = new Set();
        const allIps = [];
        [...devRes.rows, ...priRes.rows].forEach(r => {
            if (r.ip_address) {
                const clean = r.ip_address.trim();
                allIps.push(clean);
                const l = ipToLong(clean);
                if (l !== null) occupiedLongs.add(l);
            }
        });

        let cidrInfo = null;

        if (subnet) {
            const rawSubnet = String(subnet).trim();
            const normalizedCidr = rawSubnet.includes('/') ? rawSubnet : `${rawSubnet}/24`;
            cidrInfo = parseCidr(normalizedCidr);
            if (!cidrInfo || cidrInfo.error) {
                return res.status(400).json({ 
                    error: cidrInfo?.error || 'Geçersiz CIDR veya alt ağ formatı.' 
                });
            }
        } else {
            // Subnet belirtilmemişse en popüler /24 bloğunu bul veya varsayılanı kullan
            const prefixes = {};
            allIps.forEach(ip => {
                const parts = ip.split('.');
                if (parts.length === 4 && !ip.startsWith('sanal-')) {
                    const pref = `${parts[0]}.${parts[1]}.${parts[2]}`;
                    prefixes[pref] = (prefixes[pref] || 0) + 1;
                }
            });
            const sorted = Object.keys(prefixes).sort((a, b) => prefixes[b] - prefixes[a]);
            const targetPrefix = sorted[0] || getDefaultSubnetPrefix();
            cidrInfo = parseCidr(`${targetPrefix}.0/24`);
        }

        let suggestedIp = null;
        for (let l = cidrInfo.firstUsableLong; l <= cidrInfo.lastUsableLong; l++) {
            if (!occupiedLongs.has(l)) {
                suggestedIp = longToIp(l);
                break;
            }
        }

        if (!suggestedIp) {
            return res.status(409).json({
                error: 'Belirtilen CIDR alt ağında boş IP adresi kalmadı.',
                subnet: cidrInfo.subnet,
                usableCapacity: cidrInfo.usableHosts
            });
        }

        res.json({ 
            suggestedIp, 
            subnet: cidrInfo.subnet, 
            cidr: cidrInfo.cidr,
            usableCapacity: cidrInfo.usableHosts,
            firstUsableIp: cidrInfo.firstUsableIp,
            lastUsableIp: cidrInfo.lastUsableIp
        });
    } catch (err) {
        console.error('Error suggesting IP address:', err);
        res.status(500).json({ error: 'IP adresi önerilemedi.' });
    }
});

module.exports = router;
