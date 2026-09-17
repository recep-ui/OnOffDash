const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');
const xlsx = require('xlsx');
const { requireRole } = require('../middleware/auth');
const { sanitizeRows } = require('../utils/excelSanitizer');
const { isValidIP, isValidMAC, isValidHostname, sanitizePagination } = require('../utils/validators');

// GET /api/devices — Tüm cihazları listele
router.get('/', async (req, res) => {
    try {
        const { status, department, agent, search, sortBy, sortOrder } = req.query;

        let query = `
            SELECT d.*, h.cpu_usage, h.ram_usage, h.uptime_seconds 
            FROM devices d
            OUTER APPLY (
                SELECT TOP 1 cpu_usage, ram_usage, uptime_seconds
                FROM heartbeats
                WHERE device_id = d.id
                ORDER BY last_seen DESC
            ) h
        `;
        const conditions = [];
        const params = [];
        let paramIndex = 1;

        if (status && status !== 'all') {
            conditions.push(`status = $${paramIndex++}`);
            params.push(status);
        }
        if (department) {
            conditions.push(`department = $${paramIndex++}`);
            params.push(department);
        }
        if (agent !== undefined && agent !== '') {
            conditions.push(`agent_installed = $${paramIndex++}`);
            params.push(agent === 'true' ? 1 : 0);
        }
        if (search) {
            conditions.push(`(hostname LIKE $${paramIndex} OR ip_address LIKE $${paramIndex} OR username LIKE $${paramIndex})`);
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        // Sıralama
        const allowedSorts = ['hostname', 'ip_address', 'status', 'last_seen', 'ping_ms', 'department', 'created_at'];
        const sort = allowedSorts.includes(sortBy) ? sortBy : 'hostname';
        const order = sortOrder === 'desc' ? 'DESC' : 'ASC';
        query += ` ORDER BY ${sort} ${order}`;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching devices:', err);
        res.status(500).json({ error: 'Failed to fetch devices' });
    }
});

// GET /api/devices/departments — Benzersiz departmanları listele
router.get('/departments', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT DISTINCT department FROM devices WHERE department IS NOT NULL AND department != '' ORDER BY department`
        );
        res.json(result.rows.map(r => r.department));
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch departments' });
    }
});

// POST /api/devices/import - Excel verilerini içe aktar (çakışan kayıtlar için DB verisini ez, excel verisine dokunma)
router.post('/import', requireRole('operator'), async (req, res) => {
    try {
        const { fileData } = req.body;
        if (!fileData) {
            return res.status(400).json({ error: 'fileData (Base64) gereklidir.' });
        }

        // 10MB payload size limit check
        if (typeof fileData !== 'string' || fileData.length > 14 * 1024 * 1024) {
            return res.status(413).json({ error: 'Dosya boyutu çok büyük (Maksimum 10MB).' });
        }

        // Base64'ten raw buffer'a dönüştür
        const buffer = Buffer.from(fileData, 'base64');
        const workbook = xlsx.read(buffer, { type: 'buffer' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawRows = xlsx.utils.sheet_to_json(worksheet);

        console.log(`📥 API Excel Import: ${rawRows.length} satır bulundu.`);

        // 1. Veritabanındaki tüm cihazları önbelleğe al
        const devRes = await pool.query("SELECT id, hostname, ip_address FROM devices");
        const devicesCache = devRes.rows;

        let virtualIpCounter = 3000; // Yeni sanal cihazlar için IP sayacı
        let updatedCount = 0;
        let insertedCount = 0;

        // Yardımcı Fonksiyonlar
        function cleanHostname(hostname) {
            if (!hostname) return '';
            return String(hostname).trim().toLowerCase()
                .replace(/ı/g, 'i')
                .replace(/ş/g, 's')
                .replace(/ğ/g, 'g')
                .replace(/ü/g, 'u')
                .replace(/ö/g, 'o')
                .replace(/ç/g, 'c')
                .replace(/i̇/g, 'i')
                .split('.')[0]
                .trim();
        }

        function getNormalizedRow(row) {
            const norm = {};
            for (const key of Object.keys(row)) {
                const cleanKey = key.toLowerCase()
                    .replace(/i̇/g, 'i')
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

        function findValue(row, keywords) {
            const keys = Object.keys(row);
            for (const kw of keywords) {
                const foundKey = keys.find(k => k === kw || k.includes(kw));
                if (foundKey) return row[foundKey];
            }
            return undefined;
        }

        function parseNumber(val) {
            if (val === undefined || val === null || val === '') return 0;
            if (typeof val === 'number') return Math.round(val);
            const cleaned = String(val).replace(/[^0-9.-]/g, '');
            const parsed = parseInt(cleaned, 10);
            return isNaN(parsed) ? 0 : parsed;
        }

        function cleanString(val) {
            if (val === undefined || val === null) return '';
            return String(val).trim();
        }

        for (let i = 0; i < rawRows.length; i++) {
            const rawRow = rawRows[i];
            const row = getNormalizedRow(rawRow);

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
            const username = cleanString(findValue(row, ['kullanici', 'user']));
            const notes = cleanString(findValue(row, ['notlar', 'not', 'notes']));

            if (!hostname) continue; // Hostname eksikse atla

            if (!ipAddress || ipAddress.toLowerCase() === 'yok' || !ipAddress.includes('.')) {
                ipAddress = `sanal-${virtualIpCounter++}`;
            }

            const cleanHost = cleanHostname(hostname);

            // IP veya Hostname prefixine göre eşleşen cihaz ara
            let match = devicesCache.find(d => 
                (cleanHostname(d.hostname) === cleanHost) ||
                (d.ip_address && d.ip_address === ipAddress)
            );

            if (match) {
                // UPDATE: Çakışan cihazın alanlarını Excel'deki değerlerle ez
                // Hostname ve IP adresi çakışmalarını önlemek için d.hostname ve d.ip_address'i ellemeyiz
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
                        username = COALESCE(NULLIF($19, ''), username),
                        notes = COALESCE(NULLIF($20, ''), notes),
                        updated_at = GETDATE()
                    WHERE id = $21
                `;
                const params = [
                    department, osName, pcType,
                    devManufacturer, devModel, serialNumber, cpuDesc, cpuCores,
                    ramMb, storageMb, monitorModel, monitorSerial, keyboardModel,
                    keyboardSerial, mouseModel, mouseSerial, phoneModel, phoneSerial,
                    username, notes, match.id
                ];
                await pool.query(query, params);
                updatedCount++;
            } else {
                // INSERT: Çakışmayan yeni cihazı ekle
                const query = `
                    INSERT INTO devices (
                        hostname, ip_address, department, os_name, pc_type,
                        device_manufacturer, device_model, serial_number, cpu_description, cpu_cores,
                        ram_mb, storage_mb, monitor_model, monitor_serial, keyboard_model,
                        keyboard_serial, mouse_model, mouse_serial, phone_model, phone_serial,
                        username, notes, status
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, 'offline'
                    )
                `;
                const params = [
                    hostname, ipAddress, department, osName, pcType,
                    devManufacturer, devModel, serialNumber, cpuDesc, cpuCores,
                    ramMb, storageMb, monitorModel, monitorSerial, keyboardModel,
                    keyboardSerial, mouseModel, mouseSerial, phoneModel, phoneSerial,
                    username, notes
                ];
                await pool.query(query, params);
                insertedCount++;

                devicesCache.push({ hostname, ip_address: ipAddress });
            }
        }

        // Web socket istemcilerini uyar
        const io = req.app.get('io');
        if (io) io.emit('device:updated');

        res.json({ success: true, updatedCount, insertedCount });
    } catch (err) {
        console.error('❌ Excel Import error:', err);
        res.status(500).json({ error: 'Excel içe aktarma başarısız oldu: ' + err.message });
    }
});

