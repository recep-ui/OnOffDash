import os
import sys
import unittest
from unittest.mock import MagicMock, patch

# Provide mock modules for fitz and pypdf if not present in test environment
if "fitz" not in sys.modules:
    mock_fitz = MagicMock()
    sys.modules["fitz"] = mock_fitz
if "pypdf" not in sys.modules:
    mock_pypdf = MagicMock()
    sys.modules["pypdf"] = mock_pypdf
    sys.modules["pypdf.errors"] = MagicMock()

import fitz
from pypdf import PdfReader, PdfWriter
from app.services import pdf_ops

class TestPdfResourceBounds(unittest.TestCase):
    def setUp(self):
        # Create a dummy file path
        self.dummy_file = "/tmp/dummy_test.pdf"
        with open(self.dummy_file, "w") as f:
            f.write("dummy")

    def tearDown(self):
        if os.path.exists(self.dummy_file):
            os.remove(self.dummy_file)

    def test_preview_page_bound_enforcement(self):
        """Preview should reject documents exceeding MAX_PREVIEW_PAGES (default 50)."""
        mock_doc = MagicMock()
        mock_doc.__len__.return_value = 55
        mock_doc.is_encrypted = False

        with patch("fitz.open", return_value=mock_doc):
            with self.assertRaises(ValueError) as ctx:
                pdf_ops.get_pdf_previews(self.dummy_file)
            self.assertIn("Preview is limited to documents with at most 50 pages", str(ctx.exception))

    def test_preview_dimension_bound_enforcement(self):
        """Preview should reject pages with dimensions exceeding safe bounds."""
        mock_doc = MagicMock()
        mock_doc.__len__.return_value = 1
        mock_doc.is_encrypted = False

        mock_page = MagicMock()
        mock_rect = MagicMock()
        mock_rect.width = 5000
        mock_rect.height = 5000
        mock_page.rect = mock_rect
        mock_doc.__iter__.return_value = [mock_page]

        with patch("fitz.open", return_value=mock_doc):
            with self.assertRaises(ValueError) as ctx:
                pdf_ops.get_pdf_previews(self.dummy_file)
            self.assertIn("exceed safe rendering bounds", str(ctx.exception))

    def test_encrypted_pdf_rejection(self):
        """Encrypted PDFs should be safely rejected with a clear ValueError."""
        mock_doc = MagicMock()
        mock_doc.is_encrypted = True

        with patch("fitz.open", return_value=mock_doc):
            with self.assertRaises(ValueError) as ctx:
                pdf_ops.get_pdf_previews(self.dummy_file)
            self.assertIn("Encrypted or password-protected PDF files are not supported", str(ctx.exception))

    def test_merge_total_page_limit(self):
        """Merging exceeding MAX_PDF_PAGES must raise ValueError."""
        mock_reader = MagicMock()
        mock_reader.is_encrypted = False
        mock_reader.pages = [MagicMock()] * 300

        with patch("app.services.pdf_ops.PdfReader", return_value=mock_reader):
            with self.assertRaises(ValueError) as ctx:
                pdf_ops.merge_pdfs([self.dummy_file, self.dummy_file])
            self.assertIn("exceeds maximum allowed limit", str(ctx.exception))

if __name__ == '__main__':
    unittest.main()
