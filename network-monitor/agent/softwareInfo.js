const si = require('systeminformation');
const { execSync } = require('child_process');

/**
 * Kapsamlı yazılım envanteri toplama:
 * 1. Registry'den standart programlar (systeminformation)
 * 2. Windows Store uygulamaları (PowerShell Get-AppxPackage)
 * 3. Çalışan servisler (önemli olanlar)
 */
async function getSoftwareInventory() {
    const allSoftware = [];

    // 1. Standart yüklü programlar (Add/Remove Programs - Registry)
    try {
        const programs = await si.programs();
        for (const prog of programs) {
            if (prog.name && prog.name.trim()) {
                allSoftware.push({
                    name: prog.name.trim(),
                    version: prog.version || '',
                    publisher: prog.publisher || '',
                    install_date: prog.install_date || '',
                    source: 'registry'
                });
            }
        }
        console.log(`   📦 Registry programları: ${programs.length} adet`);
    } catch (err) {
        console.error('   ⚠️ Registry programları alınamadı:', err.message);
    }

    // 2. Windows Store Uygulamaları
    try {
        const psCommand = `powershell -NoProfile -Command "Get-AppxPackage | Where-Object { $_.IsFramework -eq $false -and $_.SignatureKind -ne 'System' } | Select-Object Name, @{N='Version';E={$_.Version.ToString()}}, Publisher | ConvertTo-Json -Compress"`;
        const output = execSync(psCommand, { 
            timeout: 30000, 
            encoding: 'utf8',
            windowsHide: true 
        });

        if (output && output.trim()) {
            let storeApps = JSON.parse(output.trim());
            if (!Array.isArray(storeApps)) storeApps = [storeApps];

            for (const app of storeApps) {
                if (app.Name && !app.Name.startsWith('Microsoft.NET') && !app.Name.startsWith('Microsoft.VCLibs')) {
                    // Publisher temizleme (CN= önekini kaldır)
                    let publisher = app.Publisher || '';
                    const cnMatch = publisher.match(/CN=([^,]+)/);
                    if (cnMatch) publisher = cnMatch[1];

                    allSoftware.push({
                        name: app.Name,
                        version: app.Version || '',
                        publisher: publisher,
                        install_date: '',
                        source: 'store'
                    });
                }
            }
            console.log(`   🏪 Store uygulamaları: ${storeApps.length} adet`);
        }
    } catch (err) {
        console.error('   ⚠️ Store uygulamaları alınamadı:', err.message);
    }

    // 3. Windows Servisleri (çalışan ve önemli olanlar)
    try {
        const services = await si.services('*');
        const runningServices = services.filter(s => s.running && s.name);
        
        for (const svc of runningServices) {
            allSoftware.push({
                name: `[Service] ${svc.name}`,
                version: '',
                publisher: svc.startmode || '',
                install_date: '',
                source: 'service'
            });
        }
        console.log(`   ⚙️ Çalışan servisler: ${runningServices.length} adet`);
    } catch (err) {
        console.error('   ⚠️ Servisler alınamadı:', err.message);
    }

    // Duplicate temizliği (aynı isimde birden fazla kayıt olabilir)
    const seen = new Set();
    const unique = allSoftware.filter(sw => {
        const key = `${sw.name}|${sw.version}|${sw.source}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    console.log(`   📊 Toplam benzersiz yazılım: ${unique.length}`);
    return unique;
}

module.exports = { getSoftwareInventory };
