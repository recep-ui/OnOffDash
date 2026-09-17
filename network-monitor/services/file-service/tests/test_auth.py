import os
import unittest
import jwt

os.environ["JWT_SECRET"] = "this-is-a-test-jwt-secret-key-at-least-32-chars-long"

from app.utils.auth import verify_jwt_token, HTTPException

class TestFileAuth(unittest.TestCase):
    def setUp(self):
        self.secret = os.environ["JWT_SECRET"]
        self.valid_token = jwt.encode(
            {"id": 99, "username": "file_operator", "role": "operator"},
            self.secret,
            algorithm="HS256"
        )

    def test_valid_token_decoding(self):
        payload = verify_jwt_token(self.valid_token)
        self.assertEqual(payload["id"], 99)
        self.assertEqual(payload["username"], "file_operator")
        self.assertEqual(payload["role"], "operator")

    def test_invalid_signature_rejection(self):
        tampered_token = jwt.encode(
            {"id": 99, "username": "attacker", "role": "admin"},
            "wrong-secret-key-32-characters-long-12345",
            algorithm="HS256"
        )
        with self.assertRaises(HTTPException) as ctx:
            verify_jwt_token(tampered_token)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_empty_token_rejection(self):
        with self.assertRaises(HTTPException) as ctx:
            verify_jwt_token("")
        self.assertEqual(ctx.exception.status_code, 401)

if __name__ == "__main__":
    unittest.main()
