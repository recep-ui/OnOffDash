const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');

// Helper to parse IP into Subnet, Prefix and Last Octet
function parseIp(ip) {
    if (!ip) return null;
    const clean = ip.trim();
    if (clean.startsWith('sanal-') || !clean.includes('.')) return null;
    const parts = clean.split('.');
    if (parts.length !== 4) return null;
    const octets = parts.map(o => parseInt(o, 10));
    if (octets.some(o => isNaN(o) || o < 0 || o > 255)) return null;
    return {
        subnet: `${octets[0]}.${octets[1]}.${octets[2]}.0/24`,
        prefix: `${octets[0]}.${octets[1]}.${octets[2]}`,
        lastOctet: octets[3]
    };
}

// GET /api/ipam/summary - Alt ağ doluluk oranları ve IP listesi
router.get('/summary', async (req, res) => {
    try {
        const devicesRes = await pool.query("SELECT id, hostname, ip_address, mac_address, department, status FROM devices");
        const printersRes = await pool.query("SELECT id, name, ip_address, department, is_online FROM printers");

        const subnetsMap = {};

        // Cihazları işle
        devicesRes.rows.forEach(d => {
            const parsed = parseIp(d.ip_address);
            if (parsed) {
                if (!subnetsMap[parsed.subnet]) {
                    subnetsMap[parsed.subnet] = {
                        subnet: parsed.subnet,
                        prefix: parsed.prefix,
                        occupiedCount: 0,
                        occupiedList: [],
                        devices: []
                    };
                }
                subnetsMap[parsed.subnet].occupiedCount++;
                subnetsMap[parsed.subnet].occupiedList.push(parsed.lastOctet);
                subnetsMap[parsed.subnet].devices.push({
                    ip: d.ip_address.trim(),
                    octet: parsed.lastOctet,
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
            const parsed = parseIp(p.ip_address);
            if (parsed) {
                if (!subnetsMap[parsed.subnet]) {
                    subnetsMap[parsed.subnet] = {
                        subnet: parsed.subnet,
                        prefix: parsed.prefix,
                        occupiedCount: 0,
                        occupiedList: [],
                        devices: []
                    };
                }
                subnetsMap[parsed.subnet].occupiedCount++;
                subnetsMap[parsed.subnet].occupiedList.push(parsed.lastOctet);
                subnetsMap[parsed.subnet].devices.push({
                    ip: p.ip_address.trim(),
                    octet: parsed.lastOctet,
                    name: p.name,
                    type: 'printer',
                    status: p.is_online ? 'online' : 'offline',
                    mac: '-',
                    department: p.department || 'Genel'
                });
            }
        });

        // Doluluk oranlarını ve boş IP'leri hesapla
        const subnetsList = Object.values(subnetsMap).map(subnet => {
            const occupiedSet = new Set(subnet.occupiedList);
            const availableOctets = [];
            for (let i = 1; i <= 254; i++) {
                if (!occupiedSet.has(i)) {
                    availableOctets.push(i);
                }
            }
            const availableIps = availableOctets.map(oct => `${subnet.prefix}.${oct}`);
            const occupancyRate = parseFloat(((subnet.occupiedCount / 254) * 100).toFixed(1));

            return {
                subnet: subnet.subnet,
                prefix: subnet.prefix,
                occupiedCount: subnet.occupiedCount,
                occupancyRate,
                availableCount: availableIps.length,
                availableIps: availableIps.slice(0, 50), // İlk 50 kullanılabilir IP adresi
                devices: subnet.devices.sort((a, b) => a.octet - b.octet)
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
            if (parsed) {
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
            if (parsed) {
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

        // 2. MAC Adresi Çakışmaları (Cihazlar arasında aynı MAC adresini kullanan farklı makinalar)
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

// GET /api/ipam/suggest - Alt ağ için ilk kullanılabilir boş IP'yi öner
router.get('/suggest', async (req, res) => {
    try {
        const { subnet } = req.query;

        // Tüm aktif IP'leri çek
        const devRes = await pool.query("SELECT ip_address FROM devices");
        const priRes = await pool.query("SELECT ip_address FROM printers");
        
        const occupied = new Set();
        devRes.rows.forEach(r => occupied.add(r.ip_address.trim()));
        priRes.rows.forEach(r => occupied.add(r.ip_address.trim()));

        let targetPrefix = '';
        if (subnet) {
            const parts = subnet.replace('.0/24', '').split('.');
            if (parts.length >= 3) {
                targetPrefix = `${parts[0]}.${parts[1]}.${parts[2]}`;
            }
        }

        // Subnet belirtilmemişse en popüler olanı tahmin et
        if (!targetPrefix) {
            const prefixes = {};
            occupied.forEach(ip => {
                const parts = ip.split('.');
                if (parts.length === 4 && !ip.startsWith('sanal-')) {
                    const pref = `${parts[0]}.${parts[1]}.${parts[2]}`;
                    prefixes[pref] = (prefixes[pref] || 0) + 1;
                }
            });
            const sorted = Object.keys(prefixes).sort((a, b) => prefixes[b] - prefixes[a]);
            targetPrefix = sorted[0] || '10.0.80';
        }

        let suggestedIp = '';
        // 1 ile 254 arasında ilk boşta olanı bul
        for (let i = 1; i <= 254; i++) {
            const testIp = `${targetPrefix}.${i}`;
            if (!occupied.has(testIp)) {
                suggestedIp = testIp;
                break;
            }
        }

        res.json({ suggestedIp, prefix: targetPrefix });
    } catch (err) {
        console.error('Error suggesting IP address:', err);
        res.status(500).json({ error: 'IP adresi önerilemedi.' });
    }
});

module.exports = router;
