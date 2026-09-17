/**
 * Sanitizes cell values to prevent CSV / Excel Formula Injection (CWE-1236).
 * Prepends a single quote to strings starting with '=', '+', '-', '@', '\t', or '\r'
 * ensuring Excel and LibreOffice Calc treat the value as text rather than a formula or macro.
 */
function sanitizeCellValue(val) {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') {
        if (/^[=+\-@\t\r]/.test(val) || /^[=+\-@\t\r]/.test(val.trim())) {
            return `'${val}`;
        }
    }
    return val;
}

/**
 * Sanitizes an object representing an Excel row.
 * @param {Object} row
 * @returns {Object} sanitized row
 */
function sanitizeRow(row) {
    if (!row || typeof row !== 'object') return row;
    const sanitized = {};
    for (const [key, val] of Object.entries(row)) {
        sanitized[key] = sanitizeCellValue(val);
    }
    return sanitized;
}

/**
 * Sanitizes an array of row objects.
 * @param {Array<Object>} rows
 * @returns {Array<Object>}
 */
function sanitizeRows(rows) {
    if (!Array.isArray(rows)) return [];
    return rows.map(sanitizeRow);
}

module.exports = {
    sanitizeCellValue,
    sanitizeRow,
    sanitizeRows
};
