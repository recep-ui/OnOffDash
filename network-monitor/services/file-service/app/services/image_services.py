import os
from PIL import Image
from app.config import OUTPUT_DIR
from app.utils.file_utils import generate_unique_filename

# Decompression bomb protection: set strict pixel threshold (25 megapixels)
MAX_IMAGE_PIXELS = int(os.getenv("MAX_IMAGE_PIXELS", "25000000"))
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
MAX_IMAGE_DIM = int(os.getenv("MAX_IMAGE_DIM", "5000"))
ALLOWED_FORMATS = {"JPEG", "JPG", "PNG", "WEBP"}

def _safe_open_image(file_path: str):
    """Safely opens an image, verifying integrity and enforcing decompression bomb limits."""
    if not os.path.exists(file_path):
        raise ValueError(f"File not found: {os.path.basename(file_path)}")
    try:
        img = Image.open(file_path)
        img.verify()  # Verify file header and integrity
        # Re-open because verify() alters file pointer
        img = Image.open(file_path)
        w, h = img.size
        if w > MAX_IMAGE_DIM or h > MAX_IMAGE_DIM or (w * h) > MAX_IMAGE_PIXELS:
            img.close()
            raise ValueError(f"Image dimensions ({w}x{h}) exceed maximum allowed limit of {MAX_IMAGE_DIM}x{MAX_IMAGE_DIM} or {MAX_IMAGE_PIXELS} pixels.")
        return img
    except Image.DecompressionBombError as dbe:
        raise ValueError(f"Image decompression bomb detected: {str(dbe)}")
    except ValueError:
        raise
    except Exception as e:
        raise ValueError(f"Invalid or corrupted image file: {str(e)}")

def hex_to_rgb(hex_str: str) -> tuple:
    hex_str = hex_str.lstrip('#')
    if len(hex_str) == 3:
        hex_str = ''.join([c*2 for c in hex_str])
    if len(hex_str) == 6:
        return tuple(int(hex_str[i:i+2], 16) for i in (0, 2, 4))
    return (255, 255, 255) # Fallback to white

def resize_image(
    file_path: str,
    width: int or None = None,
    height: int or None = None,
    keep_aspect: bool = True,
    scale_percent: float or None = None,
    output_format: str = "JPEG",
    user_id: int or str or None = None
) -> str:
    norm_format = (output_format or "JPEG").upper()
    if norm_format not in ALLOWED_FORMATS:
        raise ValueError(f"Unsupported output format: {output_format}. Allowed: {list(ALLOWED_FORMATS)}")

    if scale_percent is not None:
        try:
            scale = float(scale_percent)
            if scale < 1.0 or scale > 500.0:
                raise ValueError("Scale percent must be between 1 and 500.")
        except (TypeError, ValueError) as ex:
            raise ValueError(f"Invalid scale percent: {str(ex)}")

    if width is not None:
        if not isinstance(width, int) or width < 1 or width > MAX_IMAGE_DIM:
            raise ValueError(f"Width must be an integer between 1 and {MAX_IMAGE_DIM}.")

    if height is not None:
        if not isinstance(height, int) or height < 1 or height > MAX_IMAGE_DIM:
            raise ValueError(f"Height must be an integer between 1 and {MAX_IMAGE_DIM}.")

    img = _safe_open_image(file_path)
    try:
        orig_w, orig_h = img.size
        
        # Calculate new dimensions
        if scale_percent is not None:
            new_w = max(1, int(orig_w * (float(scale_percent) / 100.0)))
            new_h = max(1, int(orig_h * (float(scale_percent) / 100.0)))
        else:
            target_w = width if width is not None else orig_w
            target_h = height if height is not None else orig_h
            
            if keep_aspect:
                ratio = min(target_w / orig_w, target_h / orig_h)
                new_w = max(1, int(orig_w * ratio))
                new_h = max(1, int(orig_h * ratio))
            else:
                new_w = max(1, target_w)
                new_h = max(1, target_h)

        if new_w > MAX_IMAGE_DIM or new_h > MAX_IMAGE_DIM or (new_w * new_h) > MAX_IMAGE_PIXELS:
            raise ValueError(f"Resulting image size ({new_w}x{new_h}) exceeds maximum permitted bounds.")
                
        resized_img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    finally:
        img.close()
        
    # Handle transparency when converting to JPEG
    out_format = norm_format
    if out_format in ("JPG", "JPEG"):
        out_format = "JPEG"
        if resized_img.mode in ("RGBA", "LA") or (resized_img.mode == "P" and "transparency" in resized_img.info):
            background = Image.new("RGB", resized_img.size, (255, 255, 255))
            background.paste(resized_img, mask=resized_img.split()[3] if resized_img.mode == "RGBA" else None)
            final_img = background
        else:
            final_img = resized_img.convert("RGB")
    else:
        final_img = resized_img
        
    out_name = generate_unique_filename(out_format.lower(), user_id=user_id)
    out_path = os.path.join(OUTPUT_DIR, out_name)
    final_img.save(out_path, format=out_format)
    
    if final_img is not resized_img:
        resized_img.close()
    final_img.close()
    return out_path

