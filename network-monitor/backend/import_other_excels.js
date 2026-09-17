const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { pool } = require('./db/connection');

const DIR_PATH = "C:\\Users\\TEST\\Desktop\\Yeni klasör (2)";

const FILES = {
    maintenance: "Bakım Tablosu.xlsx",
    actions: "Yapılan İşler yeni.xlsx",
    materials: "# Gelen giden malzeme listesi(2022-2025).xlsx",
    tonerStock: "yeni toner listesi.xlsx",
    tonerReplacements: "Toner Değişim .xlsx"
};

let devicesCache = [];
let virtualIpCounter = 2000;

async function loadDevicesCache() {
    const res = await pool.query("SELECT id, hostname, ip_address FROM devices");
    devicesCache = res.rows;
    console.log(`Loaded ${devicesCache.length} devices into memory cache.`);
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

async function getOrCreateDeviceIdByHostname(hostname) {
    if (!hostname) return null;
    const cleanHost = String(hostname).trim();
    if (!cleanHost || cleanHost.toLowerCase() === 'bilgisayar adi') return null;

    const target = cleanHostnameForMatching(cleanHost);
    
    // Check in-memory cache
    let match = devicesCache.find(d => cleanHostnameForMatching(d.hostname) === target);
    if (match) return match.id;

    // Create a new device in DB
    const ip = `sanal-${virtualIpCounter++}`;
    try {
        await pool.query(
            `INSERT INTO devices (hostname, ip_address, status, department, os_name, pc_type) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [cleanHost, ip, 'offline', 'Bilinmeyen Bölüm', 'Windows', 'Masaüstü']
        );
        const checkRes = await pool.query("SELECT id FROM devices WHERE ip_address = $1", [ip]);
        if (checkRes.rows.length > 0) {
            const newDevice = {
                id: checkRes.rows[0].id,
                hostname: cleanHost,
                ip_address: ip
            };
            devicesCache.push(newDevice);
            console.log(`ℹ️ Created virtual offline device for: "${cleanHost}" with IP: ${ip}`);
            return newDevice.id;
        }
    } catch (e) {
        console.error(`Failed to create virtual device for "${cleanHost}":`, e.message);
    }
    return null;
}

// Helper to try matching a device from any description text
function findDeviceIdFromText(text) {
    if (!text) return null;
    const cleanText = String(text).toLowerCase()
        .replace(/ı/g, 'i')
        .replace(/ş/g, 's')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        .replace(/i̇/g, 'i');
        
    for (const row of devicesCache) {
        const cleanHName = cleanHostnameForMatching(row.hostname);
        if (cleanHName.length > 3 && cleanText.includes(cleanHName)) {
            return row.id;
        }
    }
    return null;
}

// Helper to normalize keys
function getNormalizedRow(row) {
    const norm = {};
    for (const key of Object.keys(row)) {
        const cleanKey = key.toLowerCase()
            .replace(/i̇/g, 'i') // fix unicode i combining dot
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

// Robust Excel date parser
function parseExcelDate(val) {
    if (val === undefined || val === null || val === '') return null;
    let date = null;
    
    if (typeof val === 'number') {
        // Excel serial date format
        date = new Date(Math.round((val - 25569) * 86400 * 1000));
    } else {
        const strVal = String(val).trim();
        const parts = strVal.split('.');
        if (parts.length === 3) {
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1; // 0-indexed
            const year = parseInt(parts[2], 10);
            if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                date = new Date(year, month, day);
            }
        }
        if (!date) {
            date = new Date(strVal);
        }
    }
    
    if (date && !isNaN(date.getTime())) {
        const year = date.getFullYear();
        if (year > 1990 && year < 2100) {
            return date;
        }
    }
    return null;
}

// Finder function for robust columns matching
function findValue(row, keywords) {
    const keys = Object.keys(row);
    for (const kw of keywords) {
        const foundKey = keys.find(k => k.includes(kw));
        if (foundKey) return row[foundKey];
    }
    return undefined;
}

async function importMaintenance() {
    console.log('📅 Importing Maintenance Checklist (Bakım Tablosu)...');
    const filePath = path.join(DIR_PATH, FILES.maintenance);
    
    const tempDir = path.join(__dirname, 'temp_bakim_import');
    const tempZip = path.join(__dirname, 'temp_bakim_import.zip');
    
    try {
        // Copy to zip and extract
        execSync(`powershell -Command "Copy-Item -Path '${filePath}' -Destination '${tempZip}' -Force; Expand-Archive -Path '${tempZip}' -DestinationPath '${tempDir}' -Force"`);
    } catch (e) {
        console.error("❌ Failed to extract Bakım Tablosu.xlsx using PowerShell:", e.message);
        return;
    }

    const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    let count = 0;

    try {
        const workbook = xlsx.readFile(filePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        
        const computersByRow = {};
        const ref = sheet['!ref'];
        if (ref) {
            const range = xlsx.utils.decode_range(ref);
            for (let r = range.s.r; r <= range.e.r; r++) {
                const cellRef = xlsx.utils.encode_cell({ r: r, c: 0 }); // Column A
                const cell = sheet[cellRef];
                if (cell && cell.v) {
                    computersByRow[r] = String(cell.v).trim();
                }
            }
        }

        const vmlPath = path.join(tempDir, "xl", "drawings", "vmlDrawing1.vml");
        if (fs.existsSync(vmlPath)) {
            const content = fs.readFileSync(vmlPath, 'utf8');
            const shapeMatches = content.match(/<v:shape[\s\S]*?<\/v:shape>/g);
            
            await pool.query("DELETE FROM device_maintenance");

            if (shapeMatches) {
                for (const shape of shapeMatches) {
                    const anchorMatch = shape.match(/<x:Anchor>\s*([\d\s,]+)\s*<\/x:Anchor>/);
                    if (!anchorMatch) continue;
                    
                    const parts = anchorMatch[1].trim().split(/\s*,\s*/).map(x => parseInt(x, 10));
                    if (parts.length < 8) continue;
                    
                    const col = parts[0]; // 0-based column
                    const row = parts[2]; // 0-based row
                    
                    const checkedMatch = shape.match(/<x:Checked>\s*(\d+)\s*<\/x:Checked>/);
                    const isChecked = checkedMatch ? checkedMatch[1] === '1' : false;
                    
                    const compName = computersByRow[row];
                    if (!compName || compName.toLowerCase() === 'bilgisayar adi') continue;
                    
                    const monthName = months[col - 1]; // col=1 -> Ocak
                    if (!monthName) continue;
                    
                    const deviceId = await getOrCreateDeviceIdByHostname(compName);
                    if (!deviceId) continue;

                    await pool.query(
                        `INSERT INTO device_maintenance (device_id, month_name, is_completed, year_val)
                         VALUES ($1, $2, $3, $4)`,
                        [deviceId, monthName, isChecked ? 1 : 0, 2026]
                    );
                    count++;
                }
            }
        } else {
            console.warn("⚠️ vmlDrawing1.vml not found in the extracted Excel structure.");
        }
    } catch (err) {
        console.error("❌ Error parsing maintenance data:", err.message);
    } finally {
        // Cleanup temp files
        try {
            execSync(`powershell -Command "if (Test-Path '${tempZip}') { Remove-Item -Path '${tempZip}' -Force }; if (Test-Path '${tempDir}') { Remove-Item -Path '${tempDir}' -Recurse -Force }"`);
        } catch (e) {
            console.error("⚠️ Cleanup failed:", e.message);
        }
    }

    console.log(`✅ Maintenance: Imported ${count} monthly records.`);
}

async function importActions() {
    console.log('🛠️ Importing Action Logs (Yapılan İşler)...');
    const filePath = path.join(DIR_PATH, FILES.actions);
    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet);

    let count = 0;
    await pool.query("DELETE FROM device_actions");

    for (const rawRow of rows) {
        const row = getNormalizedRow(rawRow);
        
        const rawDate = findValue(row, ['tarih', 'date']);
        const actionDate = parseExcelDate(rawDate) || new Date();
        const serialNo = findValue(row, ['seri', 'serial']) || '';
        const brand = findValue(row, ['marka', 'brand']) || '';
        const model = findValue(row, ['model']) || '';
        const partType = findValue(row, ['tip', 'type']) || '';
        const actionTaken = findValue(row, ['isler', 'islem', 'yapilan', 'action']) || '';
        const compName = findValue(row, ['bilgisayar', 'comp']) || '';
        const username = findValue(row, ['kullanici', 'user']) || '';
        const location = findValue(row, ['konum', 'location']) || '';

        let deviceId = null;
        if (compName) {
            deviceId = await getOrCreateDeviceIdByHostname(String(compName));
        } else if (username) {
            deviceId = await getOrCreateDeviceIdByHostname(String(username));
        }

        await pool.query(
            `INSERT INTO device_actions (device_id, action_date, serial_no, brand, model, part_type, action_taken, username, location)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [deviceId, actionDate, cleanString(serialNo), cleanString(brand), cleanString(model), cleanString(partType), cleanString(actionTaken), cleanString(username), cleanString(location)]
        );
        count++;
    }
    console.log(`✅ Actions: Imported ${count} action history records.`);
}

async function importMaterials() {
    console.log('📦 Importing Material Flow Logs (Gelen Giden Malzeme)...');
    const filePath = path.join(DIR_PATH, FILES.materials);
    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet);

    let count = 0;
    // Malzeme kayıtlarını temizle (tekrar aktarılacağı için mükerrer önleme)
    await pool.query("DELETE FROM device_actions WHERE action_type = 'material'");

    for (const rawRow of rows) {
        const row = getNormalizedRow(rawRow);
        
        const rawGlnDate = row['gln tarih'];
        const rawInstallDate = row['tarih'];
        
        const arrivalDate = parseExcelDate(rawGlnDate);
        const actionDate = parseExcelDate(rawInstallDate);

        const serialNo = row['seri no'] !== undefined ? String(row['seri no']).trim() : '';
        const cameFrom = row['geldigi yer'] !== undefined ? String(row['geldigi yer']).trim() : '';
        const partType = row['tur'] !== undefined ? String(row['tur']).trim() : '';
        const brand = row['marka'] !== undefined ? String(row['marka']).trim() : '';
        const model = row['model no'] !== undefined ? String(row['model no']).trim() : '';
        
        const rawQty = row['adet'];
        let quantity = parseInt(rawQty, 10);
        if (isNaN(quantity)) quantity = 1;

        const location = row['takildigi yer(bilgisayar kulllanicisi)'] !== undefined ? String(row['takildigi yer(bilgisayar kulllanicisi)']).trim() : '';
        const actionTaken = row['arizalilar ve nedeni'] !== undefined ? String(row['arizalilar ve nedeni']).trim() : '';
        const warrantyStatus = row['garantide'] !== undefined ? String(row['garantide']).trim() : '';

        // Cihaz eşleştirme
        let deviceId = findDeviceIdFromText(location);
        if (!deviceId && location) {
            const cleanDesc = location;
            if (cleanDesc.length > 2 && cleanDesc.length < 30 && !cleanDesc.includes(' ') && !cleanDesc.includes(',')) {
                deviceId = await getOrCreateDeviceIdByHostname(cleanDesc);
            }
        }
        
        await pool.query(
            `INSERT INTO device_actions (
                device_id, arrival_date, action_date, serial_no, came_from, 
                brand, model, part_type, quantity, action_taken, 
                username, location, warranty_status, action_type
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'material')`,
            [
                deviceId, 
                arrivalDate, 
                actionDate, 
                serialNo, 
                cameFrom, 
                brand, 
                model, 
                partType, 
                quantity, 
                actionTaken, 
                '', 
                location, 
                warrantyStatus
            ]
        );
        count++;
    }
    console.log(`✅ Materials: Imported ${count} material flow logs.`);
}

