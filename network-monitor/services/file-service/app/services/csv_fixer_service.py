import os
import csv
from charset_normalizer import detect
from app.config import OUTPUT_DIR
from app.utils.file_utils import generate_unique_filename

def detect_file_encoding(file_path: str) -> str:
    """Detects file encoding using charset-normalizer."""
    try:
        with open(file_path, 'rb') as f:
            # Read first 32KB to analyze
            raw = f.read(32768)
            # Check for UTF-8 BOM explicitly
            if raw.startswith(b'\xef\xbb\xbf'):
                return 'utf-8-sig'
            res = detect(raw)
            encoding = res.get('encoding', 'utf-8')
            # If detected as ascii, default to utf-8
            if encoding == 'ascii':
                return 'utf-8'
            return encoding
    except Exception:
        return 'utf-8'

def detect_csv_delimiter(file_path: str, encoding: str) -> str:
    """Detects CSV delimiter based on character counts in the first few lines."""
    delimiters = [';', ',', '\t', '|']
    counts = {d: 0 for d in delimiters}
    
    try:
        with open(file_path, 'r', encoding=encoding, errors='ignore') as f:
            for i in range(5): # Check first 5 lines
                line = f.readline()
                if not line:
                    break
                for d in delimiters:
                    counts[d] += line.count(d)
        
        # Select the one with the maximum count
        detected = max(counts, key=counts.get)
        if counts[detected] > 0:
            return detected
        return ';' # default fallback (standard for Turkish Excel)
    except Exception:
        return ';'

def analyze_csv_file(file_path: str) -> dict:
    encoding = detect_file_encoding(file_path)
    delimiter = detect_csv_delimiter(file_path, encoding)
    
    headers = []
    preview_rows = []
    row_count = 0
    col_count = 0
    warnings = []
    
    try:
        # Check if the file is readable with the detected encoding
        with open(file_path, 'r', encoding=encoding) as f:
            # Just verify if we can read the file
            f.read(1024)
    except UnicodeDecodeError:
        # Fallback to windows-1254 (very common for Turkish Excel errors)
        encoding = 'windows-1254'
        warnings.append("Otomatik kodlama tespiti başarısız oldu, Türkçe Excel uyumlu Windows-1254 denendi.")

    try:
        with open(file_path, 'r', encoding=encoding, errors='replace') as f:
            reader = csv.reader(f, delimiter=delimiter)
            
            # Read lines
            all_rows = []
            for row in reader:
                all_rows.append(row)
                row_count += 1
            
            if len(all_rows) > 0:
                headers = all_rows[0]
                col_count = len(headers)
                
                # Keep first 10 rows for preview (excluding header if any, or including first row)
                preview_rows = all_rows[0:10]
    except Exception as e:
        raise ValueError(f"CSV analizi başarısız oldu: {str(e)}")
        
    return {
        "success": True,
        "detected_encoding": encoding,
        "detected_delimiter": delimiter,
        "headers": headers,
        "preview_rows": preview_rows,
        "row_count": row_count,
        "col_count": col_count,
        "warnings": warnings
    }

def fix_csv_file(
    file_path: str,
    in_delimiter: str = "auto",
    out_delimiter: str = ";",
    in_encoding: str = "auto",
    out_encoding: str = "utf-8",
    has_header: bool = True,
    clean_empty_rows: bool = True,
    clean_whitespace: bool = True,
    export_bom: bool = True,
    user_id: int or str or None = None
) -> str:
    # 1. Resolve input encoding
    if in_encoding == "auto":
        in_encoding = detect_file_encoding(file_path)
        
    # 2. Resolve input delimiter
    if in_delimiter == "auto":
        in_delimiter = detect_csv_delimiter(file_path, in_encoding)
        
    # 3. Read and fix rows
    fixed_rows = []
    try:
        with open(file_path, 'r', encoding=in_encoding, errors='replace') as f:
            reader = csv.reader(f, delimiter=in_delimiter)
            for row in reader:
                # Clean empty rows
                if clean_empty_rows and not any(cell.strip() for cell in row):
                    continue
                
                # Clean leading/trailing spaces
                if clean_whitespace:
                    processed_row = [cell.strip() for cell in row]
                else:
                    processed_row = row
                    
                fixed_rows.append(processed_row)
    except Exception as e:
        raise ValueError(f"Kaynak dosya okunamadı: {str(e)}")

    # 4. Resolve output encoding
    actual_out_encoding = out_encoding
    if out_encoding == "utf-8" and export_bom:
        # Use utf-8-sig to write with BOM
        actual_out_encoding = "utf-8-sig"
    elif out_encoding == "utf-8-sig":
        actual_out_encoding = "utf-8-sig"
        
    out_name = generate_unique_filename("csv", user_id=user_id)
    out_path = os.path.join(OUTPUT_DIR, out_name)
    
    try:
        with open(out_path, 'w', encoding=actual_out_encoding, newline='') as f:
            writer = csv.writer(f, delimiter=out_delimiter)
            writer.writerows(fixed_rows)
    except Exception as e:
        if os.path.exists(out_path):
            os.remove(out_path)
        raise ValueError(f"Düzeltilmiş dosya yazılamadı: {str(e)}")
        
    return out_path
