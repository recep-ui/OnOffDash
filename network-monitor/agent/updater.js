const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const config = require('./config');

const CURRENT_VERSION = require('./package.json').version;

async function checkForUpdate() {
    try {
        console.log(`🔄 Güncelleme kontrol ediliyor... (Mevcut: v${CURRENT_VERSION})`);

        const url = `${config.serverUrl}/api/agent/version`;
        const response = await fetch(url, { timeout: 10000 });

        if (!response.ok) {
            console.log('   ⚠️ Versiyon bilgisi alınamadı');
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
            return await downloadAndUpdate();
        }

        return false;
    } catch (err) {
        console.error('   ❌ Güncelleme kontrolü başarısız:', err.message);
        return false;
    }
}

async function downloadAndUpdate() {
    try {
        const downloadUrl = `${config.serverUrl}/api/agent/download`;
        console.log('   ⬇️ Yeni versiyon indiriliyor...');

        const response = await fetch(downloadUrl, { timeout: 120000 });
        if (!response.ok) {
            console.error('   ❌ İndirme başarısız:', response.status);
            return false;
        }

        const buffer = await response.buffer();
        
        // Dosya yollarını belirle
        const exePath = process.execPath;
        const exeDir = path.dirname(exePath);
        const backupPath = path.join(exeDir, 'OnOffDash_Agent.exe.bak');
        const newPath = path.join(exeDir, 'OnOffDash_Agent_new.exe');

        // Yeni dosyayı kaydet
        fs.writeFileSync(newPath, buffer);
        console.log(`   💾 Yeni dosya kaydedildi: ${newPath} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);

        // Mevcut exe'yi yedekle
        if (fs.existsSync(backupPath)) {
            fs.unlinkSync(backupPath);
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
schtasks /run /tn "${taskName}" >nul 2>&1
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

module.exports = { checkForUpdate, CURRENT_VERSION };
