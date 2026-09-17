import os
import datetime
from app.config import OUTPUT_DIR
from app.utils.file_utils import generate_unique_filename
from app.services.zip_services import create_zip_archive

TURKISH_CHAR_MAPPING = {
    'ç': 'c', 'Ç': 'C',
    'ğ': 'g', 'Ğ': 'G',
    'ı': 'i', 'İ': 'I',
    'ö': 'o', 'Ö': 'O',
    'ş': 's', 'Ş': 'S',
    'ü': 'u', 'Ü': 'U'
}

def map_turkish_chars(text: str) -> str:
    for tr, eng in TURKISH_CHAR_MAPPING.items():
        text = text.replace(tr, eng)
    return text

def calculate_new_filename(
    original_name: str,
    prefix: str = "",
    suffix: str = "",
    replace_spaces: bool = False,
    simplify_turkish: bool = False,
    case_mode: str = "none",
    index: int or None = None,
    add_date: bool = False
) -> str:
    base, ext = os.path.splitext(original_name)
    
    # 1. Simplify Turkish characters
    if simplify_turkish:
        base = map_turkish_chars(base)
        
    # 2. Case conversions
    # For Turkish-aware upper/lower, we handles basic cases. 
    # Map 'I' and 'i' properly if simplify_turkish was not applied
    if case_mode == "lower":
        base = base.lower()
    elif case_mode == "upper":
        base = base.upper()
        
    # 3. Replace spaces with underscore
    if replace_spaces:
        base = base.replace(" ", "_")
        
    # 4. Add sequence number (1-based index)
    if index is not None:
        base = f"{base}_{index:03d}"
        
    # 5. Add prefix & suffix
    new_base = f"{prefix}{base}{suffix}"
    
    # 6. Add date prefix (YYYY-MM-DD)
    if add_date:
        today_str = datetime.date.today().strftime("%Y-%m-%d")
        new_base = f"{today_str}_{new_base}"
        
    # Fallback to prevent empty files names
    if not new_base:
        new_base = "belge"
        
    return f"{new_base}{ext}"

def get_rename_preview(file_names: list[str], rules: dict) -> list[dict]:
    """
    Returns a preview list: [{"old_name": "...", "new_name": "..."}]
    """
    prefix = rules.get("prefix", "")
    suffix = rules.get("suffix", "")
    replace_spaces = rules.get("replace_spaces", False)
    simplify_turkish = rules.get("simplify_turkish", False)
    case_mode = rules.get("case_mode", "none")
    sequencing = rules.get("sequencing", False)
    add_date = rules.get("add_date", False)
    
    preview = []
    for idx, name in enumerate(file_names):
        seq_idx = (idx + 1) if sequencing else None
        new_name = calculate_new_filename(
            original_name=name,
            prefix=prefix,
            suffix=suffix,
            replace_spaces=replace_spaces,
            simplify_turkish=simplify_turkish,
            case_mode=case_mode,
            index=seq_idx,
            add_date=add_date
        )
        preview.append({
            "old_name": name,
            "new_name": new_name
        })
    return preview

def apply_bulk_rename(file_configs: list[dict], rules: dict) -> str:
    """
    Renames the uploaded files and packages them into a single ZIP archive.
    file_configs format: [{"path": str, "name": str}]
    """
    prefix = rules.get("prefix", "")
    suffix = rules.get("suffix", "")
    replace_spaces = rules.get("replace_spaces", False)
    simplify_turkish = rules.get("simplify_turkish", False)
    case_mode = rules.get("case_mode", "none")
    sequencing = rules.get("sequencing", False)
    add_date = rules.get("add_date", False)
    
    zip_items = []
    for idx, cfg in enumerate(file_configs):
        file_path = cfg["path"]
        orig_name = cfg["name"]
        
        seq_idx = (idx + 1) if sequencing else None
        new_name = calculate_new_filename(
            original_name=orig_name,
            prefix=prefix,
            suffix=suffix,
            replace_spaces=replace_spaces,
            simplify_turkish=simplify_turkish,
            case_mode=case_mode,
            index=seq_idx,
            add_date=add_date
        )
        zip_items.append({
            "path": file_path,
            "name": new_name
        })
        
    # Create ZIP archive from renamed paths
    return create_zip_archive(zip_items)
