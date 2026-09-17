import os
from charset_normalizer import detect
from app.config import OUTPUT_DIR
from app.utils.file_utils import generate_unique_filename
from app.services.csv_fixer_service import detect_file_encoding

def analyze_text_file(file_path: str) -> dict:
    encoding = detect_file_encoding(file_path)
    
    preview_text = ""
    try:
        with open(file_path, 'r', encoding=encoding, errors='replace') as f:
            # Read first 1000 characters for preview
            preview_text = f.read(1000)
    except Exception as e:
        raise ValueError(f"Metin dosyası okunamadı: {str(e)}")
        
    return {
        "success": True,
        "detected_encoding": encoding,
        "preview": preview_text
    }

def convert_text_encoding(
    file_path: str,
    in_encoding: str = "auto",
    out_encoding: str = "utf-8"
) -> str:
    # 1. Resolve input encoding
    if in_encoding == "auto":
        in_encoding = detect_file_encoding(file_path)
        
    # 2. Read contents
    try:
        with open(file_path, 'r', encoding=in_encoding, errors='replace') as f:
            content = f.read()
    except Exception as e:
        raise ValueError(f"Kaynak dosya okunamadı: {str(e)}")
        
    # 3. Write with target encoding
    out_name = generate_unique_filename("txt")
    out_path = os.path.join(OUTPUT_DIR, out_name)
    
    try:
        # Standardize target encoding names
        actual_out_encoding = out_encoding.lower()
        if actual_out_encoding == "utf-8 bom":
            actual_out_encoding = "utf-8-sig"
            
        with open(out_path, 'w', encoding=actual_out_encoding, errors='replace') as f:
            f.write(content)
    except Exception as e:
        if os.path.exists(out_path):
            os.remove(out_path)
        raise ValueError(f"Dosya kodlaması dönüştürülemedi: {str(e)}")
        
    return out_path
