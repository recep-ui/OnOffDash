import os
import uuid
import shutil
try:
    from fastapi import HTTPException, UploadFile
except ImportError:
    class HTTPException(Exception):
        def __init__(self, status_code=500, detail=""):
            self.status_code = status_code
            self.detail = detail
            super().__init__(f"{status_code}: {detail}")
    class UploadFile:
        pass

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TEMP_DIR = os.getenv("TEMP_DIR", "/storage/pdf-temp")
OUTPUT_DIR = os.getenv("OUTPUT_DIR", "/storage/pdf-output")

# Fallback for local run without docker
if not os.path.exists("/storage"):
    if TEMP_DIR == "/storage/pdf-temp":
        TEMP_DIR = os.path.join(BASE_DIR, "storage", "pdf-temp")
    if OUTPUT_DIR == "/storage/pdf-output":
        OUTPUT_DIR = os.path.join(BASE_DIR, "storage", "pdf-output")
else:
    # Ensure they exist inside docker directory structure
    TEMP_DIR = "/storage/pdf-temp"
    OUTPUT_DIR = "/storage/pdf-output"

os.makedirs(TEMP_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE_MB", "50")) * 1024 * 1024

def generate_unique_filename(extension: str = "pdf", user_id: int | str = None) -> str:
    if user_id is not None:
        return f"u{user_id}_{uuid.uuid4()}.{extension}"
    return f"{uuid.uuid4()}.{extension}"

async def save_upload_file(upload_file: UploadFile) -> str:
    # Verify PDF content type or extension
    if not upload_file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed.")
    
    unique_name = generate_unique_filename("pdf")
    file_path = os.path.join(TEMP_DIR, unique_name)
    
    # Read and validate size and signature
    size = 0
    first_chunk = True
    
    with open(file_path, "wb") as buffer:
        while chunk := await upload_file.read(8192):
            size += len(chunk)
            if size > MAX_FILE_SIZE:
                # Clean up partially written file
                buffer.close()
                if os.path.exists(file_path):
                    os.remove(file_path)
                raise HTTPException(status_code=413, detail=f"File exceeds maximum size of {MAX_FILE_SIZE // (1024*1024)}MB.")
            
            if first_chunk:
                first_chunk = False
                # Validate PDF signature (%PDF)
                if not chunk.startswith(b"%PDF"):
                    buffer.close()
                    if os.path.exists(file_path):
                        os.remove(file_path)
                    raise HTTPException(status_code=400, detail="Invalid PDF file signature.")
            
            buffer.write(chunk)
            
    return file_path