// GET /api/devices/export - Tüm cihaz verilerini Excel formatında indir
router.get('/export', async (req, res) => {
    try {
        const query = `
            SELECT d.*, h.cpu_usage, h.ram_usage, h.uptime_seconds 
            FROM devices d
            OUTER APPLY (
                SELECT TOP 1 cpu_usage, ram_usage, uptime_seconds
                FROM heartbeats
                WHERE device_id = d.id
                ORDER BY last_seen DESC
            ) h
            ORDER BY d.hostname ASC
        `;
        const result = await pool.query(query);
        const devices = result.rows;

        // Orijinal kolon isimleriyle eşle
        const excelRows = devices.map(d => ({
            'Bilgisayar adı': d.hostname || '',
            'Bağdaştırıcı IPv4 adresi': d.ip_address || '',
            'Bölümler': d.department || '',
            'İşletim sistemi adı': d.os_name || '',
            'PC/Tip': d.pc_type || '',
            'Aygıt üreticisi': d.device_manufacturer || '',
            'Aygıt modeli': d.device_model || '',
            'Seri numarası': d.serial_number || '',
            'CPU açıklaması': d.cpu_description || '',
            'Çekirdek Say.': d.cpu_cores || 0,
            'RAM  [MB]': d.ram_mb || 0,
            'Depolama [MB]': d.storage_mb || 0,
            'Monitör': d.monitor_model || '',
            'Monitör Seri no': d.monitor_serial || '',
            'Klavye': d.keyboard_model || '',
            'Klavye/Seri no': d.keyboard_serial || '',
            'Mouse': d.mouse_model || '',
            'Mouse Seri No': d.mouse_serial || '',
            'Telsiz Telefon': d.phone_model || '',
            'Telsiz Telefon Seri no': d.phone_serial || '',
            'Kullanıcı': d.username || '',
            'Notlar': d.notes || '',
            'Durum': d.status === 'online' ? 'Çevrimiçi' : d.status === 'warning' ? 'Uyarı' : 'Çevrimdışı',
            'Ping (ms)': d.ping_ms || '',
            'Ajan Yüklü': d.agent_installed ? 'Evet' : 'Hayır'
        }));

        const ws = xlsx.utils.json_to_sheet(sanitizeRows(excelRows));
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, "Cihaz Envanteri");

        // Excel dosyasını buffer'a yaz
        const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', 'attachment; filename="Cihaz_Envanter_Export.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);
    } catch (err) {
        console.error('❌ Excel Export error:', err);
        res.status(500).json({ error: 'Excel dışa aktarma başarısız oldu: ' + err.message });
    }
});

