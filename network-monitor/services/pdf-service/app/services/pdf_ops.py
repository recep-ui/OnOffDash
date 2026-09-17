import os
import base64
import fitz  # PyMuPDF
from pypdf import PdfReader, PdfWriter
from app.utils.file_utils import OUTPUT_DIR, generate_unique_filename

def get_pdf_previews(file_path: str) -> list[str]:
    """
    Renders PDF pages to low-resolution JPEG images and returns them as Base64 data URLs.
    """
    if not os.path.exists(file_path):
        return []
    
    doc = fitz.open(file_path)
    previews = []
    try:
        for page in doc:
            # Render page to image at 72 DPI for fast thumbnail loading
            pix = page.get_pixmap(dpi=72)
            img_data = pix.tobytes("jpeg")
            b64 = base64.b64encode(img_data).decode("utf-8")
            previews.append(f"data:image/jpeg;base64,{b64}")
    finally:
        doc.close()
    return previews

def merge_pdfs(file_paths: list[str]) -> str:
    """
    Merges multiple PDF files in the order they are provided.
    """
    writer = PdfWriter()
    for path in file_paths:
        if os.path.exists(path):
            reader = PdfReader(path)
            for page in reader.pages:
                writer.add_page(page)
                
    out_name = generate_unique_filename("pdf")
    out_path = os.path.join(OUTPUT_DIR, out_name)
    
    with open(out_path, "wb") as f_out:
        writer.write(f_out)
        
    return out_path

def split_pdf(file_path: str, range_str: str) -> str:
    """
    Splits a PDF by extracting specific pages or page ranges (e.g. '1-3', '5,7', '2-5, 8')
    and returns the merged result of those extracted pages.
    """
    reader = PdfReader(file_path)
    writer = PdfWriter()
    total_pages = len(reader.pages)
    
    # Parse ranges, e.g. "1-3, 5" -> [0, 1, 2, 4]
    pages_to_extract = set()
    parts = range_str.split(",")
    for part in parts:
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            sub_parts = part.split("-")
            if len(sub_parts) == 2:
                start = sub_parts[0].strip()
                end = sub_parts[1].strip()
                
                start_idx = int(start) - 1 if start.isdigit() else 0
                end_idx = int(end) - 1 if end.isdigit() else total_pages - 1
                
                # bound checking
                start_idx = max(0, min(start_idx, total_pages - 1))
                end_idx = max(0, min(end_idx, total_pages - 1))
                
                if start_idx <= end_idx:
                    for i in range(start_idx, end_idx + 1):
                        pages_to_extract.add(i)
                else:
                    for i in range(start_idx, end_idx - 1, -1):
                        pages_to_extract.add(i)
        elif part.isdigit():
            idx = int(part) - 1
            if 0 <= idx < total_pages:
                pages_to_extract.add(idx)
                
    # Sort pages to keep original sequence, or extract as ordered in input?
    # Usually we sort them, but let's keep it sorted to be safe.
    sorted_pages = sorted(list(pages_to_extract))
    
    if not sorted_pages:
        raise ValueError("No valid pages specified for extraction.")
        
    for p_idx in sorted_pages:
        writer.add_page(reader.pages[p_idx])
        
    out_name = generate_unique_filename("pdf")
    out_path = os.path.join(OUTPUT_DIR, out_name)
    
    with open(out_path, "wb") as f_out:
        writer.write(f_out)
        
    return out_path

def reorder_rotate_delete_pdf(file_path: str, page_configs: list[dict]) -> str:
    """
    Manipulates pages in a PDF: reordering, rotation, and deletion.
    page_configs format: [{"index": int, "rotation": int}]
    Only pages present in page_configs are kept. Index is 0-indexed.
    """
    doc = fitz.open(file_path)
    new_doc = fitz.open()
    try:
        for cfg in page_configs:
            idx = cfg.get("index")
            rotation = cfg.get("rotation", 0)
            
            if 0 <= idx < len(doc):
                # Import the page from original document
                new_doc.insert_pdf(doc, from_page=idx, to_page=idx)
                # Rotate the newly added page if rotation is specified
                if rotation != 0:
                    new_page = new_doc[-1]
                    new_page.set_rotation((new_page.rotation + rotation) % 360)
        
        out_name = generate_unique_filename("pdf")
        out_path = os.path.join(OUTPUT_DIR, out_name)
        new_doc.save(out_path, garbage=4, deflate=True)
    finally:
        doc.close()
        new_doc.close()
        
    return out_path

def compress_pdf(file_path: str, quality: str = "medium") -> str:
    """
    Compresses PDF using PyMuPDF optimizations.
    """
    doc = fitz.open(file_path)
    try:
        out_name = generate_unique_filename("pdf")
        out_path = os.path.join(OUTPUT_DIR, out_name)
        
        # Optimize saving options based on quality
        if quality == "high":
            # Maximum compression: garbage collection level 4, deflate streams, clean contents
            doc.save(out_path, garbage=4, deflate=True, clean=True)
        elif quality == "medium":
            doc.save(out_path, garbage=3, deflate=True)
        else:
            # Low compression / fast save
            doc.save(out_path, garbage=2, deflate=True)
    finally:
        doc.close()
        
    return out_path

def add_watermark(file_path: str, text: str, color_hex: str = "#FF0000", opacity: float = 0.3, font_size: int = 50, rotation: int = 45) -> str:
    """
    Inserts a semi-transparent text watermark onto all pages of the PDF.
    """
    doc = fitz.open(file_path)
    try:
        # Parse Hex color to RGB
        hex_color = color_hex.lstrip("#")
        if len(hex_color) == 6:
            rgb = tuple(int(hex_color[i:i+2], 16) / 255.0 for i in (0, 2, 4))
        else:
            rgb = (1.0, 0.0, 0.0) # default red
            
        for page in doc:
            rect = page.rect
            width = rect.width
            height = rect.height
            
            # Position text in center of the page
            # We can use insert_text with rotate argument
            # In PyMuPDF rotate must be an integer degree: 0, 90, 180, 270 etc.
            # For general angle rotation, PyMuPDF supports standard rotations (0, 90, 180, 270).
            # Let's map arbitrary rotation to closest 90 degree step, or use text drawer.
            # To avoid unsupported angle crashes, let's round rotation to closest 90-degree multiple
            # unless using a graphics shape. Or we can just support 0, 90, 180, 270 rotations for text.
            # Let's check rotation value:
            safe_rotation = int(rotation) % 360
            if safe_rotation not in (0, 90, 180, 270):
                # Round to closest 90-degree step for text rotation support
                safe_rotation = min([0, 90, 180, 270], key=lambda x: abs(x - safe_rotation))

            # Center point
            point = fitz.Point(width / 6, height / 2)
            
            page.insert_text(
                point,
                text,
                fontsize=font_size,
                color=rgb,
                rotate=safe_rotation,
                fill_opacity=opacity,
                overlay=True
            )
            
        out_name = generate_unique_filename("pdf")
        out_path = os.path.join(OUTPUT_DIR, out_name)
        doc.save(out_path)
    finally:
        doc.close()
        
    return out_path
