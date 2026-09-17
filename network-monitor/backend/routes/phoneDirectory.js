const express = require('express');
const router = express.Router();
const { pool } = require('../db/connection');
const xlsx = require('xlsx');

// GET /api/phone-directory - Tüm rehberi listele
router.get('/', async (req, res) => {
    try {
        const { building, department, search } = req.query;

        let query = 'SELECT * FROM phone_directory';
        const conditions = [];
        const params = [];
        let paramIndex = 1;

        if (building) {
            conditions.push(`building = $${paramIndex++}`);
            params.push(building);
        }
        if (department) {
            conditions.push(`department = $${paramIndex++}`);
            params.push(department);
        }
        if (search) {
            conditions.push(`(name LIKE $${paramIndex} OR extension LIKE $${paramIndex} OR job_title LIKE $${paramIndex})`);
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY building ASC, department ASC, id ASC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching phone directory:', err);
        res.status(500).json({ error: 'Rehber verileri alınırken bir hata oluştu.' });
    }
});

// GET /api/phone-directory/export - Tüm rehberi Excel olarak dışa aktar
router.get('/export', async (req, res) => {
    try {
        // Tüm rehberi bina, departman ve isme göre sıralı getir
        const query = 'SELECT * FROM phone_directory ORDER BY building ASC, department ASC, id ASC';
        const result = await pool.query(query);
        const rows = result.rows;

        // Binalara göre satırları grupla
        const buildingsData = {};
        for (const row of rows) {
            const building = row.building || 'DİĞER';
            if (!buildingsData[building]) {
                buildingsData[building] = [];
            }
            buildingsData[building].push(row);
        }

        const wb = xlsx.utils.book_new();

        // Kayıt yoksa boş sayfa üret
        if (Object.keys(buildingsData).length === 0) {
            const ws = xlsx.utils.json_to_sheet([]);
            xlsx.utils.book_append_sheet(wb, ws, "Rehber");
        } else {
            // Her bina için bir sekme oluştur
            for (const building of Object.keys(buildingsData)) {
                const buildingEntries = buildingsData[building];
                const sheetRows = [];
                
                // Ana sütun başlığı
                sheetRows.push(['DAHİLİ', 'İSİM SOY İSİM', 'GÖREV TANIMI']);

                // Departmanlara göre gruplama yap
                const depts = {};
                const generalEntries = [];
                for (const entry of buildingEntries) {
                    if (entry.department && entry.department !== 'GENEL') {
                        if (!depts[entry.department]) {
                            depts[entry.department] = [];
                        }
                        depts[entry.department].push(entry);
                    } else {
                        generalEntries.push(entry);
                    }
                }

                // Departmansız genel kayıtları en üste yaz
                for (const entry of generalEntries) {
                    sheetRows.push([entry.extension || '', entry.name || '', entry.job_title || '']);
                }

                // Her departman grubu için başlık ve kayıtları ekle
                for (const dept of Object.keys(depts)) {
                    if (sheetRows.length > 1) {
                        sheetRows.push(['', '', '']); // Boş satır
                    }
                    sheetRows.push(['', dept, '']); // Departman Başlığı (Sarı satıra denk gelen)
                    sheetRows.push(['DAHİLİ', 'İSİM SOY İSİM', 'GÖREV TANIMI']); // Sütun Başlığı
                    
                    for (const entry of depts[dept]) {
                        sheetRows.push([entry.extension || '', entry.name || '', entry.job_title || '']);
                    }
                }

                const ws = xlsx.utils.aoa_to_sheet(sheetRows);
                xlsx.utils.book_append_sheet(wb, ws, building.substring(0, 31));
            }
        }

        const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
        
        res.setHeader('Content-Disposition', 'attachment; filename="Dahili_Rehber_Export.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);
    } catch (err) {
        console.error('Error exporting phone directory:', err);
        res.status(500).json({ error: 'Rehber dışa aktarılırken bir hata oluştu.' });
    }
});

// POST /api/phone-directory - Yeni kayıt ekle
router.post('/', async (req, res) => {
    try {
        if (req.user.role === 'viewer') {
            return res.status(403).json({ error: 'Bu işlem için yetkiniz bulunmamaktadır.' });
        }

        const { building, department, extension, name, job_title } = req.body;
        if (!building || !name) {
            return res.status(400).json({ error: 'Bina ve isim alanları zorunludur.' });
        }

        const query = `
            INSERT INTO phone_directory (building, department, extension, name, job_title)
            VALUES ($1, $2, $3, $4, $5)
        `;
        await pool.query(query, [building, department || '', extension || '', name, job_title || '']);

        res.status(201).json({ message: 'Kayıt başarıyla oluşturuldu.' });
    } catch (err) {
        console.error('Error creating phone directory entry:', err);
        res.status(500).json({ error: 'Kayıt eklenirken bir hata oluştu.' });
    }
});

// PUT /api/phone-directory/:id - Kayıt güncelle
router.put('/:id', async (req, res) => {
    try {
        if (req.user.role === 'viewer') {
            return res.status(403).json({ error: 'Bu işlem için yetkiniz bulunmamaktadır.' });
        }

        const { id } = req.params;
        const { building, department, extension, name, job_title } = req.body;

        if (!building || !name) {
            return res.status(400).json({ error: 'Bina ve isim alanları zorunludur.' });
        }

        const query = `
            UPDATE phone_directory
            SET building = $1, department = $2, extension = $3, name = $4, job_title = $5, updated_at = GETDATE()
            WHERE id = $6
        `;
        await pool.query(query, [building, department || '', extension || '', name, job_title || '', id]);

        res.json({ message: 'Kayıt başarıyla güncellendi.' });
    } catch (err) {
        console.error('Error updating phone directory entry:', err);
        res.status(500).json({ error: 'Kayıt güncellenirken bir hata oluştu.' });
    }
});

// DELETE /api/phone-directory/:id - Kayıt sil
router.delete('/:id', async (req, res) => {
    try {
        if (req.user.role === 'viewer') {
            return res.status(403).json({ error: 'Bu işlem için yetkiniz bulunmamaktadır.' });
        }

        const { id } = req.params;
        const query = 'DELETE FROM phone_directory WHERE id = $1';
        await pool.query(query, [id]);

        res.json({ message: 'Kayıt başarıyla silindi.' });
    } catch (err) {
        console.error('Error deleting phone directory entry:', err);
        res.status(500).json({ error: 'Kayıt silinirken bir hata oluştu.' });
    }
});

// POST /api/phone-directory/import - Excel rehberini aktar
router.post('/import', async (req, res) => {
    const client = await pool.connect();
    try {
        if (req.user.role === 'viewer') {
            return res.status(403).json({ error: 'Bu işlem için yetkiniz bulunmamaktadır.' });
        }

        const { fileData } = req.body;
        if (!fileData) {
            return res.status(400).json({ error: 'fileData (Base64) gereklidir.' });
        }

        const buffer = Buffer.from(fileData, 'base64');
        const workbook = xlsx.read(buffer, { type: 'buffer' });

        await client.query('BEGIN');
        
        // Önce eski veriyi temizle
        await client.query('DELETE FROM phone_directory');

        let insertCount = 0;

        for (const sheetName of workbook.SheetNames) {
            const worksheet = workbook.Sheets[sheetName];
            const rows = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
            
            let currentDepartment = '';

            for (const row of rows) {
                if (!row || row.length === 0) continue;

                const colA = row[0] !== undefined ? String(row[0]).trim() : '';
                const colB = row[1] !== undefined ? String(row[1]).trim() : '';
                const colC = row[2] !== undefined ? String(row[2]).trim() : '';

                if (!colA && !colB && !colC) continue;

                const lowerA = colA.toLowerCase();
                const lowerB = colB.toLowerCase();
                const lowerC = colC.toLowerCase();

                // Başlık satırlarını atla
                if (lowerA.includes('dahili') || lowerB.includes('isim soy') || lowerC.includes('görev tanımı') || lowerC.includes('gorev tanimi')) {
                    continue;
                }

                // Sadece B hücresi doluysa, A ve C boşsa -> Departman başlığıdır
                if (colB && !colA && !colC) {
                    currentDepartment = colB;
                    continue;
                }

                // Geçerli bir kayıt
                if (colB || colA) {
                    if (lowerB === 'i̇sim soy i̇si̇m' || lowerB === 'isim soy isim') {
                        continue;
                    }

                    await client.query(
                        `INSERT INTO phone_directory (building, department, extension, name, job_title)
                         VALUES ($1, $2, $3, $4, $5)`,
                        [sheetName, currentDepartment || 'GENEL', colA, colB || '-', colC]
                    );
                    insertCount++;
                }
            }
        }

        await client.query('COMMIT');
        res.json({ message: 'Excel başarıyla içe aktarıldı.', count: insertCount });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error importing phone directory:', err);
        res.status(500).json({ error: 'Excel aktarılırken hata oluştu: ' + err.message });
    } finally {
        client.release();
    }
});

module.exports = router;
