const xlsx = require('xlsx');
const path = require('path');
const { pool } = require('./db/connection');

const EXCEL_PATH = "C:\\Users\\TEST\\Desktop\\Yeni klasör (2)\\Donanım & İşletim Sistemi  Envanter Bilgisi Tüm.xlsx";

let devicesCache = [];
let virtualIpCounter = 1;

async function loadDevicesCache() {
    const res = await pool.query("SELECT id, hostname, ip_address FROM devices");
    devicesCache = res.rows;
    console.log(`Loaded ${devicesCache.length} devices from DB into cache.`);
}

function cleanHostnameForMatching(hostname) {
    if (!hostname) return '';
    return String(hostname).trim().toLowerCase()
        .replace(/ı/g, 'i')
        .replace(/ş/g, 's')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        .replace(/i̇/g, 'i') // combining dot
        .split('.')[0]
        .trim();
}

// Helper to normalize keys to clean ASCII
function getNormalizedRow(row) {
    const norm = {};
    for (const key of Object.keys(row)) {
        const cleanKey = key.toLowerCase()
            .replace(/i̇/g, 'i') // combining dot
            .replace(/ı/g, 'i')
            .replace(/ş/g, 's')
            .replace(/ğ/g, 'g')
            .replace(/ü/g, 'u')
            .replace(/ö/g, 'o')
            .replace(/ç/g, 'c')
            .replace(/\s+/g, ' ')
            .trim();
        norm[cleanKey] = row[key];
    }
    return norm;
}

// Extract number from value
function parseNumber(val) {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return Math.round(val);
    const cleaned = String(val).replace(/[^0-9.-]/g, '');
    const parsed = parseInt(cleaned, 10);
    return isNaN(parsed) ? 0 : parsed;
}

// Clean string value
function cleanString(val) {
    if (val === undefined || val === null) return '';
    return String(val).trim();
}

// Finder function for robust columns matching
function findValue(row, keywords) {
    const keys = Object.keys(row);
    for (const kw of keywords) {
        const foundKey = keys.find(k => k === kw || k.includes(kw));
        if (foundKey) return row[foundKey];
    }
    return undefined;
}

