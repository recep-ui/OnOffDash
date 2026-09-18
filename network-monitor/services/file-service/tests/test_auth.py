import os
import unittest
import asyncio
import jwt

os.environ["JWT_SECRET"] = "this-is-a-test-jwt-secret-key-at-least-32-chars-long"

from app.utils.auth import verify_jwt_token, require_authenticated_user, HTTPException

class DummyCredentials:
    def __init__(self, token):
        self.credentials = token

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
        self.assertEqual(ctx.exception.status_code, 401)

    def test_empty_token_rejection(self):
        with self.assertRaises(HTTPException) as ctx:
            verify_jwt_token("")
        self.assertEqual(ctx.exception.status_code, 401)

    def test_require_authenticated_user_with_bearer(self):
        creds = DummyCredentials(self.valid_token)
        user = asyncio.run(require_authenticated_user(None, creds))
        self.assertEqual(user["id"], 99)
        self.assertEqual(user["username"], "file_operator")

    def test_require_authenticated_user_missing_credentials(self):
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(require_authenticated_user(None, None))
        self.assertEqual(ctx.exception.status_code, 401)

    def test_missing_id_claim_rejection(self):
        token_no_id = jwt.encode(
            {"username": "anonymous", "role": "operator"},
            self.secret,
            algorithm="HS256"
        )
        with self.assertRaises(HTTPException) as ctx:
            verify_jwt_token(token_no_id)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_missing_role_claim_rejection(self):
        token_no_role = jwt.encode(
            {"id": 99, "username": "no_role_user"},
            self.secret,
            algorithm="HS256"
        )
        with self.assertRaises(HTTPException) as ctx:
            verify_jwt_token(token_no_role)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_must_change_password_forbidden(self):
        token_must_change = jwt.encode(
            {"id": 99, "username": "new_user", "role": "viewer", "must_change_password": True},
            self.secret,
            algorithm="HS256"
        )
        with self.assertRaises(HTTPException) as ctx:
            verify_jwt_token(token_must_change)
        self.assertEqual(ctx.exception.status_code, 403)

if __name__ == "__main__":
    unittest.main()
