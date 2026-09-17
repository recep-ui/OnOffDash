import os
import uuid
try:
    from fastapi import HTTPException, UploadFile
except ImportError:
    from app.utils.auth import HTTPException
    class UploadFile:
        pass

from app.config import TEMP_DIR, MAX_FILE_SIZE_BYTES

# Block executables or scripts to protect server
BLACKLISTED_EXTENSIONS = {
    '.exe', '.bat', '.cmd', '.ps1', '.msi', '.scr', '.vbs', 
    '.js', '.vbe', '.wsf', '.hta', '.jar', '.sh', '.py', '.pl'
}

def generate_unique_filename(extension: str, user_id: int | str = None) -> str:
    ext = extension.lstrip('.')
    if user_id is not None:
        return f"u{user_id}_{uuid.uuid4()}.{ext}"
    return f"{uuid.uuid4()}.{ext}"

def is_safe_extension(filename: str, allowed_extensions: set[str] = None) -> bool:
    _, ext = os.path.splitext(filename.lower())
    if ext in BLACKLISTED_EXTENSIONS:
        return False
    if allowed_extensions is not None:
        return ext in allowed_extensions
    return True

def check_file_ownership(safe_name: str, user_id: int | str = None, role: str = "") -> bool:
    """
    Verifies if the requesting user has permission to download safe_name.
    Files prefixed with 'u<owner_id>_' can only be accessed by owner_id or an admin.
    """
    if safe_name.startswith("u"):
        parts = safe_name.split("_", 1)
        if len(parts) > 1 and parts[0][1:].isdigit():
            owner_id = int(parts[0][1:])
            if role != "admin" and (user_id is None or owner_id != int(user_id)):
                return False
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
    first_chunk = True
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
            
            # Binary validation for plain text / CSV files (reject null bytes)
            if first_chunk:
                first_chunk = False
                ext = os.path.splitext(filename.lower())[1]
                if ext in ('.csv', '.txt', '.log') and b'\x00' in chunk:
                    buffer.close()
                    if os.path.exists(file_path):
                        os.remove(file_path)
                    raise HTTPException(
                        status_code=400,
                        detail="Geçersiz dosya formatı: Metin/CSV dosyası ikili (binary) veri içeremez."
                    )
            buffer.write(chunk)
            
    # Magic byte & integrity verification for image uploads
    ext = os.path.splitext(filename.lower())[1]
    if ext in ('.jpg', '.jpeg', '.png', '.webp'):
        try:
            from PIL import Image
            # Protect against decompression bomb attacks
            Image.MAX_IMAGE_PIXELS = 50_000_000
            with Image.open(file_path) as img:
                img.verify()
        except Exception as img_err:
            if os.path.exists(file_path):
                os.remove(file_path)
            raise HTTPException(
                status_code=400,
                detail=f"Geçersiz görsel dosyası veya bozuk içerik: {str(img_err)}"
            )

    return file_path
