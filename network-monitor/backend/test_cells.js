const xlsx = require('xlsx');
const path = require('path');

const EXCEL_PATH = "C:\\Users\\TEST\\Desktop\\Yeni klasör (2)\\Donanım & İşletim Sistemi  Envanter Bilgisi Tüm.xlsx";

try {
    const workbook = xlsx.readFile(EXCEL_PATH);
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    console.log("Sheet range:", worksheet['!ref']);
    
    const rawRows = xlsx.utils.sheet_to_json(worksheet);
    console.log("Total rows in Excel:", rawRows.length);
    
    if (rawRows.length > 0) {
        console.log("First row raw keys:", Object.keys(rawRows[0]));
        console.log("First row data:", rawRows[0]);
        console.log("Second row data:", rawRows[1]);
        
        // Let's print clean normalized keys for the first row
        const cleanKeys = Object.keys(rawRows[0]).map(k => k.toLowerCase().replace(/\s+/g, ' ').trim());
        console.log("Normalized keys:", cleanKeys);
    }
} catch (e) {
    console.error(e.message);
}
process.exit(0);
