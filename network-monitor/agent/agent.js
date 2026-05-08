const fetch = require('node-fetch');
const config = require('./config');
const { getSystemInfo } = require('./systemInfo');
const { getSoftwareInventory } = require('./softwareInfo');
const { checkForUpdate, CURRENT_VERSION } = require('./updater');

let isSending = false;
let isSendingSoftware = false;

async function sendHeartbeat() {
    if (isSending) return;
    isSending = true;

    try {
        const payload = await getSystemInfo();
        const url = `${config.serverUrl}/api/heartbeat`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            console.log(`[${new Date().toISOString()}] Heartbeat sent successfully to ${url}`);
        } else {
            console.error(`[${new Date().toISOString()}] Failed to send heartbeat: HTTP ${response.status}`);
        }
    } catch (err) {
        console.error(`[${new Date().toISOString()}] Error sending heartbeat:`, err.message);
    } finally {
        isSending = false;
    }
}

async function sendSoftwareInventory() {
    if (isSendingSoftware) return;
    isSendingSoftware = true;

    try {
        console.log('📦 Yazılım envanteri toplanıyor...');
        const software = await getSoftwareInventory();

        // Cihazın IP adresini al
        const sysInfo = await getSystemInfo();

        const url = `${config.serverUrl}/api/software`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                device_ip: sysInfo.ip_address,
                software: software
            })
        });

        if (response.ok) {
            const result = await response.json();
            console.log(`[${new Date().toISOString()}] Software inventory sent: ${result.count} programs`);
        } else {
            console.error(`[${new Date().toISOString()}] Failed to send software: HTTP ${response.status}`);
        }
    } catch (err) {
        console.error(`[${new Date().toISOString()}] Error sending software inventory:`, err.message);
    } finally {
        isSendingSoftware = false;
    }
}

// ===== BAŞLANGIÇ =====
console.log('');
console.log('═══════════════════════════════════════════');
console.log('  🚀 OnOffDash Agent v' + CURRENT_VERSION);
console.log('═══════════════════════════════════════════');
console.log(`  📡 Server: ${config.serverUrl}`);
console.log(`  ⏱️  Heartbeat: ${config.heartbeatInterval / 1000}s`);
console.log(`  🔄 Update check: ${config.updateCheckInterval / 1000 / 3600}h`);
console.log(`  📦 Software scan: ${config.softwareInterval / 1000 / 3600}h`);
console.log('═══════════════════════════════════════════');
console.log('');

// 1. Güncelleme kontrolü (başlangıçta)
setTimeout(async () => {
    await checkForUpdate();
}, 3000);

// 2. İlk heartbeat
sendHeartbeat();

// 3. Periyodik heartbeat
setInterval(sendHeartbeat, config.heartbeatInterval);

// 4. İlk yazılım envanteri (45 saniye sonra — heartbeat'in cihazı kaydetmesini bekle)
setTimeout(() => {
    sendSoftwareInventory();
}, 45000);

// 5. Periyodik yazılım envanteri (her 6 saatte bir)
setInterval(sendSoftwareInventory, config.softwareInterval);

// 6. Periyodik güncelleme kontrolü (her 6 saatte bir)
setInterval(async () => {
    await checkForUpdate();
}, config.updateCheckInterval);
