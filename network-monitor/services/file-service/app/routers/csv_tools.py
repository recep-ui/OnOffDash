import os
import datetime
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Header, Depends
from app.utils.file_utils import save_upload_file
from app.services import csv_fixer_service
from app.utils import logger
from app.utils.auth import require_authenticated_user

router = APIRouter(prefix="/api/file-tools/csv", tags=["csv-tools"])

ALLOWED_CSV_EXTS = {'.csv', '.txt', '.log'}

def cleanup_file(path: str):
    if path and os.path.exists(path):
        try:
            os.remove(path)
        except Exception:
            pass

@router.post("/analyze")
async def analyze_csv_endpoint(
    file: UploadFile = File(...),
    user: dict = Depends(require_authenticated_user)
):
    user_id = user.get("id")
    created_at = datetime.datetime.now()
    file_path = None
    file_size = 0
    try:
        file_path = await save_upload_file(file, ALLOWED_CSV_EXTS)
        file_size = os.path.getsize(file_path)
        
        analysis = csv_fixer_service.analyze_csv_file(file_path)
        finished_at = datetime.datetime.now()
        
        logger.log_job(
            operation_type="csv_analyze",
            input_file_count=1,
            total_input_size=file_size,
            output_file_size=0,
            status="success",
            created_at=created_at,
            finished_at=finished_at,
            expires_at=created_at + datetime.timedelta(hours=1),
            error_message=None,
            user_id=user_id
        )
        return analysis
    except Exception as e:
        finished_at = datetime.datetime.now()
        logger.log_job(
            operation_type="csv_analyze",
            input_file_count=1,
            total_input_size=file_size,
            output_file_size=None,
            status="error",
            created_at=created_at,
            finished_at=finished_at,
            expires_at=None,
            error_message=str(e),
            user_id=user_id
        )
        raise HTTPException(status_code=500, detail="İşlem sırasında sunucu hatası oluştu.")
    finally:
        cleanup_file(file_path)

@router.post("/fix")
async def fix_csv_endpoint(
    file: UploadFile = File(...),
    in_delimiter: str = Form("auto"),
    out_delimiter: str = Form(";"),
    in_encoding: str = Form("auto"),
    out_encoding: str = Form("utf-8"),
    has_header: bool = Form(True),
    clean_empty_rows: bool = Form(True),
    clean_whitespace: bool = Form(True),
    export_bom: bool = Form(True),
    user: dict = Depends(require_authenticated_user)
):
    user_id = user.get("id")
    created_at = datetime.datetime.now()
    file_path = None
    file_size = 0
    try:
        file_path = await save_upload_file(file, ALLOWED_CSV_EXTS)
        file_size = os.path.getsize(file_path)
        
        output_path = csv_fixer_service.fix_csv_file(
            file_path=file_path,
            in_delimiter=in_delimiter,
            out_delimiter=out_delimiter,
            in_encoding=in_encoding,
            out_encoding=out_encoding,
            has_header=has_header,
            clean_empty_rows=clean_empty_rows,
            clean_whitespace=clean_whitespace,
            export_bom=export_bom,
            user_id=user_id
        )
        output_size = os.path.getsize(output_path)
        finished_at = datetime.datetime.now()
        
        logger.log_job(
            operation_type="csv_fix",
            input_file_count=1,
            total_input_size=file_size,
            output_file_size=output_size,
            status="success",
            created_at=created_at,
            finished_at=finished_at,
            expires_at=created_at + datetime.timedelta(hours=1),
            error_message=None,
            user_id=user_id
        )
        
        file_id = os.path.basename(output_path)
        return {
            "success": True,
            "file_id": file_id,
            "download_url": f"/api/file-tools/download/{file_id}"
        }
    except Exception as e:
        finished_at = datetime.datetime.now()
        logger.log_job(
            operation_type="csv_fix",
            input_file_count=1,
            total_input_size=file_size,
            output_file_size=None,
            status="error",
            created_at=created_at,
            finished_at=finished_at,
            expires_at=None,
            error_message=str(e),
            user_id=user_id
        )
        raise HTTPException(status_code=500, detail="İşlem sırasında sunucu hatası oluştu.")
    finally:
        cleanup_file(file_path)
