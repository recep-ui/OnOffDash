const ExcelJS = require('exceljs');
const { sanitizeRows, sanitizeCellValue } = require('./excelSanitizer');

/**
 * Robust Excel helper powered by ExcelJS to replace vulnerable xlsx (SheetJS).
 * Provides secure reading, writing, multi-sheet support, and automatic CWE-1236 formula sanitization.
 */

/**
 * Reads the first worksheet of an Excel buffer and returns an array of row objects.
 * Keys are taken from row 1 headers.
 */
async function readExcelRows(buffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet || worksheet.rowCount === 0) {
        return [];
    }

    const rows = [];
    let headers = [];

    worksheet.eachRow((row, rowNumber) => {
        // ExcelJS row.values is 1-indexed (index 0 is undefined or empty)
        const rawValues = Array.isArray(row.values) ? row.values.slice(1) : Object.values(row.values);

        if (rowNumber === 1) {
            headers = rawValues.map(h => (h !== null && h !== undefined ? String(h).trim() : ''));
        } else {
            const rowObj = {};
            let hasData = false;
            headers.forEach((h, idx) => {
                if (h) {
                    let cellVal = rawValues[idx];
                    if (cellVal !== null && cellVal !== undefined) {
                        if (typeof cellVal === 'object' && cellVal.text) {
                            cellVal = cellVal.text;
                        } else if (typeof cellVal === 'object' && cellVal.result !== undefined) {
                            cellVal = cellVal.result;
                        }
                        rowObj[h] = cellVal;
                        hasData = true;
                    } else {
                        rowObj[h] = '';
                    }
                }
            });
            if (hasData) {
                rows.push(rowObj);
            }
        }
    });

    return rows;
}

/**
 * Reads all worksheets from an Excel buffer and returns an array of sheets with array-of-arrays row data.
 * Format: [ { sheetName: '...', rows: [ [colA, colB, colC], ... ] } ]
 */
async function readExcelSheetsAoa(buffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const result = [];

    for (const ws of workbook.worksheets) {
        const sheetRows = [];
        ws.eachRow((row) => {
            const rawValues = Array.isArray(row.values) ? row.values.slice(1) : Object.values(row.values);
            const cleanValues = rawValues.map(val => {
                if (val === null || val === undefined) return '';
                if (typeof val === 'object' && val.text) return val.text;
                if (typeof val === 'object' && val.result !== undefined) return val.result;
                return val;
            });
            sheetRows.push(cleanValues);
        });
        result.push({
            sheetName: ws.name,
            rows: sheetRows
        });
    }

    return result;
}

/**
 * Creates an Excel workbook with a single sheet, sets headers, writes sanitized rows, and returns Buffer.
 */
async function createExcelSingleSheet(sheetName, dataRows) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(sheetName || 'Sayfa1');

    const cleanRows = sanitizeRows(dataRows || []);
    if (cleanRows.length > 0) {
        const keys = Object.keys(cleanRows[0]);
        worksheet.columns = keys.map(key => ({
            header: key,
            key: key,
            width: Math.max(key.length + 4, 15)
        }));

        cleanRows.forEach(row => {
            worksheet.addRow(row);
        });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
}

/**
 * Creates a multi-sheet Excel workbook from an object mapping sheet names to arrays of row arrays.
 * Format: { 'Bina A': [ ['DAHİLİ', 'İSİM', 'GÖREV'], ... ], 'Bina B': [ ... ] }
 */
async function createExcelMultiSheetAoa(sheetsMap) {
    const workbook = new ExcelJS.Workbook();

    const sheetNames = Object.keys(sheetsMap || {});
    if (sheetNames.length === 0) {
        workbook.addWorksheet('Rehber');
    } else {
        for (const name of sheetNames) {
            const cleanName = (name || 'Sheet').substring(0, 31).replace(/[\\/*?:[\]]/g, '_');
            const ws = workbook.addWorksheet(cleanName);
            const rows = sheetsMap[name] || [];
            for (const r of rows) {
                const cleanRow = (r || []).map(cell => sanitizeCellValue(cell));
                ws.addRow(cleanRow);
            }
        }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
}

module.exports = {
    readExcelRows,
    readExcelSheetsAoa,
    createExcelSingleSheet,
    createExcelMultiSheetAoa,
    ExcelJS
};
