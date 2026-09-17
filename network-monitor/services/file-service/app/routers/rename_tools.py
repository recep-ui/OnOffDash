import os
import json
import datetime
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Header, Depends
from pydantic import BaseModel
from app.utils.file_utils import save_upload_file
from app.services import rename_services
from app.utils import logger
from app.config import MAX_BATCH_FILES
from app.utils.auth import require_authenticated_user

router = APIRouter(prefix="/api/file-tools/rename", tags=["rename-tools"])

class PreviewRequest(BaseModel):
    filenames: list[str]
    rules: dict

def cleanup_file(path: str):
    if path and os.path.exists(path):
        try:
            os.remove(path)
        except Exception:
            pass

@router.post("/preview")
async def rename_preview_endpoint(request: PreviewRequest, user: dict = Depends(require_authenticated_user)):
    try:
        preview = rename_services.get_rename_preview(
            file_names=request.filenames,
            rules=request.rules
        )
        return {
            "success": True,
            "preview": preview
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/apply")
async def rename_apply_endpoint(
    files: list[UploadFile] = File(...),
    rules: str = Form(...), # JSON string of rules
    user: dict = Depends(require_authenticated_user)
):
    if len(files) == 0:
        raise HTTPException(status_code=400, detail="En az bir dosya yüklemelisiniz.")
    if len(files) > MAX_BATCH_FILES:
        raise HTTPException(status_code=400, detail=f"Tek seferde en fazla {MAX_BATCH_FILES} dosya isimlendirebilirsiniz.")
        
    try:
        rules_dict = json.loads(rules)
    except Exception:
        raise HTTPException(status_code=400, detail="Kurallar geçerli bir JSON objesi olmalıdır.")
        
    user_id = user.get("id")
    created_at = datetime.datetime.now()
    
    saved_items = []
    total_size = 0
    try:
        for f in files:
            path = await save_upload_file(f, allowed_extensions=None)
            total_size += os.path.getsize(path)
            saved_items.append({
                "path": path,
                "name": f.filename
            })
            
        output_path = rename_services.apply_bulk_rename(
            file_configs=saved_items,
            rules=rules_dict
        )
        output_size = os.path.getsize(output_path)
        finished_at = datetime.datetime.now()
        
        logger.log_job(
            operation_type="bulk_rename",
            input_file_count=len(files),
            total_input_size=total_size,
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
            operation_type="bulk_rename",
            input_file_count=len(files),
            total_input_size=total_size,
            output_file_size=None,
            status="error",
            created_at=created_at,
            finished_at=finished_at,
            expires_at=None,
            error_message=str(e),
            user_id=user_id
        )
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        for item in saved_items:
            cleanup_file(item["path"])
