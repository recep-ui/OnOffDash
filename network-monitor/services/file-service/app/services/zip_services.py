import os
import zipfile
import re
from app.config import OUTPUT_DIR
from app.utils.file_utils import generate_unique_filename

def sanitize_filename(filename: str) -> str:
    """Sanitizes filename to prevent path traversal and remove unsafe characters."""
    # Extract only basename to prevent folder navigation (path traversal)
    base = os.path.basename(filename)
    
    # Remove control characters and strip leading/trailing spaces
    base = re.sub(r'[\x00-\x1f\x7f]', '', base).strip()
    
    # Replace unsafe characters like <, >, :, ", /, \, |, ?, * with underscores
    base = re.sub(r'[<>:"/\\|?*]', '_', base)
    
    # Ensure it's not empty, fallback if it is
    if not base or base in ('.', '..'):
        base = "dosya"
        
    return base

def create_zip_archive(
    file_configs: list[dict], # format: [{"path": str, "name": str}]
    compression_level: str = "normal",
    user_id: int or str or None = None
) -> str:
    # Resolve compression level
    # 0 = ZIP_STORED (no compression), 8 = ZIP_DEFLATED
    comp_type = zipfile.ZIP_DEFLATED
    
    if compression_level == "low":
        compress_level = 1
    elif compression_level == "high":
        compress_level = 9
    else:
        compress_level = 6 # normal default
        
    out_name = generate_unique_filename("zip", user_id=user_id)
    out_path = os.path.join(OUTPUT_DIR, out_name)
    
    try:
        with zipfile.ZipFile(
            out_path, 
            'w', 
            compression=comp_type, 
            compresslevel=compress_level
        ) as zip_f:
            added_names = set()
            for cfg in file_configs:
                file_path = cfg["path"]
                orig_name = cfg["name"]
                
                if os.path.exists(file_path):
                    # Sanitize filename
                    safe_name = sanitize_filename(orig_name)
                    
                    # Deduplicate name if same filename is uploaded twice
                    base_name, ext = os.path.splitext(safe_name)
                    counter = 1
                    dedup_name = safe_name
                    while dedup_name in added_names:
                        dedup_name = f"{base_name}_{counter}{ext}"
                        counter += 1
                        
                    added_names.add(dedup_name)
                    zip_f.write(file_path, arcname=dedup_name)
    except Exception as e:
        if os.path.exists(out_path):
            os.remove(out_path)
        raise ValueError(f"ZIP oluşturulamadı: {str(e)}")
        
    return out_path