def compress_image(
    file_path: str,
    quality: int = 80,
    output_format: str = "JPEG",
    user_id: int or str or None = None
) -> str:
    norm_format = (output_format or "JPEG").upper()
    if norm_format not in ALLOWED_FORMATS:
        raise ValueError(f"Unsupported output format: {output_format}. Allowed: {list(ALLOWED_FORMATS)}")

    if not isinstance(quality, int) or quality < 1 or quality > 100:
        raise ValueError("Quality must be an integer between 1 and 100.")

    img = _safe_open_image(file_path)
    try:
        out_format = norm_format
        if out_format in ("JPG", "JPEG"):
            out_format = "JPEG"
            if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
                background = Image.new("RGB", img.size, (255, 255, 255))
                background.paste(img, mask=img.split()[3] if img.mode == "RGBA" else None)
                final_img = background
            else:
                final_img = img.convert("RGB")
        else:
            final_img = img.copy()
    finally:
        img.close()
            
    out_name = generate_unique_filename(out_format.lower(), user_id=user_id)
    out_path = os.path.join(OUTPUT_DIR, out_name)
    
    if out_format == "JPEG":
        final_img.save(out_path, format="JPEG", quality=quality, optimize=True)
    elif out_format == "WEBP":
        final_img.save(out_path, format="WEBP", quality=quality, optimize=True)
    elif out_format == "PNG":
        level = int(quality / 10)
        level = max(0, min(9, level))
        final_img.save(out_path, format="PNG", compress_level=level, optimize=True)
        
    final_img.close()
    return out_path

def convert_png_to_jpg(
    file_path: str,
    quality: int = 80,
    bg_color_hex: str = "#ffffff",
    user_id: int or str or None = None
) -> str:
    if not isinstance(quality, int) or quality < 1 or quality > 100:
        raise ValueError("Quality must be an integer between 1 and 100.")

    img = _safe_open_image(file_path)
    try:
        bg_rgb = hex_to_rgb(bg_color_hex)
        background = Image.new("RGB", img.size, bg_rgb)
        
        if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
            rgba_img = img.convert("RGBA")
            background.paste(rgba_img, mask=rgba_img.split()[3])
            final_img = background
            rgba_img.close()
        else:
            final_img = img.convert("RGB")
    finally:
        img.close()
            
    out_name = generate_unique_filename("jpg", user_id=user_id)
    out_path = os.path.join(OUTPUT_DIR, out_name)
    final_img.save(out_path, format="JPEG", quality=quality, optimize=True)
    final_img.close()
    return out_path

def convert_jpg_to_png(file_path: str, user_id: int or str or None = None) -> str:
    img = _safe_open_image(file_path)
    try:
        out_name = generate_unique_filename("png", user_id=user_id)
        out_path = os.path.join(OUTPUT_DIR, out_name)
        img.save(out_path, format="PNG", optimize=True)
    finally:
        img.close()
    return out_path
