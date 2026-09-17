import os
import json
import datetime
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks, Header, Depends
from fastapi.responses import FileResponse
from app.utils.file_utils import TEMP_DIR, OUTPUT_DIR, save_upload_file, generate_unique_filename
from app.services import pdf_ops
from app.utils import logger
from app.utils.auth import require_authenticated_user

router = APIRouter(prefix="/api/pdf", tags=["pdf-tools"])

def cleanup_file(path: str):
    """Background task to remove a file."""
    if os.path.exists(path):
        try:
            os.remove(path)
        except Exception:
            pass

@router.post("/preview")
async def get_preview(file: UploadFile = File(...), user: dict = Depends(require_authenticated_user)):
    """
    Accepts a PDF file and returns a list of base64-encoded page preview JPEGs.
    """
    user_id = user.get("id")
    created_at = datetime.datetime.now()
    file_path = None
    file_size = 0
    try:
        file_path = await save_upload_file(file)
        file_size = os.path.getsize(file_path)
        
        previews = pdf_ops.get_pdf_previews(file_path)
        finished_at = datetime.datetime.now()
        
        logger.log_job(
            operation_type="preview",
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
        return {"previews": previews}
    except Exception as e:
        finished_at = datetime.datetime.now()
        logger.log_job(
            operation_type="preview",
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
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if file_path:
            cleanup_file(file_path)

@router.post("/merge")
async def merge_files(files: list[UploadFile] = File(...), user: dict = Depends(require_authenticated_user)):
    """
    Accepts multiple PDF files, merges them in the order sent, and returns a download link.
    """
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="Please upload at least 2 PDF files to merge.")
    
    user_id = user.get("id")
    created_at = datetime.datetime.now()
    saved_paths = []
    total_size = 0
    try:
        for f in files:
            path = await save_upload_file(f)
            saved_paths.append(path)
            total_size += os.path.getsize(path)
            
        merged_path = pdf_ops.merge_pdfs(saved_paths, user_id=user_id)
        output_size = os.path.getsize(merged_path)
        finished_at = datetime.datetime.now()
        
        logger.log_job(
            operation_type="merge",
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
        
        file_id = os.path.basename(merged_path)
        return {
            "success": True,
            "file_id": file_id,
            "download_url": f"/api/pdf/download/{file_id}"
        }
    except ValueError as ve:
        finished_at = datetime.datetime.now()
        logger.log_job(
            operation_type="merge",
            input_file_count=len(files),
            total_input_size=total_size,
            output_file_size=None,
            status="error",
            created_at=created_at,
            finished_at=finished_at,
            expires_at=None,
            error_message=str(ve),
            user_id=user_id
        )
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        finished_at = datetime.datetime.now()
        logger.log_job(
            operation_type="merge",
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
        for path in saved_paths:
            cleanup_file(path)

@router.post("/split")
async def split_file(file: UploadFile = File(...), range_str: str = Form(...), user: dict = Depends(require_authenticated_user)):
    """
    Extracts specified page range from a PDF and returns the download link.
    """
    user_id = user.get("id")
    created_at = datetime.datetime.now()
    file_path = None
    file_size = 0
    try:
        file_path = await save_upload_file(file)
        file_size = os.path.getsize(file_path)
        
        split_path = pdf_ops.split_pdf(file_path, range_str, user_id=user_id)
        output_size = os.path.getsize(split_path)
        finished_at = datetime.datetime.now()
        
        logger.log_job(
            operation_type="split",
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
        
        file_id = os.path.basename(split_path)
        return {
            "success": True,
            "file_id": file_id,
            "download_url": f"/api/pdf/download/{file_id}"
        }
    except ValueError as ve:
        finished_at = datetime.datetime.now()
        logger.log_job(
            operation_type="split",
            input_file_count=1,
            total_input_size=file_size,
            output_file_size=None,
            status="error",
            created_at=created_at,
            finished_at=finished_at,
            expires_at=None,
            error_message=str(ve),
            user_id=user_id
        )
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        finished_at = datetime.datetime.now()
        logger.log_job(
            operation_type="split",
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
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if file_path:
            cleanup_file(file_path)

@router.post("/reorder")
async def reorder_file(file: UploadFile = File(...), page_configs: str = Form(...), user: dict = Depends(require_authenticated_user)):
    """
    Reorders, rotates, and deletes pages in a PDF based on page_configs JSON string.
    page_configs format: [{"index": int, "rotation": int}]
    """
    user_id = user.get("id")
    created_at = datetime.datetime.now()
    file_path = None
    file_size = 0
    try:
        configs = json.loads(page_configs)
        if not isinstance(configs, list):
            raise ValueError("page_configs must be a list")
    except Exception as je:
        raise HTTPException(status_code=400, detail="page_configs must be a valid JSON array of page configurations.")
        
    try:
        file_path = await save_upload_file(file)
        file_size = os.path.getsize(file_path)
        
        manipulated_path = pdf_ops.reorder_rotate_delete_pdf(file_path, configs, user_id=user_id)
        output_size = os.path.getsize(manipulated_path)
        finished_at = datetime.datetime.now()
        
        logger.log_job(
            operation_type="reorder",
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
        
        file_id = os.path.basename(manipulated_path)
        return {
            "success": True,
            "file_id": file_id,
            "download_url": f"/api/pdf/download/{file_id}"
        }
    except ValueError as ve:
        finished_at = datetime.datetime.now()
        logger.log_job(
            operation_type="reorder",
            input_file_count=1,
            total_input_size=file_size,
            output_file_size=None,
            status="error",
            created_at=created_at,
            finished_at=finished_at,
            expires_at=None,
            error_message=str(ve),
            user_id=user_id
        )
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        finished_at = datetime.datetime.now()
        logger.log_job(
            operation_type="reorder",
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
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if file_path:
            cleanup_file(file_path)

@router.post("/compress")
async def compress_file(file: UploadFile = File(...), quality: str = Form("medium"), user: dict = Depends(require_authenticated_user)):
    """
    Compresses PDF file size based on quality ('low', 'medium', 'high').
    """
    if quality not in ("low", "medium", "high"):
        raise HTTPException(status_code=400, detail="Invalid quality value. Choose 'low', 'medium', or 'high'.")
        
    user_id = user.get("id")
    created_at = datetime.datetime.now()
    file_path = None
    file_size = 0
    try:
        file_path = await save_upload_file(file)
        file_size = os.path.getsize(file_path)
        
        compressed_path = pdf_ops.compress_pdf(file_path, quality, user_id=user_id)
        output_size = os.path.getsize(compressed_path)
        finished_at = datetime.datetime.now()
        
        logger.log_job(
            operation_type="compress",
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
        
        file_id = os.path.basename(compressed_path)
        return {
            "success": True,
            "file_id": file_id,
            "download_url": f"/api/pdf/download/{file_id}"
        }
    except ValueError as ve:
        finished_at = datetime.datetime.now()
        logger.log_job(
            operation_type="compress",
            input_file_count=1,
            total_input_size=file_size,
            output_file_size=None,
            status="error",
            created_at=created_at,
            finished_at=finished_at,
            expires_at=None,
            error_message=str(ve),
            user_id=user_id
        )
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        finished_at = datetime.datetime.now()
        logger.log_job(
            operation_type="compress",
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
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if file_path:
            cleanup_file(file_path)

@router.post("/watermark")
async def watermark_file(
    file: UploadFile = File(...),
    text: str = Form(...),
    color: str = Form("#FF0000"),
    opacity: float = Form(0.3),
    font_size: int = Form(50),
    rotation: int = Form(45),
    user: dict = Depends(require_authenticated_user)
):
    """
    Applies text watermark to all PDF pages.
    """
    user_id = user.get("id")
    created_at = datetime.datetime.now()
    file_path = None
    file_size = 0
    try:
        file_path = await save_upload_file(file)
        file_size = os.path.getsize(file_path)
        
        watermarked_path = pdf_ops.add_watermark(
            file_path, 
            text=text, 
            color_hex=color, 
            opacity=opacity, 
            font_size=font_size, 
            rotation=rotation,
            user_id=user_id
        )
        output_size = os.path.getsize(watermarked_path)
        finished_at = datetime.datetime.now()
        
        logger.log_job(
            operation_type="watermark",
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
        
        file_id = os.path.basename(watermarked_path)
        return {
            "success": True,
            "file_id": file_id,
            "download_url": f"/api/pdf/download/{file_id}"
        }
    except ValueError as ve:
        finished_at = datetime.datetime.now()
        logger.log_job(
            operation_type="watermark",
            input_file_count=1,
            total_input_size=file_size,
            output_file_size=None,
            status="error",
            created_at=created_at,
            finished_at=finished_at,
            expires_at=None,
            error_message=str(ve),
            user_id=user_id
        )
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        finished_at = datetime.datetime.now()
        logger.log_job(
            operation_type="watermark",
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
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if file_path:
            cleanup_file(file_path)

@router.get("/download/{file_id}")
async def download_file(file_id: str, background_tasks: BackgroundTasks, user: dict = Depends(require_authenticated_user)):
    """
    Serves the output PDF file and checks ownership against requesting user.
    """
    safe_name = os.path.basename(file_id)
    file_path = os.path.join(OUTPUT_DIR, safe_name)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found or expired.")
        
    user_id = user.get("id")
    role = user.get("role", "")
    if safe_name.startswith("u"):
        parts = safe_name.split("_", 1)
        if len(parts) > 1 and parts[0][1:].isdigit():
            owner_id = int(parts[0][1:])
            if role != "admin" and user_id is not None and owner_id != int(user_id):
                raise HTTPException(status_code=403, detail="You do not have permission to access this file.")

    return FileResponse(
        file_path, 
        media_type="application/pdf", 
        filename="processed_document.pdf"
    )
