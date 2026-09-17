import os
import datetime
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Header, Depends
from app.utils.file_utils import save_upload_file, BLACKLISTED_EXTENSIONS
from app.services import image_services
from app.utils import logger
from app.utils.auth import require_authenticated_user

router = APIRouter(prefix="/api/file-tools/image", tags=["image-tools"])

ALLOWED_IMG_EXTS = {'.jpg', '.jpeg', '.png', '.webp'}

def cleanup_file(path: str):
    if path and os.path.exists(path):
        try:
            os.remove(path)
        except Exception:
            pass

@router.post("/resize")
async def resize_image_endpoint(
    file: UploadFile = File(...),
    width: int = Form(None),
    height: int = Form(None),
    keep_aspect: bool = Form(True),
    scale_percent: float = Form(None),
    output_format: str = Form("JPEG"),
    user: dict = Depends(require_authenticated_user)
):
    user_id = user.get("id")
    created_at = datetime.datetime.now()
    file_path = None
    file_size = 0
    try:
        file_path = await save_upload_file(file, ALLOWED_IMG_EXTS)
        file_size = os.path.getsize(file_path)
        
        output_path = image_services.resize_image(
            file_path=file_path,
            width=width,
            height=height,
            keep_aspect=keep_aspect,
            scale_percent=scale_percent,
            output_format=output_format,
            user_id=user_id
        )
        output_size = os.path.getsize(output_path)
        finished_at = datetime.datetime.now()
        
        logger.log_job(
            operation_type="image_resize",
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
            "download_url": f"/api/file-tools/download/{file_id}",
            "original_size": file_size,
            "new_size": output_size
        }
    except Exception as e:
        finished_at = datetime.datetime.now()
        logger.log_job(
            operation_type="image_resize",
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
        cleanup_file(file_path)

@router.post("/compress")
async def compress_image_endpoint(
    file: UploadFile = File(...),
    quality: int = Form(80),
    output_format: str = Form("JPEG"),
    user: dict = Depends(require_authenticated_user)
):
    user_id = user.get("id")
    created_at = datetime.datetime.now()
    file_path = None
    file_size = 0
    try:
        file_path = await save_upload_file(file, ALLOWED_IMG_EXTS)
        file_size = os.path.getsize(file_path)
        
        output_path = image_services.compress_image(
            file_path=file_path,
            quality=quality,
            output_format=output_format,
            user_id=user_id
        )
        output_size = os.path.getsize(output_path)
        finished_at = datetime.datetime.now()
        
        logger.log_job(
            operation_type="image_compress",
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
            "download_url": f"/api/file-tools/download/{file_id}",
            "original_size": file_size,
            "new_size": output_size
        }
    except Exception as e:
        finished_at = datetime.datetime.now()
        logger.log_job(
            operation_type="image_compress",
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
        cleanup_file(file_path)

@router.post("/png-to-jpg")
async def png_to_jpg_endpoint(
    file: UploadFile = File(...),
    quality: int = Form(80),
    bg_color: str = Form("#ffffff"),
    user: dict = Depends(require_authenticated_user)
):
    user_id = user.get("id")
    created_at = datetime.datetime.now()
    file_path = None
    file_size = 0
    try:
        file_path = await save_upload_file(file, {'.png'})
        file_size = os.path.getsize(file_path)
        
        output_path = image_services.convert_png_to_jpg(
            file_path=file_path,
            quality=quality,
            bg_color_hex=bg_color,
            user_id=user_id
        )
        output_size = os.path.getsize(output_path)
        finished_at = datetime.datetime.now()
        
        logger.log_job(
            operation_type="png_to_jpg",
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
            "download_url": f"/api/file-tools/download/{file_id}",
            "original_size": file_size,
            "new_size": output_size
        }
    except Exception as e:
        finished_at = datetime.datetime.now()
        logger.log_job(
            operation_type="png_to_jpg",
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
        cleanup_file(file_path)

@router.post("/jpg-to-png")
async def jpg_to_png_endpoint(
    file: UploadFile = File(...),
    user: dict = Depends(require_authenticated_user)
):
    user_id = user.get("id")
    created_at = datetime.datetime.now()
    file_path = None
    file_size = 0
    try:
        file_path = await save_upload_file(file, {'.jpg', '.jpeg'})
        file_size = os.path.getsize(file_path)
        
        output_path = image_services.convert_jpg_to_png(file_path=file_path, user_id=user_id)
        output_size = os.path.getsize(output_path)
        finished_at = datetime.datetime.now()
        
        logger.log_job(
            operation_type="jpg_to_png",
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
            "download_url": f"/api/file-tools/download/{file_id}",
            "original_size": file_size,
            "new_size": output_size
        }
    except Exception as e:
        finished_at = datetime.datetime.now()
        logger.log_job(
            operation_type="jpg_to_png",
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
        cleanup_file(file_path)
