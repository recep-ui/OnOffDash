const xlsx = require('xlsx');
const path = require('path');
const DIR_PATH = "C:\\Users\\TEST\\Desktop\\Yeni klasör (2)";
const file = "Bakım Tablosu.xlsx";

try {
    const workbook = xlsx.readFile(path.join(DIR_PATH, file));
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet);
    console.log("Total rows parsed:", rows.length);
    for (let i = 0; i < Math.min(10, rows.length); i++) {
        console.log(`Row ${i}:`, rows[i]);
    }
} catch (e) {
    console.error(e.message);
}
process.exit(0);
