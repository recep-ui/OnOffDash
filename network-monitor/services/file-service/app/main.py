import os
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from app.config import LOG_MODE, OUTPUT_DIR
from app.routers import image_tools, csv_tools, text_tools, zip_tools, rename_tools
from app.utils.cleanup import start_cleanup_daemon
from app.utils.logger import ensure_db_table

app = FastAPI(
    title="File Tools Service",
    description="Microservice for image manipulation, CSV fixer, text trans-coding, zipping and bulk renaming.",
    version="1.0.0"
)

# CORS setup
cors_origins_str = os.getenv("CORS_ORIGINS", "*")
if cors_origins_str == "*":
    origins = ["*"]
else:
    origins = [o.strip() for o in cors_origins_str.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
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
async def download_file_endpoint(file_id: str):
    """
    Serves generated output files securely. Prevents path traversal.
    """
    safe_name = os.path.basename(file_id)
    file_path = os.path.join(OUTPUT_DIR, safe_name)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Dosya bulunamadı veya süresi doldu.")
        
    return FileResponse(
        file_path,
        media_type="application/octet-stream",
        filename=safe_name
    )
