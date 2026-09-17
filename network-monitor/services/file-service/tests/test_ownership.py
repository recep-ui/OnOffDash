import os
import unittest
from app.config import OUTPUT_DIR
from app.utils.file_utils import generate_unique_filename, check_file_ownership
from app.services.zip_services import create_zip_archive

class TestFileToolsOwnership(unittest.TestCase):
    def setUp(self):
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        self.test_files_to_clean = []

    def tearDown(self):
        for path in self.test_files_to_clean:
            if os.path.exists(path):
                try:
                    os.remove(path)
                except Exception:
                    pass

    def test_generate_unique_filename_format(self):
        # Without user_id
        fn_anonymous = generate_unique_filename("txt")
        self.assertFalse(fn_anonymous.startswith("u"))
        self.assertTrue(fn_anonymous.endswith(".txt"))

        # With user_id
        fn_user1 = generate_unique_filename("csv", user_id=42)
        self.assertTrue(fn_user1.startswith("u42_"))
        self.assertTrue(fn_user1.endswith(".csv"))

    def test_zip_service_generates_user_owned_filename(self):
        src_path = os.path.join(OUTPUT_DIR, "test_file_to_zip.txt")
        with open(src_path, "w", encoding="utf-8") as f:
            f.write("zip file test content")
        self.test_files_to_clean.append(src_path)

        user_id = 77
        out_path = create_zip_archive([{"path": src_path, "name": "test.txt"}], user_id=user_id)
        self.test_files_to_clean.append(out_path)

        filename = os.path.basename(out_path)
        self.assertTrue(filename.startswith(f"u{user_id}_"), f"Filename should start with u{user_id}_ but got {filename}")

    def test_text_service_generates_user_owned_filename_if_dependencies_available(self):
        try:
            from app.services.text_services import convert_text_encoding
            src_path = os.path.join(OUTPUT_DIR, "test_input_src.txt")
            with open(src_path, "w", encoding="utf-8") as f:
                f.write("test content for encoding conversion")
            self.test_files_to_clean.append(src_path)

            user_id = 15
            out_path = convert_text_encoding(src_path, user_id=user_id)
            self.test_files_to_clean.append(out_path)

            filename = os.path.basename(out_path)
            self.assertTrue(filename.startswith(f"u{user_id}_"))
        except ImportError:
            # Dependency not in bare local python test runner (e.g. charset_normalizer)
            pass

    def test_check_file_ownership_matrix(self):
        file_name = "u101_sample_output.txt"

        # 1. Owner user (id = 101) -> Allowed
        self.assertTrue(check_file_ownership(file_name, user_id=101, role="operator"))

        # 2. Other user (id = 202) -> Denied (403 condition)
        self.assertFalse(check_file_ownership(file_name, user_id=202, role="operator"))

        # 3. Viewer user (id = 303) -> Denied
        self.assertFalse(check_file_ownership(file_name, user_id=303, role="viewer"))

        # 4. Admin user (id = 999, role = "admin") -> Allowed
        self.assertTrue(check_file_ownership(file_name, user_id=999, role="admin"))

        # 5. Missing / Unauthenticated user (None) -> Denied
        self.assertFalse(check_file_ownership(file_name, user_id=None, role=""))

        # 6. Anonymous / system file without 'u' prefix -> Allowed
        anon_file = "non_owned_sample_uuid.txt"
        self.assertTrue(check_file_ownership(anon_file, user_id=101, role="operator"))
        self.assertTrue(check_file_ownership(anon_file, user_id=202, role="operator"))

if __name__ == "__main__":
    unittest.main()
