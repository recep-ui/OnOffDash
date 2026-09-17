const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const config = require('./config');

const CURRENT_VERSION = require('./package.json').version;
const PUBLIC_KEY_FILE = path.join(__dirname, 'agent_update_public.pem');

function getAgentPublicKey() {
    if (process.env.AGENT_UPDATE_PUBLIC_KEY) {
        return process.env.AGENT_UPDATE_PUBLIC_KEY;
    }
    if (fs.existsSync(PUBLIC_KEY_FILE)) {
        return fs.readFileSync(PUBLIC_KEY_FILE, 'utf8');
    }
    return null;
}

function verifySignature(versionData, expectedSha256, signature, publicKey) {
    if (!publicKey || !signature) return false;
    try {
        const payload = `${versionData.version || ''}:${String(expectedSha256 || '').toLowerCase()}:${versionData.size || ''}`;
        const verifier = crypto.createVerify('SHA256');
        verifier.update(payload);
        return verifier.verify(publicKey, signature, 'base64');
    } catch (err) {
        console.error('   ❌ İmza doğrulama hatası:', err.message);
        return false;
    }
}

function isHttpsRequired() {
    const isDev = process.env.NODE_ENV === 'development' || process.env.ALLOW_INSECURE_HTTP === 'true';
    return !isDev;
}

async function checkForUpdate() {
    try {
        console.log(`🔄 Güncelleme kontrol ediliyor... (Mevcut: v${CURRENT_VERSION})`);

        if (isHttpsRequired() && config.serverUrl && !config.serverUrl.startsWith('https://')) {
            console.error(`   ❌ GÜVENLİK HATASI: Production ortamında sunucu URL'i HTTPS olmak zorundadır! (Verilen: ${config.serverUrl})`);
            return false;
        }

        const url = `${config.serverUrl}/api/agent/version`;
        const headers = {};
        if (config.agentApiKey) {
            headers['X-Agent-Key'] = config.agentApiKey;
        }

        const response = await fetch(url, { headers, timeout: 10000 });

        if (!response.ok) {
            console.log(`   ⚠️ Versiyon bilgisi alınamadı: HTTP ${response.status}`);
            return false;
        }

        const versionData = await response.json();
        const latestVersion = versionData.version;

        if (!latestVersion || latestVersion === CURRENT_VERSION) {
            console.log(`   ✅ Güncel versiyon kullanılıyor (v${CURRENT_VERSION})`);
            return false;
        }

        // Versiyon karşılaştırma (semver)
        if (compareVersions(latestVersion, CURRENT_VERSION) > 0) {
            console.log(`   🆕 Yeni versiyon mevcut: v${latestVersion} (Mevcut: v${CURRENT_VERSION})`);
            return await downloadAndUpdate(versionData);
        }

        return false;
    } catch (err) {
        console.error('   ❌ Güncelleme kontrolü başarısız:', err.message);
        return false;
    }
}