async function runImport() {
    console.log('📖 Starting robust Excel import process...');
    console.log(`📂 Excel file path: ${EXCEL_PATH}`);

    try {
        await loadDevicesCache();

        const workbook = xlsx.readFile(EXCEL_PATH);
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert sheet to JSON
        const rawRows = xlsx.utils.sheet_to_json(worksheet);
        console.log(`📊 Found ${rawRows.length} rows in the excel sheet.`);

        let updatedCount = 0;
        let insertedCount = 0;

        for (let i = 0; i < rawRows.length; i++) {
            const rawRow = rawRows[i];
            const row = getNormalizedRow(rawRow);

            // Extract fields using robust clean ASCII keywords
            const hostname = cleanString(findValue(row, ['bilgisayar adi', 'bilgisayar', 'comp']));
            let ipAddress = cleanString(findValue(row, ['bagdastirici ipv4 adresi', 'ip', 'ipv4']));
            const department = cleanString(findValue(row, ['bolumler', 'bolum', 'dep']));
            const osName = cleanString(findValue(row, ['isletim sistemi adi', 'isletim', 'os']));
            const pcType = cleanString(findValue(row, ['pc/tip', 'tip', 'type']));
            const devManufacturer = cleanString(findValue(row, ['aygit ureticisi', 'uretici', 'manuf']));
            const devModel = cleanString(findValue(row, ['aygit modeli', 'model']));
            const serialNumber = cleanString(findValue(row, ['seri numarasi', 'seri no', 'serial']));
            const cpuDesc = cleanString(findValue(row, ['cpu aciklamasi', 'cpu']));
            const cpuCores = parseNumber(findValue(row, ['cekirdek', 'cores']));
            const ramMb = parseNumber(findValue(row, ['ram']));
            const storageMb = parseNumber(findValue(row, ['depolama', 'disk', 'storage']));
            const monitorModel = cleanString(findValue(row, ['monitor']));
            const monitorSerial = cleanString(findValue(row, ['monitor seri']));
            const keyboardModel = cleanString(findValue(row, ['klavye']));
            const keyboardSerial = cleanString(findValue(row, ['klavye/seri']));
            const mouseModel = cleanString(findValue(row, ['mouse']));
            const mouseSerial = cleanString(findValue(row, ['mouse seri']));
            const phoneModel = cleanString(findValue(row, ['telsiz telefon', 'telefon']));
            const phoneSerial = cleanString(findValue(row, ['telsiz telefon seri', 'telefon seri']));

            // Validate computer name
            if (!hostname) {
                console.log(`⚠️ Skip row ${i + 2}: Computer name (Bilgisayar adı) is missing.`);
                continue;
            }

            // Generate virtual IP if empty or invalid
            if (!ipAddress || ipAddress.toLowerCase() === 'yok' || !ipAddress.includes('.')) {
                ipAddress = `sanal-${virtualIpCounter++}`;
            }

            const cleanHost = cleanHostnameForMatching(hostname);

            // Find matching device in memory cache (match by hostname or IP address)
            let match = devicesCache.find(d => 
                (cleanHostnameForMatching(d.hostname) === cleanHost) ||
                (d.ip_address && d.ip_address === ipAddress)
            );

            if (match) {
                // Update existing device (we don't change its hostname/ip_address here to prevent constraint errors)
                const query = `
                    UPDATE devices SET
                        department = COALESCE(NULLIF($1, ''), department),
                        os_name = COALESCE(NULLIF($2, ''), os_name),
                        pc_type = COALESCE(NULLIF($3, ''), pc_type),
                        device_manufacturer = COALESCE(NULLIF($4, ''), device_manufacturer),
                        device_model = COALESCE(NULLIF($5, ''), device_model),
                        serial_number = COALESCE(NULLIF($6, ''), serial_number),
                        cpu_description = COALESCE(NULLIF($7, ''), cpu_description),
                        cpu_cores = CASE WHEN $8 > 0 THEN $8 ELSE cpu_cores END,
                        ram_mb = CASE WHEN $9 > 0 THEN $9 ELSE ram_mb END,
                        storage_mb = CASE WHEN $10 > 0 THEN $10 ELSE storage_mb END,
                        monitor_model = COALESCE(NULLIF($11, ''), monitor_model),
                        monitor_serial = COALESCE(NULLIF($12, ''), monitor_serial),
                        keyboard_model = COALESCE(NULLIF($13, ''), keyboard_model),
                        keyboard_serial = COALESCE(NULLIF($14, ''), keyboard_serial),
                        mouse_model = COALESCE(NULLIF($15, ''), mouse_model),
                        mouse_serial = COALESCE(NULLIF($16, ''), mouse_serial),
                        phone_model = COALESCE(NULLIF($17, ''), phone_model),
                        phone_serial = COALESCE(NULLIF($18, ''), phone_serial),
                        updated_at = GETDATE()
                    WHERE id = $19
                `;
                const params = [
                    department, osName, pcType,
                    devManufacturer, devModel, serialNumber, cpuDesc, cpuCores,
                    ramMb, storageMb, monitorModel, monitorSerial, keyboardModel,
                    keyboardSerial, mouseModel, mouseSerial, phoneModel, phoneSerial,
                    match.id
                ];
                await pool.query(query, params);
                updatedCount++;
            } else {
                // Insert new device
                const query = `
                    INSERT INTO devices (
                        hostname, ip_address, department, os_name, pc_type,
                        device_manufacturer, device_model, serial_number, cpu_description, cpu_cores,
                        ram_mb, storage_mb, monitor_model, monitor_serial, keyboard_model,
                        keyboard_serial, mouse_model, mouse_serial, phone_model, phone_serial,
                        status
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, 'offline'
                    )
                `;
                const params = [
                    hostname, ipAddress, department, osName, pcType,
                    devManufacturer, devModel, serialNumber, cpuDesc, cpuCores,
                    ramMb, storageMb, monitorModel, monitorSerial, keyboardModel,
                    keyboardSerial, mouseModel, mouseSerial, phoneModel, phoneSerial
                ];
                await pool.query(query, params);
                insertedCount++;
                
                // Add to cache so it isn't inserted again in duplicate rows
                devicesCache.push({ hostname, ip_address: ipAddress });
            }
        }

        console.log(`\n🎉 Excel import completed successfully!`);
        console.log(`💾 Updated: ${updatedCount} devices, Inserted: ${insertedCount} devices.`);
        process.exit(0);
    } catch (err) {
        console.error('❌ Excel import failed:', err.message);
        process.exit(1);
    }
}

// Delay import execution for 2 seconds to make sure db is connected
setTimeout(runImport, 2000);
