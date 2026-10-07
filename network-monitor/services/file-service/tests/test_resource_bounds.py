import os
import unittest
import tempfile
from PIL import Image
from app.services import image_services

class TestImageResourceBounds(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        # Create a small valid test image
        self.img_path = os.path.join(self.temp_dir.name, "valid.png")
        img = Image.new("RGB", (100, 100), color=(255, 0, 0))
        img.save(self.img_path, format="PNG")
        img.close()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_scale_percent_bounds(self):
        """scale_percent < 1 or > 500 must raise ValueError."""
        with self.assertRaises(ValueError) as ctx:
            image_services.resize_image(self.img_path, scale_percent=0.5)
        self.assertIn("Scale percent must be between 1 and 500", str(ctx.exception))

        with self.assertRaises(ValueError) as ctx:
            image_services.resize_image(self.img_path, scale_percent=1000)
        self.assertIn("Scale percent must be between 1 and 500", str(ctx.exception))

    def test_dimension_bounds(self):
        """Width or height exceeding MAX_IMAGE_DIM (5000) must raise ValueError."""
        with self.assertRaises(ValueError) as ctx:
            image_services.resize_image(self.img_path, width=6000)
        self.assertIn("between 1 and 5000", str(ctx.exception))

        with self.assertRaises(ValueError) as ctx:
            image_services.resize_image(self.img_path, height=9999)
        self.assertIn("between 1 and 5000", str(ctx.exception))

    def test_quality_bounds(self):
        """Quality < 1 or > 100 must raise ValueError."""
        with self.assertRaises(ValueError) as ctx:
            image_services.compress_image(self.img_path, quality=0)
        self.assertIn("Quality must be an integer between 1 and 100", str(ctx.exception))

        with self.assertRaises(ValueError) as ctx:
            image_services.compress_image(self.img_path, quality=101)
        self.assertIn("Quality must be an integer between 1 and 100", str(ctx.exception))

    def test_format_validation(self):
        """Unsupported formats must be rejected."""
        with self.assertRaises(ValueError) as ctx:
            image_services.resize_image(self.img_path, width=50, output_format="EXE")
        self.assertIn("Unsupported output format", str(ctx.exception))

    def test_corrupt_image_rejection(self):
        """Corrupted image data must raise ValueError."""
        corrupt_path = os.path.join(self.temp_dir.name, "corrupt.png")
        with open(corrupt_path, "wb") as f:
            f.write(b"NOT_A_VALID_IMAGE")

        with self.assertRaises(ValueError) as ctx:
            image_services.resize_image(corrupt_path, width=50)
        self.assertIn("Invalid or corrupted image", str(ctx.exception))

    def test_decompression_bomb_bounds(self):
        """Images with dimension exceeding MAX_IMAGE_DIM must be rejected during open."""
        huge_path = os.path.join(self.temp_dir.name, "huge.png")
        huge_img = Image.new("1", (5001, 100)) # 1-bit monochrome is tiny on disk
        huge_img.save(huge_path, format="PNG")
        huge_img.close()

        with self.assertRaises(ValueError) as ctx:
            image_services.resize_image(huge_path, width=50)
        self.assertIn("exceed maximum allowed limit", str(ctx.exception))

if __name__ == '__main__':
    unittest.main()