async function downloadAndUpdate(versionData = {}) {
    const exePath = process.execPath;
    const exeDir = path.dirname(exePath);
    const backupPath = path.join(exeDir, 'OnOffDash_Agent.exe.bak');
    const newPath = path.join(exeDir, 'OnOffDash_Agent_new.exe');

    try {
        const downloadUrl = `${config.serverUrl}/api/agent/download`;
        console.log('   ⬇️ Yeni versiyon indiriliyor...');

        const headers = {};
        if (config.agentApiKey) {
            headers['X-Agent-Key'] = config.agentApiKey;
        }

        const response = await fetch(downloadUrl, { headers, timeout: 120000 });
        if (!response.ok) {
            console.error('   ❌ İndirme başarısız:', response.status);
            return false;
        }

        const buffer = await response.buffer();

        // 1. Beklenen dosya boyutu kontrolü
        if (versionData.size && buffer.length !== versionData.size) {
            console.error(`   ❌ GÜVENLİK HATASI: Dosya boyutu uyumsuz! (Beklenen: ${versionData.size}, İndirilen: ${buffer.length})`);
            return false;
        }

        // 2. SHA-256 Bütünlük Doğrulaması (Supply-Chain Verification - FAIL-CLOSED)
        const expectedSha256 = versionData.sha256 || response.headers.get('x-agent-sha256');
        if (!expectedSha256) {
            console.error('   ❌ KRİTİK GÜVENLİK UYARISI: Sunucu SHA-256 sağlama değeri sağlamadı! Güncelleme reddedildi (Fail-closed).');
            return false;
        }

        const computedSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
        if (computedSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
            console.error('   ❌ KRİTİK GÜVENLİK UYARISI: İndirilen dosyanın SHA-256 özeti sunucu manifesti ile EŞLEŞMİYOR!');
            console.error(`      Hesaplanan: ${computedSha256}`);
            console.error(`      Beklenen:   ${expectedSha256}`);
            console.error('      Güncelleme iptal edildi. Orijinal ajan çalışmaya devam ediyor.');
            return false;
        }
        console.log('   🛡️ SHA-256 bütünlük doğrulaması BAŞARILI.');

        // 3. RSA Dijital İmza Doğrulaması (Manifest Signature)
        const publicKey = getAgentPublicKey();
        const requireSignature = process.env.REQUIRE_AGENT_SIGNATURE === 'true' || !!publicKey;

        if (requireSignature) {
            if (!versionData.signature) {
                console.error('   ❌ KRİTİK GÜVENLİK HATASI: Güncelleme manifestinde dijital imza bulunamadı! Güncelleme reddedildi.');
                return false;
            }
            const isSigValid = verifySignature(versionData, expectedSha256, versionData.signature, publicKey);
            if (!isSigValid) {
                console.error('   ❌ KRİTİK GÜVENLİK HATASI: İndirilen güncellemenin dijital imzası GEÇERSİZ! Olası kurcalama tespit edildi.');
                return false;
            }
            console.log('   🛡️ RSA dijital imza doğrulaması BAŞARILI.');
        }

        // Yeni dosyayı kaydet
        fs.writeFileSync(newPath, buffer);
        console.log(`   💾 Yeni dosya kaydedildi: ${newPath} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);

        // Mevcut exe'yi yedekle
        if (fs.existsSync(backupPath)) {
            try { fs.unlinkSync(backupPath); } catch (e) {}
        }

        // Windows'ta çalışan exe'yi doğrudan değiştiremeyiz
        // Bu nedenle bir batch script oluşturup servisi yeniden başlatıyoruz
        const updateScript = path.join(exeDir, 'do_update.bat');
        const taskName = 'OnOffDash_Agent_Service';

        const script = `@echo off
timeout /t 3 /nobreak >nul
taskkill /f /im OnOffDash_Agent.exe >nul 2>&1
timeout /t 2 /nobreak >nul
if exist "${exePath}" (
    move /Y "${exePath}" "${backupPath}" >nul 2>&1
)
move /Y "${newPath}" "${exePath}" >nul 2>&1

:: Servisi başlat
schtasks /run /tn "${taskName}" >nul 2>&1

:: Servis başlayamadıysa geri yükle (Rollback guard)
timeout /t 3 /nobreak >nul
tasklist /fi "imagename eq OnOffDash_Agent.exe" 2>NUL | find /i "OnOffDash_Agent.exe" >nul
if %errorlevel% neq 0 (
    if exist "${backupPath}" (
        move /Y "${backupPath}" "${exePath}" >nul 2>&1
        schtasks /run /tn "${taskName}" >nul 2>&1
    )
)

del "%~f0" >nul 2>&1
`;

        fs.writeFileSync(updateScript, script, 'ascii');
        console.log('   🔄 Güncelleme scripti oluşturuldu, servis yeniden başlatılıyor...');

        // Update script'i arka planda çalıştır ve çık
        execSync(`start /b cmd /c "${updateScript}"`, { 
            windowsHide: true,
            cwd: exeDir 
        });

        // Kısa bir süre bekle ve process'i sonlandır
        setTimeout(() => {
            process.exit(0);
        }, 1000);

        return true;
    } catch (err) {
        console.error('   ❌ Güncelleme kurulumu başarısız:', err.message);
        if (fs.existsSync(newPath)) {
            try { fs.unlinkSync(newPath); } catch (e) {}
        }
        return false;
    }
}

function compareVersions(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
        const na = pa[i] || 0;
        const nb = pb[i] || 0;
        if (na > nb) return 1;
        if (na < nb) return -1;
    }
    return 0;
}

module.exports = {
    checkForUpdate,
    downloadAndUpdate,
    CURRENT_VERSION,
    compareVersions,
    verifySignature,
    getAgentPublicKey,
    isHttpsRequired
};