// GET /api/devices/:id — Tek cihaz detayı
router.get('/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM devices WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch device' });
    }
});

// POST /api/devices — Manuel cihaz ekle
router.post('/', requireRole('operator'), async (req, res) => {
    try {
        const { hostname, ip_address, mac_address, department, os_name, username, notes } = req.body;

        if (!hostname || !ip_address) {
            return res.status(400).json({ error: 'hostname and ip_address are required' });
        }

        if (!isValidIP(ip_address)) {
            return res.status(400).json({ error: 'Invalid IP address format' });
        }

        if (mac_address && !isValidMAC(mac_address)) {
            return res.status(400).json({ error: 'Invalid MAC address format' });
        }

        const result = await pool.query(
            `MERGE INTO devices AS target
             USING (VALUES ($1, $2, $3, $4, $5, $6, $7)) AS source (hostname, ip_address, mac_address, department, os_name, username, notes)
             ON target.ip_address = source.ip_address
             WHEN MATCHED THEN
                 UPDATE SET
                     hostname = source.hostname,
                     mac_address = COALESCE(source.mac_address, target.mac_address),
                     department = COALESCE(source.department, target.department),
                     os_name = COALESCE(source.os_name, target.os_name),
                     username = COALESCE(source.username, target.username),
                     notes = COALESCE(source.notes, target.notes),
                     updated_at = GETDATE()
             WHEN NOT MATCHED THEN
                 INSERT (hostname, ip_address, mac_address, department, os_name, username, notes)
                 VALUES (source.hostname, source.ip_address, source.mac_address, source.department, source.os_name, source.username, source.notes)
             OUTPUT INSERTED.*;`,
            [hostname, ip_address, mac_address || null, department || '', os_name || '', username || '', notes || '']
        );

        const device = result.rows[0];

        // Socket.IO ile bildiri
        const io = req.app.get('io');
        if (io) io.emit('device:added', device);

        res.status(201).json(device);
    } catch (err) {
        console.error('Error adding device:', err);
        // MSSQL Constraint error code handling might differ (2627 for duplicate key)
        if (err.number === 2627 || err.code === '23505') {
            return res.status(409).json({ error: 'Device with this IP already exists' });
        }
        res.status(500).json({ error: 'Failed to add device' });
    }
});

