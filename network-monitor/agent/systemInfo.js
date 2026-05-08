const si = require('systeminformation');
const os = require('os');

async function getSystemInfo() {
    try {
        const [osInfo, cpu, mem, fsSize, networkInterfaces] = await Promise.all([
            si.osInfo(),
            si.currentLoad(),
            si.mem(),
            si.fsSize(),
            si.networkInterfaces()
        ]);

        // Get the active network interface (usually the one with a gateway)
        const activeInterface = networkInterfaces.find(ni => !ni.internal && ni.ip4 && ni.mac);

        // Calculate overall disk usage percentage
        let totalDiskUsage = 0;
        if (fsSize && fsSize.length > 0) {
            const totalSize = fsSize.reduce((acc, disk) => acc + disk.size, 0);
            const totalUsed = fsSize.reduce((acc, disk) => acc + disk.used, 0);
            totalDiskUsage = totalSize > 0 ? (totalUsed / totalSize) * 100 : 0;
        }

        const memUsage = mem.total > 0 ? ((mem.total - mem.available) / mem.total) * 100 : 0;

        return {
            hostname: os.hostname(),
            ip_address: activeInterface ? activeInterface.ip4 : '127.0.0.1',
            mac_address: activeInterface ? activeInterface.mac : '',
            os_name: `${osInfo.distro} ${osInfo.release}`,
            username: os.userInfo().username,
            cpu_usage: parseFloat(cpu.currentLoad.toFixed(2)),
            ram_usage: parseFloat(memUsage.toFixed(2)),
            disk_usage: parseFloat(totalDiskUsage.toFixed(2)),
            uptime_seconds: Math.floor(os.uptime())
        };
    } catch (err) {
        console.error('Error fetching system info:', err);
        throw err;
    }
}

module.exports = { getSystemInfo };
