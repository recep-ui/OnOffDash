import os
from PIL import Image
from app.config import OUTPUT_DIR
from app.utils.file_utils import generate_unique_filename

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
    with Image.open(file_path) as img:
        orig_w, orig_h = img.size
        
        # Calculate new dimensions
        if scale_percent is not None:
            new_w = int(orig_w * (scale_percent / 100.0))
            new_h = int(orig_h * (scale_percent / 100.0))
        else:
            target_w = width if width is not None else orig_w
            target_w = max(1, target_w)
            target_h = height if height is not None else orig_h
            target_h = max(1, target_h)
            
            if keep_aspect:
                ratio = min(target_w / orig_w, target_h / orig_h)
                new_w = int(orig_w * ratio)
                new_h = int(orig_h * ratio)
                new_w = max(1, new_w)
                new_h = max(1, new_h)
            else:
                new_w = target_w
                new_h = target_h
                
        resized_img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
        
    # Handle transparency when converting to JPEG
    out_format = output_format.upper()
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
    with Image.open(file_path) as img:
        out_format = output_format.upper()
        
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
    with Image.open(file_path) as img:
        bg_rgb = hex_to_rgb(bg_color_hex)
        background = Image.new("RGB", img.size, bg_rgb)
        
        if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
            rgba_img = img.convert("RGBA")
            background.paste(rgba_img, mask=rgba_img.split()[3])
            final_img = background
            rgba_img.close()
        else:
            final_img = img.convert("RGB")
            
    out_name = generate_unique_filename("jpg", user_id=user_id)
    out_path = os.path.join(OUTPUT_DIR, out_name)
    final_img.save(out_path, format="JPEG", quality=quality, optimize=True)
    final_img.close()
    return out_path

def convert_jpg_to_png(file_path: str, user_id: int or str or None = None) -> str:
    with Image.open(file_path) as img:
        out_name = generate_unique_filename("png", user_id=user_id)
        out_path = os.path.join(OUTPUT_DIR, out_name)
        img.save(out_path, format="PNG", optimize=True)
    return out_path
