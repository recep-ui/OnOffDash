import os
import base64
import fitz  # PyMuPDF
from pypdf import PdfReader, PdfWriter
from pypdf.errors import PdfReadError
from app.utils.file_utils import OUTPUT_DIR, generate_unique_filename

MAX_PDF_PAGES = int(os.getenv("MAX_PDF_PAGES", "500"))
MAX_PREVIEW_PAGES = int(os.getenv("MAX_PREVIEW_PAGES", "50"))
MAX_PAGE_DIM = 4000
MAX_PAGE_PIXELS = 16_000_000

def _safe_open_fitz(file_path: str):
    """Safely opens a PDF document with PyMuPDF, catching corrupted or encrypted files."""
    if not os.path.exists(file_path):
        raise ValueError(f"File not found: {os.path.basename(file_path)}")
    try:
        doc = fitz.open(file_path)
        if doc.is_encrypted:
            doc.close()
            raise ValueError("Encrypted or password-protected PDF files are not supported.")
        return doc
    except ValueError:
        raise
    except Exception as e:
        raise ValueError(f"Invalid or corrupted PDF file: {str(e)}")

def _safe_open_pypdf(file_path: str):
    """Safely opens a PDF document with pypdf, catching corrupted or encrypted files."""
    if not os.path.exists(file_path):
        raise ValueError(f"File not found: {os.path.basename(file_path)}")
    try:
        reader = PdfReader(file_path)
        if reader.is_encrypted:
            raise ValueError("Encrypted or password-protected PDF files are not supported.")
        return reader
    except ValueError:
        raise
    except Exception as e:
        raise ValueError(f"Invalid or corrupted PDF file: {str(e)}")

def get_pdf_previews(file_path: str) -> list[str]:
    """
    Renders PDF pages to low-resolution JPEG images and returns them as Base64 data URLs.
    Enforces page count and page dimension bounds to prevent resource exhaustion.
    """
    doc = _safe_open_fitz(file_path)
    previews = []
    try:
        page_count = len(doc)
        if page_count > MAX_PREVIEW_PAGES:
            raise ValueError(f"Preview is limited to documents with at most {MAX_PREVIEW_PAGES} pages (document has {page_count} pages).")

        for page in doc:
            rect = page.rect
            if rect.width > MAX_PAGE_DIM or rect.height > MAX_PAGE_DIM or (rect.width * rect.height) > MAX_PAGE_PIXELS:
                raise ValueError(f"Page dimensions ({int(rect.width)}x{int(rect.height)}) exceed safe rendering bounds.")

            # Render page to image at 72 DPI for fast thumbnail loading
            pix = page.get_pixmap(dpi=72)
            img_data = pix.tobytes("jpeg")
            b64 = base64.b64encode(img_data).decode("utf-8")
            previews.append(f"data:image/jpeg;base64,{b64}")
    finally:
        doc.close()
    return previews

def merge_pdfs(file_paths: list[str], user_id = None) -> str:
    """
    Merges multiple PDF files in the order they are provided.
    Enforces maximum page limits to protect against DoS.
    """
    writer = PdfWriter()
    total_pages = 0
    for path in file_paths:
        reader = _safe_open_pypdf(path)
        total_pages += len(reader.pages)
        if total_pages > MAX_PDF_PAGES:
            raise ValueError(f"Total page count ({total_pages}) exceeds maximum allowed limit of {MAX_PDF_PAGES}.")
        for page in reader.pages:
            writer.add_page(page)
                
    out_name = generate_unique_filename("pdf", user_id=user_id)
    out_path = os.path.join(OUTPUT_DIR, out_name)
    
    with open(out_path, "wb") as f_out:
        writer.write(f_out)
        
    return out_path

def split_pdf(file_path: str, range_str: str, user_id = None) -> str:
    """
    Splits a PDF by extracting specific pages or page ranges (e.g. '1-3', '5,7', '2-5, 8')
    and returns the merged result of those extracted pages.
    """
    reader = _safe_open_pypdf(file_path)
    total_pages = len(reader.pages)
    if total_pages > MAX_PDF_PAGES:
        raise ValueError(f"PDF page count ({total_pages}) exceeds maximum allowed limit of {MAX_PDF_PAGES}.")

    writer = PdfWriter()
    
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
                
    sorted_pages = sorted(list(pages_to_extract))
    
    if not sorted_pages:
        raise ValueError("No valid pages specified for extraction.")
        
    for p_idx in sorted_pages:
        writer.add_page(reader.pages[p_idx])
        
    out_name = generate_unique_filename("pdf", user_id=user_id)
    out_path = os.path.join(OUTPUT_DIR, out_name)
    
    with open(out_path, "wb") as f_out:
        writer.write(f_out)
        
    return out_path

