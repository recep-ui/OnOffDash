import os
from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from app.config import LOG_MODE, OUTPUT_DIR
from app.routers import image_tools, csv_tools, text_tools, zip_tools, rename_tools
from app.utils.cleanup import start_cleanup_daemon
from app.utils.logger import ensure_db_table
from app.utils.auth import require_authenticated_user

app = FastAPI(
    title="File Tools Service",
    description="Microservice for image manipulation, CSV fixer, text trans-coding, zipping and bulk renaming.",
    version="1.0.0"
)

# CORS setup
is_prod = os.getenv("APP_ENV") == "production" or os.getenv("NODE_ENV") == "production"
cors_origins_str = os.getenv("CORS_ORIGINS")

if is_prod:
    if not cors_origins_str or not cors_origins_str.strip():
        raise RuntimeError("FATAL: CORS_ORIGINS environment variable is mandatory in production.")
    origins = [o.strip() for o in cors_origins_str.split(",") if o.strip()]
    if "*" in origins:
        raise RuntimeError("FATAL: Wildcard CORS origin (*) is forbidden in production.")
    allow_credentials = True
else:
    if not cors_origins_str or cors_origins_str == "*":
        origins = ["*"]
        allow_credentials = False  # Wildcards must never be combined with credentials
    else:
        origins = [o.strip() for o in cors_origins_str.split(",") if o.strip()]
        allow_credentials = True

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(image_tools.router)
app.include_router(csv_tools.router)
app.include_router(text_tools.router)
app.include_router(zip_tools.router)
app.include_router(rename_tools.router)

@app.on_event("startup")
def startup_event():
    # 1. Start background file cleanup daemon
    start_cleanup_daemon()
    
    # 2. Verify database tables if mode is database
    if LOG_MODE == "database":
        ensure_db_table()

@app.get("/api/file-tools/health")
def health_check():
    return {
        "status": "ok", 
        "service": "file-service", 
        "log_mode": LOG_MODE
    }

@app.get("/api/file-tools/download/{file_id}")
async def download_file_endpoint(file_id: str, user: dict = Depends(require_authenticated_user)):
    """
    Serves generated output files securely. Prevents path traversal and enforces ownership.
    """
    from pathlib import Path

    if ".." in file_id or "/" in file_id or "\\" in file_id or "\0" in file_id:
        raise HTTPException(status_code=400, detail="Geçersiz dosya yolu.")

    try:
        base_dir = Path(OUTPUT_DIR).resolve()
        candidate = (base_dir / Path(file_id).name).resolve()
        candidate.relative_to(base_dir)
        if os.path.commonpath([str(base_dir), str(candidate)]) != str(base_dir):
            raise HTTPException(status_code=400, detail="Geçersiz dosya yolu.")
    except (ValueError, RuntimeError):
        raise HTTPException(status_code=400, detail="Geçersiz dosya yolu.")

    file_path = str(candidate)
    safe_name = candidate.name
    
    if not os.path.exists(file_path) or not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="Dosya bulunamadı veya süresi doldu.")
        
    user_id = user.get("id")
    role = user.get("role", "")
    from app.utils.file_utils import check_file_ownership
    if not check_file_ownership(safe_name, user_id=user_id, role=role):
        raise HTTPException(status_code=403, detail="Bu dosyayı indirme yetkiniz yok.")

    return FileResponse(
        file_path,
        media_type="application/octet-stream",
        filename=safe_name
    )
