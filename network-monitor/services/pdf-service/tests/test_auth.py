import os
import unittest
import asyncio
import jwt
import time
from unittest.mock import patch, MagicMock

os.environ["JWT_SECRET"] = "this-is-a-test-jwt-secret-key-at-least-32-chars-long"
os.environ["AUTH_INTROSPECTION_URL"] = "http://localhost:3001/api/auth/introspect"
os.environ["AUTH_INTROSPECTION_SECRET"] = "ci-test-introspection-secret-key-min-32-chars"

from app.utils.auth import verify_jwt_token, require_authenticated_user, HTTPException

class DummyCredentials:
    def __init__(self, token):
        self.credentials = token

class TestPdfAuth(unittest.TestCase):
    def setUp(self):
        self.secret = os.environ["JWT_SECRET"]
        now = int(time.time())
        self.valid_token = jwt.encode(
            {
                "id": 42,
                "username": "pdf_operator",
                "role": "operator",
                "token_version": 1,
                "exp": now + 3600,
                "iat": now,
                "iss": "onoffdash-auth",
                "aud": "onoffdash"
            },
            self.secret,
            algorithm="HS256"
        )
        # Default mock response for healthy authoritative check
        self.mock_healthy_introspection = MagicMock()
        self.mock_healthy_introspection.read.return_value = (
            b'{"active": true, "user": {"id": 42, "username": "pdf_operator", "role": "operator", "token_version": 1}}'
        )
        self.mock_healthy_introspection.__enter__.return_value = self.mock_healthy_introspection

    def test_valid_token_decoding(self):
        with patch("urllib.request.urlopen", return_value=self.mock_healthy_introspection):
            payload = verify_jwt_token(self.valid_token)
            self.assertEqual(payload["id"], 42)
            self.assertEqual(payload["username"], "pdf_operator")
            self.assertEqual(payload["role"], "operator")
            self.assertEqual(payload["token_version"], 1)

    def test_missing_exp_claim_rejection(self):
        token_no_exp = jwt.encode(
            {"id": 42, "username": "pdf_operator", "role": "operator", "token_version": 1, "iat": int(time.time()), "iss": "onoffdash-auth", "aud": "onoffdash"},
            self.secret,
            algorithm="HS256"
        )
        with self.assertRaises(HTTPException) as ctx:
            verify_jwt_token(token_no_exp)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_missing_token_version_rejection(self):
        token_no_tv = jwt.encode(
            {"id": 42, "username": "pdf_operator", "role": "operator", "exp": int(time.time()) + 3600, "iat": int(time.time()), "iss": "onoffdash-auth", "aud": "onoffdash"},
            self.secret,
            algorithm="HS256"
        )
        with self.assertRaises(HTTPException) as ctx:
            verify_jwt_token(token_no_tv)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertTrue("token_version" in ctx.exception.detail)

    def test_invalid_signature_rejection(self):
        tampered_token = jwt.encode(
            {"id": 42, "username": "hacker", "role": "admin", "token_version": 1, "exp": int(time.time()) + 3600, "iat": int(time.time()), "iss": "onoffdash-auth", "aud": "onoffdash"},
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

    def test_wrong_issuer_rejection(self):
        wrong_iss_token = jwt.encode(
            {"id": 42, "username": "pdf_operator", "role": "operator", "token_version": 1, "exp": int(time.time()) + 3600, "iat": int(time.time()), "iss": "rogue-auth-service", "aud": "onoffdash"},
            self.secret,
            algorithm="HS256"
        )
        with self.assertRaises(HTTPException) as ctx:
            verify_jwt_token(wrong_iss_token)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_wrong_audience_rejection(self):
        wrong_aud_token = jwt.encode(
            {"id": 42, "username": "pdf_operator", "role": "operator", "token_version": 1, "exp": int(time.time()) + 3600, "iat": int(time.time()), "iss": "onoffdash-auth", "aud": "rogue-service"},
            self.secret,
            algorithm="HS256"
        )
        with self.assertRaises(HTTPException) as ctx:
            verify_jwt_token(wrong_aud_token)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_missing_iss_or_aud_rejection(self):
        no_iss_token = jwt.encode(
            {"id": 42, "username": "pdf_operator", "role": "operator", "token_version": 1, "exp": int(time.time()) + 3600, "iat": int(time.time())},
            self.secret,
            algorithm="HS256"
        )
        with self.assertRaises(HTTPException) as ctx:
            verify_jwt_token(no_iss_token)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_must_change_password_forbidden(self):
        token_must_change = jwt.encode(
            {"id": 42, "username": "new_user", "role": "viewer", "token_version": 1, "must_change_password": True, "exp": int(time.time()) + 3600, "iat": int(time.time()), "iss": "onoffdash-auth", "aud": "onoffdash"},
            self.secret,
            algorithm="HS256"
        )
        with self.assertRaises(HTTPException) as ctx:
            verify_jwt_token(token_must_change)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_fail_closed_when_authority_unavailable(self):
        # Simulate introspection server unreachable AND database unavailable
        import urllib.error
        with patch("urllib.request.urlopen", side_effect=urllib.error.URLError("Connection refused")):
            with self.assertRaises(HTTPException) as ctx:
                verify_jwt_token(self.valid_token)
            self.assertEqual(ctx.exception.status_code, 503)
            self.assertTrue("unavailable" in ctx.exception.detail.lower())

    def test_introspection_revocation_rejection(self):
        mock_response = MagicMock()
        mock_response.read.return_value = b'{"active": false, "error": "Oturum sonlandirildi."}'
        mock_response.__enter__.return_value = mock_response

        with patch("urllib.request.urlopen", return_value=mock_response):
            with self.assertRaises(HTTPException) as ctx:
                verify_jwt_token(self.valid_token)
            self.assertEqual(ctx.exception.status_code, 401)

    def test_introspection_token_version_mismatch_rejection(self):
        mock_response = MagicMock()
        # Active in backend, but user password changed so token_version is now 2
        mock_response.read.return_value = b'{"active": true, "user": {"id": 42, "role": "operator", "token_version": 2}}'
        mock_response.__enter__.return_value = mock_response

        with patch("urllib.request.urlopen", return_value=mock_response):
            with self.assertRaises(HTTPException) as ctx:
                verify_jwt_token(self.valid_token)
            self.assertEqual(ctx.exception.status_code, 401)

    def test_introspection_role_mismatch_rejection(self):
        mock_response = MagicMock()
        # Active in backend, but user role changed from operator to viewer
        mock_response.read.return_value = b'{"active": true, "user": {"id": 42, "role": "viewer", "token_version": 1}}'
        mock_response.__enter__.return_value = mock_response

        with patch("urllib.request.urlopen", return_value=mock_response):
            with self.assertRaises(HTTPException) as ctx:
                verify_jwt_token(self.valid_token)
            self.assertEqual(ctx.exception.status_code, 401)

    def test_introspection_must_change_password_forbidden(self):
        mock_response = MagicMock()
        mock_response.read.return_value = b'{"active": true, "user": {"id": 42, "role": "operator", "token_version": 1, "must_change_password": true}}'
        mock_response.__enter__.return_value = mock_response

        with patch("urllib.request.urlopen", return_value=mock_response):
            with self.assertRaises(HTTPException) as ctx:
                verify_jwt_token(self.valid_token)
            self.assertEqual(ctx.exception.status_code, 403)

    def test_introspection_sends_internal_service_key(self):
        captured_requests = []
        def capture_urlopen(req, timeout=3):
            captured_requests.append(req)
            return self.mock_healthy_introspection

        with patch("urllib.request.urlopen", side_effect=capture_urlopen):
            verify_jwt_token(self.valid_token)
            self.assertEqual(len(captured_requests), 1)
            req = captured_requests[0]
            self.assertEqual(req.headers.get("X-internal-service-key"), "ci-test-introspection-secret-key-min-32-chars")

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

        now = int(time.time())
        rs256_token = jwt.encode(
            {
                "id": 77,
                "username": "rsa_user",
                "role": "admin",
                "token_version": 1,
                "exp": now + 3600,
                "iat": now,
                "iss": "onoffdash-auth",
                "aud": "onoffdash"
            },
            priv_pem,
            algorithm="RS256"
        )

        old_pub = os.environ.get("JWT_PUBLIC_KEY")
        try:
            os.environ["JWT_PUBLIC_KEY"] = pub_pem
            mock_rs256_resp = MagicMock()
            mock_rs256_resp.read.return_value = b'{"active": true, "user": {"id": 77, "username": "rsa_user", "role": "admin", "token_version": 1}}'
            mock_rs256_resp.__enter__.return_value = mock_rs256_resp

            with patch("urllib.request.urlopen", return_value=mock_rs256_resp):
                payload = verify_jwt_token(rs256_token)
                self.assertEqual(payload["id"], 77)
                self.assertEqual(payload["username"], "rsa_user")
                self.assertEqual(payload["role"], "admin")
        finally:
            if old_pub:
                os.environ["JWT_PUBLIC_KEY"] = old_pub
            else:
                os.environ.pop("JWT_PUBLIC_KEY", None)

    def test_production_rejects_hs256_fallback(self):
        old_env = os.environ.get("APP_ENV")
        os.environ["APP_ENV"] = "production"
        try:
            # Without JWT_PUBLIC_KEY configured, production mode should reject HS256 and fail closed with 500
            with self.assertRaises(HTTPException) as ctx:
                verify_jwt_token(self.valid_token)
            self.assertEqual(ctx.exception.status_code, 500)
        finally:
            if old_env:
                os.environ["APP_ENV"] = old_env
            else:
                os.environ.pop("APP_ENV", None)

    def test_require_authenticated_user_with_bearer(self):
        with patch("urllib.request.urlopen", return_value=self.mock_healthy_introspection):
            creds = DummyCredentials(self.valid_token)
            user = asyncio.run(require_authenticated_user(None, creds))
            self.assertEqual(user["id"], 42)
            self.assertEqual(user["username"], "pdf_operator")

    def test_require_authenticated_user_missing_credentials(self):
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(require_authenticated_user(None, None))
        self.assertEqual(ctx.exception.status_code, 401)

if __name__ == "__main__":
    unittest.main()
