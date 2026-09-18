import os
import time
import threading
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import pdf_tools
from app.utils.file_utils import TEMP_DIR, OUTPUT_DIR

app = FastAPI(
    title="PDF Tools Service",
    description="Microservice for merging, splitting, reordering, compressing and watermarking PDF files.",
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

# Register routes
app.include_router(pdf_tools.router)

def cleanup_daemon_loop():
    """
    Runs in a background thread. Periodically checks TEMP_DIR and OUTPUT_DIR,
    and removes any files older than 1 hour.
    """
    print("PDF Service: Started cleanup daemon loop.", flush=True)
    while True:
        try:
            now = time.time()
            one_hour_ago = now - 3600
            
            for folder in [TEMP_DIR, OUTPUT_DIR]:
                if not os.path.exists(folder):
                    continue
                
                for filename in os.listdir(folder):
                    file_path = os.path.join(folder, filename)
                    if os.path.isfile(file_path):
                        mtime = os.path.getmtime(file_path)
                        if mtime < one_hour_ago:
                            try:
                                os.remove(file_path)
                                print(f"PDF Service: Cleaned up expired file {file_path}", flush=True)
                            except Exception as e:
                                print(f"PDF Service: Error cleaning up file {file_path}: {e}", flush=True)
        except Exception as ex:
            print(f"PDF Service: Exception in cleanup daemon: {ex}", flush=True)
            
        time.sleep(600) # Check every 10 minutes

@app.on_event("startup")
def startup_event():
    # Start cleanup thread
    cleanup_thread = threading.Thread(target=cleanup_daemon_loop, daemon=True)
    cleanup_thread.start()

@app.get("/api/pdf/health")
def health_check():
    return {"status": "ok", "service": "pdf-service"}
