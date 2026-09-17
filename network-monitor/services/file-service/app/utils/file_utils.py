import os
import uuid
from fastapi import HTTPException, UploadFile
from app.config import TEMP_DIR, MAX_FILE_SIZE_BYTES

# Block executables or scripts to protect server
BLACKLISTED_EXTENSIONS = {
    '.exe', '.bat', '.cmd', '.ps1', '.msi', '.scr', '.vbs', 
    '.js', '.vbe', '.wsf', '.hta', '.jar', '.sh', '.py', '.pl'
}

def generate_unique_filename(extension: str) -> str:
    ext = extension.lstrip('.')
    return f"{uuid.uuid4()}.{ext}"

def is_safe_extension(filename: str, allowed_extensions: set[str] = None) -> bool:
    _, ext = os.path.splitext(filename.lower())
    if ext in BLACKLISTED_EXTENSIONS:
        return False
    if allowed_extensions is not None:
        return ext in allowed_extensions
    return True

async def save_upload_file(upload_file: UploadFile, allowed_extensions: set[str] = None) -> str:
    filename = upload_file.filename
    if not is_safe_extension(filename, allowed_extensions):
        raise HTTPException(
            status_code=400, 
            detail=f"Dosya tipi desteklenmiyor veya güvenlik nedeniyle engellendi: {filename}"
        )
    
    unique_name = generate_unique_filename(os.path.splitext(filename)[1])
    file_path = os.path.join(TEMP_DIR, unique_name)
    
    size = 0
    with open(file_path, "wb") as buffer:
        while chunk := await upload_file.read(8192):
            size += len(chunk)
            if size > MAX_FILE_SIZE_BYTES:
                buffer.close()
                if os.path.exists(file_path):
                    os.remove(file_path)
                raise HTTPException(
                    status_code=413, 
                    detail=f"Dosya boyutu belirlenen limiti aşıyor. Maksimum sınır {MAX_FILE_SIZE_BYTES // (1024*1024)}MB."
                )
            buffer.write(chunk)
            
    return file_path
