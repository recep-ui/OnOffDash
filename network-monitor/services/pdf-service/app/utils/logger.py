import os
import json
import datetime
import base64
import pymssql
from app.utils.file_utils import BASE_DIR

# Log Mode: none | database | jsonl (default: jsonl)
PDF_LOG_MODE = os.getenv("PDF_LOG_MODE", "jsonl").lower()

# Resolve logs directory path
LOGS_DIR = os.getenv("LOGS_DIR", "/storage/logs")
if not os.path.exists("/storage"):
    if LOGS_DIR == "/storage/logs":
        LOGS_DIR = os.path.join(BASE_DIR, "storage", "logs")
else:
    LOGS_DIR = "/storage/logs"

# Ensure log directory exists if mode is jsonl
if PDF_LOG_MODE == "jsonl":
    os.makedirs(LOGS_DIR, exist_ok=True)

# Database connection credentials
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "1433")
DB_NAME = os.getenv("DB_NAME", "network_monitor")
DB_USER = os.getenv("DB_USER", "app_user")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")


_db_initialized = False

def get_db_connection():
    # Since DB_PORT is typically configured as a separate env variable, we specify server as host:port
    server = f"{DB_HOST},{DB_PORT}"
    return pymssql.connect(
        server=server,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        autocommit=True
    )

def ensure_db_table():
    global _db_initialized
    if _db_initialized:
        return
    
    if PDF_LOG_MODE != "database":
        return
        
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'pdf_jobs')
            BEGIN
                CREATE TABLE pdf_jobs (
                    id                INT IDENTITY(1,1) PRIMARY KEY,
                    user_id           INT NULL,
                    operation_type    VARCHAR(50) NOT NULL,
                    input_file_count  INT NOT NULL,
                    total_input_size  BIGINT NOT NULL,
                    output_file_size  BIGINT NULL,
                    status            VARCHAR(20) NOT NULL,
                    created_at        DATETIME2 NOT NULL,
                    finished_at       DATETIME2 NULL,
                    expires_at        DATETIME2 NULL,
                    error_message     NVARCHAR(MAX) NULL
                );
            END
        """)
        conn.close()
        _db_initialized = True
        print("PDF Service: Database logger table 'pdf_jobs' verified.", flush=True)
    except Exception as e:
        print(f"PDF Service: Database table initialization failed: {e}", flush=True)

def get_user_id_from_token(auth_header: str) -> int or None:
    """Extracts user_id from Bearer token without third-party JWT library dependency."""
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ")[1]
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        payload_b64 = parts[1]
        payload_b64 += "=" * ((4 - len(payload_b64) % 4) % 4)
        payload_json = base64.b64decode(payload_b64).decode("utf-8")
        payload = json.loads(payload_json)
        return payload.get("id")
    except Exception:
        return None

def log_job(
    operation_type: str,
    input_file_count: int,
    total_input_size: int,
    output_file_size: int or None,
    status: str,
    created_at: datetime.datetime,
    finished_at: datetime.datetime or None,
    expires_at: datetime.datetime or None,
    error_message: str or None,
    user_id: int or None = None
):
    """
    Logs job details depending on PDF_LOG_MODE.
    """
    if PDF_LOG_MODE == "none":
        return

    # 1. Log to JSONL
    if PDF_LOG_MODE == "jsonl":
        try:
            today_str = datetime.date.today().strftime("%Y-%m-%d")
            log_file = os.path.join(LOGS_DIR, f"pdf_jobs_{today_str}.jsonl")
            
            log_data = {
                "timestamp": datetime.datetime.now().isoformat(),
                "user_id": user_id,
                "operation_type": operation_type,
                "input_file_count": input_file_count,
                "total_input_size": total_input_size,
                "output_file_size": output_file_size,
                "status": status,
                "created_at": created_at.isoformat() if created_at else None,
                "finished_at": finished_at.isoformat() if finished_at else None,
                "expires_at": expires_at.isoformat() if expires_at else None,
                "error_message": error_message
            }
            
            with open(log_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(log_data, ensure_ascii=False) + "\n")
        except Exception as e:
            print(f"PDF Service: Failed to write to JSONL log: {e}", flush=True)
            
    # 2. Log to Database
    elif PDF_LOG_MODE == "database":
        try:
            ensure_db_table()
            conn = get_db_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                INSERT INTO pdf_jobs (
                    user_id, operation_type, input_file_count, total_input_size,
                    output_file_size, status, created_at, finished_at, expires_at, error_message
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                user_id,
                operation_type,
                input_file_count,
                total_input_size,
                output_file_size,
                status,
                created_at,
                finished_at,
                expires_at,
                error_message
            ))
            conn.close()
        except Exception as e:
            print(f"PDF Service: Failed to log job to database: {e}", flush=True)
