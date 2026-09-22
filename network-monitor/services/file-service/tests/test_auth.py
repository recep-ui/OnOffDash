import os
import unittest
import asyncio
import jwt
import time
from unittest.mock import patch, MagicMock

os.environ["JWT_SECRET"] = "this-is-a-test-jwt-secret-key-at-least-32-chars-long"

from app.utils.auth import verify_jwt_token, require_authenticated_user, HTTPException

class DummyCredentials:
    def __init__(self, token):
        self.credentials = token

class TestFileAuth(unittest.TestCase):
    def setUp(self):
        self.secret = os.environ["JWT_SECRET"]
        self.valid_token = jwt.encode(
            {"id": 99, "username": "file_operator", "role": "operator", "token_version": 1, "exp": int(time.time()) + 3600},
            self.secret,
            algorithm="HS256"
        )

    def test_valid_token_decoding(self):
        payload = verify_jwt_token(self.valid_token)
        self.assertEqual(payload["id"], 99)
        self.assertEqual(payload["username"], "file_operator")
        self.assertEqual(payload["role"], "operator")
        self.assertEqual(payload["token_version"], 1)

    def test_missing_exp_claim_rejection(self):
        token_no_exp = jwt.encode(
            {"id": 99, "username": "file_operator", "role": "operator", "token_version": 1},
            self.secret,
            algorithm="HS256"
        )
        with self.assertRaises(HTTPException) as ctx:
            verify_jwt_token(token_no_exp)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_missing_token_version_rejection(self):
        token_no_tv = jwt.encode(
            {"id": 99, "username": "file_operator", "role": "operator", "exp": int(time.time()) + 3600},
            self.secret,
            algorithm="HS256"
        )
        with self.assertRaises(HTTPException) as ctx:
            verify_jwt_token(token_no_tv)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertTrue("token_version" in ctx.exception.detail)

    def test_invalid_signature_rejection(self):
        tampered_token = jwt.encode(
            {"id": 99, "username": "attacker", "role": "admin", "token_version": 1, "exp": int(time.time()) + 3600},
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
            {"username": "anonymous", "role": "operator", "token_version": 1, "exp": int(time.time()) + 3600},
            self.secret,
            algorithm="HS256"
        )
        with self.assertRaises(HTTPException) as ctx:
            verify_jwt_token(token_no_id)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_missing_role_claim_rejection(self):
        token_no_role = jwt.encode(
            {"id": 99, "username": "no_role_user", "token_version": 1, "exp": int(time.time()) + 3600},
            self.secret,
            algorithm="HS256"
        )
        with self.assertRaises(HTTPException) as ctx:
            verify_jwt_token(token_no_role)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_must_change_password_forbidden(self):
        token_must_change = jwt.encode(
            {"id": 99, "username": "new_user", "role": "viewer", "token_version": 1, "must_change_password": True, "exp": int(time.time()) + 3600},
            self.secret,
            algorithm="HS256"
        )
        with self.assertRaises(HTTPException) as ctx:
            verify_jwt_token(token_must_change)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_asymmetric_rs256_verification(self):
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.primitives import serialization

        # Generate test RSA keypair
        priv_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        priv_pem = priv_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption()
        ).decode("utf-8")
        pub_pem = priv_key.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        ).decode("utf-8")

        rs256_token = jwt.encode(
            {"id": 88, "username": "file_admin", "role": "admin", "token_version": 1, "exp": int(time.time()) + 3600},
            priv_pem,
            algorithm="RS256"
        )

        old_pub = os.environ.get("JWT_PUBLIC_KEY")
        try:
            os.environ["JWT_PUBLIC_KEY"] = pub_pem
            payload = verify_jwt_token(rs256_token)
            self.assertEqual(payload["id"], 88)
            self.assertEqual(payload["username"], "file_admin")
            self.assertEqual(payload["role"], "admin")
        finally:
            if old_pub:
                os.environ["JWT_PUBLIC_KEY"] = old_pub
            else:
                os.environ.pop("JWT_PUBLIC_KEY", None)

    def test_introspection_revocation_rejection(self):
        old_intro = os.environ.get("AUTH_INTROSPECTION_URL")
        os.environ["AUTH_INTROSPECTION_URL"] = "http://localhost:3001/api/auth/introspect"
        try:
            mock_response = MagicMock()
            mock_response.read.return_value = b'{"active": false, "error": "Token has been revoked"}'
            mock_response.__enter__.return_value = mock_response

            with patch("urllib.request.urlopen", return_value=mock_response):
                with self.assertRaises(HTTPException) as ctx:
                    verify_jwt_token(self.valid_token)
                self.assertEqual(ctx.exception.status_code, 401)
                self.assertTrue("revoked" in ctx.exception.detail.lower() or "sonland\xc4\xb1r\xc4\xb1ld\xc4\xb1" in ctx.exception.detail)
        finally:
            if old_intro:
                os.environ["AUTH_INTROSPECTION_URL"] = old_intro
            else:
                os.environ.pop("AUTH_INTROSPECTION_URL", None)

if __name__ == "__main__":
    unittest.main()
