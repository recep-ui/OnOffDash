const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const config = require('./config');
const { getSystemInfo } = require('./systemInfo');
const { getSoftwareInventory } = require('./softwareInfo');
const { checkForUpdate, CURRENT_VERSION } = require('./updater');

let isSending = false;
let isSendingSoftware = false;

function checkAndInstallService() {
    // 1. Argüman kontrolü (--foreground veya --debug varsa pas geç)
    const args = process.argv.slice(2);
    if (args.includes('--foreground') || args.includes('--debug')) {
        console.log('ℹ️ Foreground modu aktif. Servis kurulumu pas geçiliyor.');
        return true;
    }

    const targetDir = 'C:\\Program Files\\OnOffDash_Agent';
    const targetExe = path.join(targetDir, 'OnOffDash_Agent.exe');
    const currentExe = process.execPath;

    // Ajan zaten hedef konumdan mı çalışıyor? (case-insensitive)
    if (currentExe.toLowerCase() === targetExe.toLowerCase()) {
        return true;
    }

    // Node.js veya geliştirici ortamı kontrolü
    const exeName = path.basename(currentExe).toLowerCase();
    if (exeName.includes('node')) {
        console.log('ℹ️ Geliştirici ortamı (Node.js) algılandı. Kurulum pas geçiliyor.');
        return true;
    }

    console.log('🔍 Otomatik kurulum kontrol ediliyor...');

    // 2. Yönetici yetkisi kontrolü
    let isAdmin = false;
    try {
        execSync('net session', { stdio: 'ignore' });
        isAdmin = true;
    } catch (err) {
        // net session başarısızsa admin değiliz
    }

    if (!isAdmin) {
        console.warn('⚠️ UYARI: Zamanlanmış görev olarak arka planda çalışabilmesi için lütfen bu programı YÖNETİCİ (Administrator) yetkileriyle çalıştırın.');
        console.log('ℹ️ Geçici olarak ön planda (interactive) çalışmaya devam ediliyor...');
        return true;
    }

    console.log('⚙️ Yönetici yetkisi doğrulandı. Arka plan servisi kuruluyor...');

    try {
        // Dizin oluştur
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        // Exe'yi kopyala
        fs.copyFileSync(currentExe, targetExe);
        console.log(`💾 Ajan kopyalandı: ${targetExe}`);

        // Eğer bulunulan dizinde .env dosyası varsa kopyala
        const currentEnv = path.join(path.dirname(currentExe), '.env');
        const targetEnv = path.join(targetDir, '.env');
        if (fs.existsSync(currentEnv)) {
            fs.copyFileSync(currentEnv, targetEnv);
            console.log('💾 .env yapılandırma dosyası kopyalandı.');
        }

        const taskName = 'OnOffDash_Agent_Service';

        // Eski görevi kaldır
        try {
            execSync(`schtasks /delete /tn "${taskName}" /f`, { stdio: 'ignore' });
        } catch (e) {}

        // Yeni görevi SYSTEM yetkisiyle başlangıçta çalışacak şekilde kaydet
        execSync(`schtasks /create /tn "${taskName}" /tr "\\"${targetExe}\\"" /sc onstart /ru "SYSTEM" /rl HIGHEST /f`, { stdio: 'ignore' });
        console.log('✅ Zamanlanmış görev Windows\'a kaydedildi (SYSTEM).');

        // Görevi hemen arka planda başlat
        execSync(`schtasks /run /tn "${taskName}"`, { stdio: 'ignore' });
        console.log('🚀 Arka plan görevi başlatıldı.');

        console.log('===================================================');
        console.log('[BAŞARILI] Ajan arka planda çalışmak üzere sisteme kuruldu.');
        console.log('Bu pencere 3 saniye sonra otomatik kapanacaktır.');
        console.log('===================================================');

        setTimeout(() => {
            process.exit(0);
        }, 3000);

        return false;
    } catch (err) {
        console.error('❌ Kurulum sırasında hata oluştu:', err.message);
        console.log('ℹ️ Ön planda çalışmaya devam ediliyor...');
        return true;
    }
}


async function sendHeartbeat() {
    if (isSending) return;
    isSending = true;

    try {
        const payload = await getSystemInfo();
        const url = `${config.serverUrl}/api/heartbeat`;

        const headers = {
            'Content-Type': 'application/json'
        };
        if (config.agentApiKey) {
            headers['X-Agent-Key'] = config.agentApiKey;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers,
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
        const headers = {
            'Content-Type': 'application/json'
        };
        if (config.agentApiKey) {
            headers['X-Agent-Key'] = config.agentApiKey;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers,
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
if (checkAndInstallService()) {
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
}