// PUT /api/devices/:id — Cihaz güncelle
router.put('/:id', requireRole('operator'), async (req, res) => {
    try {
        const {
            hostname, ip_address, mac_address, department, os_name, username, notes,
            pc_type, device_manufacturer, device_model, serial_number,
            cpu_description, cpu_cores, ram_mb, storage_mb,
            monitor_model, monitor_serial, keyboard_model, keyboard_serial,
            mouse_model, mouse_serial, phone_model, phone_serial
        } = req.body;

        if (ip_address && !isValidIP(ip_address)) {
            return res.status(400).json({ error: 'Invalid IP address format' });
        }

        if (mac_address && !isValidMAC(mac_address)) {
            return res.status(400).json({ error: 'Invalid MAC address format' });
        }

        const parsedCpuCores = cpu_cores !== undefined && cpu_cores !== '' ? parseInt(cpu_cores, 10) : null;
        const parsedRamMb = ram_mb !== undefined && ram_mb !== '' ? parseInt(ram_mb, 10) : null;
        const parsedStorageMb = storage_mb !== undefined && storage_mb !== '' ? parseInt(storage_mb, 10) : null;

        const result = await pool.query(
            `UPDATE devices SET
                hostname = COALESCE($1, hostname),
                ip_address = COALESCE($2, ip_address),
                mac_address = COALESCE($3, mac_address),
                department = COALESCE($4, department),
                os_name = COALESCE($5, os_name),
                username = COALESCE($6, username),
                notes = COALESCE($7, notes),
                pc_type = COALESCE($8, pc_type),
                device_manufacturer = COALESCE($9, device_manufacturer),
                device_model = COALESCE($10, device_model),
                serial_number = COALESCE($11, serial_number),
                cpu_description = COALESCE($12, cpu_description),
                cpu_cores = COALESCE($13, cpu_cores),
                ram_mb = COALESCE($14, ram_mb),
                storage_mb = COALESCE($15, storage_mb),
                monitor_model = COALESCE($16, monitor_model),
                monitor_serial = COALESCE($17, monitor_serial),
                keyboard_model = COALESCE($18, keyboard_model),
                keyboard_serial = COALESCE($19, keyboard_serial),
                mouse_model = COALESCE($20, mouse_model),
                mouse_serial = COALESCE($21, mouse_serial),
                phone_model = COALESCE($22, phone_model),
                phone_serial = COALESCE($23, phone_serial),
                updated_at = GETDATE()
             OUTPUT INSERTED.*
             WHERE id = $24`,
            [
                hostname, ip_address, mac_address, department, os_name, username, notes,
                pc_type, device_manufacturer, device_model, serial_number,
                cpu_description, parsedCpuCores, parsedRamMb, parsedStorageMb,
                monitor_model, monitor_serial, keyboard_model, keyboard_serial,
                mouse_model, mouse_serial, phone_model, phone_serial,
                req.params.id
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        const device = result.rows[0];
        const io = req.app.get('io');
        if (io) io.emit('device:updated', device);

        res.json(device);
    } catch (err) {
        console.error('Error updating device:', err);
        res.status(500).json({ error: 'Failed to update device' });
    }
});

// DELETE /api/devices/:id — Cihaz sil
router.delete('/:id', requireRole('admin'), async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM devices WHERE id = $1', [req.params.id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        const io = req.app.get('io');
        if (io) io.emit('device:deleted', { id: parseInt(req.params.id) });

        res.json({ message: 'Device deleted', id: parseInt(req.params.id) });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete device' });
    }
});

// GET /api/devices/:id/logs — Durum logları
router.get('/:id/logs', async (req, res) => {
    try {
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
        const result = await pool.query(
            `SELECT TOP (${limit}) * FROM device_status_logs WHERE device_id = $1 ORDER BY checked_at DESC`,
            [req.params.id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

// GET /api/devices/:id/heartbeats — Son heartbeat'ler (zaman filtreli)
router.get('/:id/heartbeats', async (req, res) => {
    try {
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 500);
        const hours = parseInt(req.query.hours, 10) || 0;

        let query = `SELECT TOP (${limit}) * FROM heartbeats WHERE device_id = $1`;
        const params = [req.params.id];
        let paramIdx = 2;

        if (hours > 0) {
            query += ` AND last_seen > DATEADD(hour, -$${paramIdx}, GETDATE())`;
            params.push(hours);
            paramIdx++;
        }

        query += ` ORDER BY last_seen DESC`;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch heartbeats' });
    }
});

module.exports = router;