def reorder_rotate_delete_pdf(file_path: str, page_configs: list[dict], user_id = None) -> str:
    """
    Manipulates pages in a PDF: reordering, rotation, and deletion.
    page_configs format: [{"index": int, "rotation": int}]
    Only pages present in page_configs are kept. Index is 0-indexed.
    """
    doc = _safe_open_fitz(file_path)
    if len(doc) > MAX_PDF_PAGES:
        doc.close()
        raise ValueError(f"PDF page count ({len(doc)}) exceeds maximum allowed limit of {MAX_PDF_PAGES}.")

    new_doc = fitz.open()
    try:
        for cfg in page_configs:
            idx = cfg.get("index")
            rotation = cfg.get("rotation", 0)
            
            if idx is not None and 0 <= idx < len(doc):
                new_doc.insert_pdf(doc, from_page=idx, to_page=idx)
                if rotation != 0:
                    new_page = new_doc[-1]
                    new_page.set_rotation((new_page.rotation + rotation) % 360)
        
        if len(new_doc) == 0:
            raise ValueError("No valid pages selected for output.")

        out_name = generate_unique_filename("pdf", user_id=user_id)
        out_path = os.path.join(OUTPUT_DIR, out_name)
        new_doc.save(out_path, garbage=4, deflate=True)
    finally:
        doc.close()
        new_doc.close()
        
    return out_path

def compress_pdf(file_path: str, quality: str = "medium", user_id = None) -> str:
    """
    Compresses PDF using PyMuPDF optimizations.
    """
    doc = _safe_open_fitz(file_path)
    if len(doc) > MAX_PDF_PAGES:
        doc.close()
        raise ValueError(f"PDF page count ({len(doc)}) exceeds maximum allowed limit of {MAX_PDF_PAGES}.")

    try:
        out_name = generate_unique_filename("pdf", user_id=user_id)
        out_path = os.path.join(OUTPUT_DIR, out_name)
        
        if quality == "high":
            doc.save(out_path, garbage=4, deflate=True, clean=True)
        elif quality == "medium":
            doc.save(out_path, garbage=3, deflate=True)
        else:
            doc.save(out_path, garbage=2, deflate=True)
    finally:
        doc.close()
        
    return out_path

def add_watermark(file_path: str, text: str, color_hex: str = "#FF0000", opacity: float = 0.3, font_size: int = 50, rotation: int = 45, user_id = None) -> str:
    """
    Inserts a semi-transparent text watermark onto all pages of the PDF.
    """
    if not text or not str(text).strip():
        raise ValueError("Watermark text cannot be empty.")
    if not (0.0 <= opacity <= 1.0):
        raise ValueError("Opacity must be between 0.0 and 1.0.")
    if font_size < 1 or font_size > 200:
        raise ValueError("Font size must be between 1 and 200.")

    doc = _safe_open_fitz(file_path)
    if len(doc) > MAX_PDF_PAGES:
        doc.close()
        raise ValueError(f"PDF page count ({len(doc)}) exceeds maximum allowed limit of {MAX_PDF_PAGES}.")

    try:
        hex_color = color_hex.lstrip("#")
        if len(hex_color) == 6:
            rgb = tuple(int(hex_color[i:i+2], 16) / 255.0 for i in (0, 2, 4))
        else:
            rgb = (1.0, 0.0, 0.0)
            
        for page in doc:
            rect = page.rect
            width = rect.width
            height = rect.height
            
            safe_rotation = int(rotation) % 360
            if safe_rotation not in (0, 90, 180, 270):
                safe_rotation = min([0, 90, 180, 270], key=lambda x: abs(x - safe_rotation))

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
            
        out_name = generate_unique_filename("pdf", user_id=user_id)
        out_path = os.path.join(OUTPUT_DIR, out_name)
        doc.save(out_path)
    finally:
        doc.close()
        
    return out_path