async function importTonerStock() {
    console.log('🖨️ Importing Toner Inventory (yeni toner listesi)...');
    const filePath = path.join(DIR_PATH, FILES.tonerStock);
    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet);

    let count = 0;
    await pool.query("DELETE FROM toner_stock");

    for (const rawRow of rows) {
        const keys = Object.keys(rawRow);
        if (keys.length < 2) continue;

        const modelName = String(rawRow[keys[0]]).trim();
        const qty = parseInt(rawRow[keys[1]], 10);

        if (!modelName || isNaN(qty) || modelName.toLowerCase().includes('adet')) continue;

        await pool.query(
            `MERGE INTO toner_stock AS target
             USING (VALUES ($1, $2)) AS source (toner_model, quantity)
             ON target.toner_model = source.toner_model
             WHEN MATCHED THEN
                 UPDATE SET quantity = source.quantity
             WHEN NOT MATCHED THEN
                 INSERT (toner_model, quantity) VALUES (source.toner_model, source.quantity);`,
            [modelName, qty]
        );
        count++;
    }
    console.log(`✅ Toner Stock: Imported ${count} toner stock items.`);
}

async function importTonerReplacements() {
    console.log('🔄 Importing Toner Replacement History (Toner Değişim)...');
    const filePath = path.join(DIR_PATH, FILES.tonerReplacements);
    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet);

    let count = 0;
    await pool.query("DELETE FROM toner_replacements");

    for (const rawRow of rows) {
        const row = getNormalizedRow(rawRow);

        const rawDate = findValue(row, ['tarih', 'date']);
        const repDate = parseExcelDate(rawDate) || new Date();
        const username = findValue(row, ['kullanici', 'user']) || '';
        const modelName = findValue(row, ['model']) || '';

        if (!modelName) continue;

        await pool.query(
            `INSERT INTO toner_replacements (replacement_date, username, toner_model)
             VALUES ($1, $2, $3)`,
            [repDate, cleanString(username), cleanString(modelName)]
        );
        count++;
    }
    console.log(`✅ Toner Replacements: Imported ${count} replacement history records.`);
}

function cleanString(val) {
    if (val === undefined || val === null) return '';
    return String(val).trim();
}

async function startImport() {
    console.log('🚀 Phase 2 Excel Import starting...');
    try {
        await loadDevicesCache();
        await importMaintenance();
        await importActions();
        await importMaterials();
        await importTonerStock();
        await importTonerReplacements();

        console.log('\n🎉 All Phase 2 Excels imported successfully!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Phase 2 Import failed:', err.message);
        process.exit(1);
    }
}

setTimeout(startImport, 2000);
