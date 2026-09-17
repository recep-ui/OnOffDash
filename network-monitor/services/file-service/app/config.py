import os

# Maximum file size (Default: 50MB)
MAX_FILE_SIZE_MB = int(os.getenv("FILE_TOOLS_MAX_FILE_SIZE_MB", "50"))
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

# TTL for temp/output files (Default: 60 minutes)
TTL_MINUTES = int(os.getenv("FILE_TOOLS_TTL_MINUTES", "60"))

# Log Mode: none | jsonl | database (Default: jsonl)
LOG_MODE = os.getenv("FILE_TOOLS_LOG_MODE", "jsonl").lower()

# Max files in batch operations (Default: 50)
MAX_BATCH_FILES = int(os.getenv("FILE_TOOLS_MAX_BATCH_FILES", "50"))

# Storage paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMP_DIR = os.getenv("TEMP_DIR", "/storage/file-tools/temp")
OUTPUT_DIR = os.getenv("OUTPUT_DIR", "/storage/file-tools/output")
LOGS_DIR = os.getenv("LOGS_DIR", "/storage/logs")

# Fallback for local run without docker
if not os.path.exists("/storage"):
    if TEMP_DIR == "/storage/file-tools/temp":
        TEMP_DIR = os.path.join(BASE_DIR, "storage", "file-tools", "temp")
    if OUTPUT_DIR == "/storage/file-tools/output":
        OUTPUT_DIR = os.path.join(BASE_DIR, "storage", "file-tools", "output")
    if LOGS_DIR == "/storage/logs":
        LOGS_DIR = os.path.join(BASE_DIR, "storage", "logs")
else:
    # Ensure standard paths inside docker environment
    TEMP_DIR = "/storage/file-tools/temp"
    OUTPUT_DIR = "/storage/file-tools/output"
    LOGS_DIR = "/storage/logs"

# Ensure all directories exist
os.makedirs(TEMP_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)
if LOG_MODE == "jsonl":
    os.makedirs(LOGS_DIR, exist_ok=True)

# Database connection credentials
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "1433")
DB_NAME = os.getenv("DB_NAME", "network_monitor")
DB_USER = os.getenv("DB_USER", "sa")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
JWT_SECRET = os.getenv("JWT_SECRET", "on-off-dash-secret-key-2026")

# Local run fallback to parse backend's .env for DB configuration
if DB_HOST == "localhost" and DB_PASSWORD == "":
    backend_env_path = os.path.join(os.path.dirname(os.path.dirname(BASE_DIR)), "backend", ".env")
    if os.path.exists(backend_env_path):
        try:
            with open(backend_env_path, "r", encoding="utf-8") as env_f:
                for line in env_f:
                    if "=" in line:
                        k, v = line.strip().split("=", 1)
                        if k == "DB_USER":
                            DB_USER = v
                        elif k == "DB_PASSWORD":
                            DB_PASSWORD = v
                        elif k == "DB_NAME":
                            DB_NAME = v
                        elif k == "DB_PORT":
                            DB_PORT = v
        except Exception:
            pass
