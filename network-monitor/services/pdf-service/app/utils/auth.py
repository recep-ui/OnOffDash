import os
import json
import urllib.request
import urllib.error
import jwt

try:
    from fastapi import HTTPException, Security, status, Request
    from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
except ImportError:
    class HTTPException(Exception):
        def __init__(self, status_code, detail):
            self.status_code = status_code
            self.detail = detail
            super().__init__(f"{status_code}: {detail}")
    class status:
        HTTP_401_UNAUTHORIZED = 401
        HTTP_403_FORBIDDEN = 403
        HTTP_500_INTERNAL_SERVER_ERROR = 500
    def Security(x): return None
    class HTTPBearer:
        def __init__(self, *a, **k): pass
    class HTTPAuthorizationCredentials: pass
    class Request: pass

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

security = HTTPBearer(auto_error=False)

def get_verification_key_and_alg():
    """Returns the verification key (public RSA key or symmetric secret) and permitted algorithms."""
    public_key = os.getenv("JWT_PUBLIC_KEY")
    pub_key_path = os.getenv("JWT_PUBLIC_KEY_PATH")

    if not public_key and pub_key_path and os.path.exists(pub_key_path):
        try:
            with open(pub_key_path, "r", encoding="utf-8") as f:
                public_key = f.read()
        except Exception:
            pass

    if public_key and "-----BEGIN" in public_key:
        return public_key.strip(), ["RS256"]

    secret = os.getenv("JWT_SECRET")
    if secret:
        return secret, ["HS256", "RS256"]

    return None, []

def check_authoritative_revocation(token: str, user_id: int, token_version: int, role: str) -> None:
    """
    Validates token against authoritative session state via backend introspection or direct DB query.
    Fails closed if the token is revoked, user deleted, role changed, or token_version incremented.
    """
    introspection_url = os.getenv("AUTH_INTROSPECTION_URL")
    if introspection_url:
        try:
            req = urllib.request.Request(
                introspection_url,
                data=json.dumps({"token": token}).encode("utf-8"),
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=3) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if not data.get("active"):
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail=data.get("error", "Oturum sonlandırıldı veya geçersiz kılındı.")
                    )
                active_user = data.get("user", {})
                if str(active_user.get("role", "")).lower() != str(role).lower():
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Kullanıcı rolü güncellenmiştir. Lütfen tekrar giriş yapınız."
                    )
                if int(active_user.get("token_version", 1)) > int(token_version):
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Oturum sonlandırıldı veya parola değiştirildi. Lütfen tekrar giriş yapınız."
                    )
                return
        except urllib.error.HTTPError as he:
            try:
                err_body = json.loads(he.read().decode("utf-8"))
                err_detail = err_body.get("error", "Oturum doğrulanamadı.")
            except Exception:
                err_detail = "Oturum sonlandırıldı veya geçersiz kılındı."
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=err_detail
            )
        except urllib.error.URLError:
            pass  # Fall back to DB check if introspection is unreachable

    # Direct database fallback if MSSQL environment is configured
    db_host = os.getenv("DB_HOST")
    db_pass = os.getenv("DB_PASSWORD") or os.getenv("DB_APP_PASSWORD")
    if db_host and db_pass:
        try:
            import pymssql
            conn = pymssql.connect(
                server=db_host,
                port=int(os.getenv("DB_PORT", "1433")),
                user=os.getenv("DB_USER", os.getenv("DB_APP_USER", "onoffdash_app")),
                password=db_pass,
                database=os.getenv("DB_NAME", "network_monitor"),
                timeout=3
            )
            cursor = conn.cursor(as_dict=True)
            cursor.execute("SELECT id, role, token_version, must_change_password FROM users WHERE id = %s", (user_id,))
            row = cursor.fetchone()
            conn.close()

            if not row:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Kullanıcı hesabı bulunamadı veya silinmiştir."
                )
            if str(row["role"]).lower() != str(role).lower():
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Kullanıcı rolü güncellenmiştir. Lütfen tekrar giriş yapınız."
                )
            if int(row["token_version"] or 1) > int(token_version):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Oturum sonlandırıldı veya parola değiştirildi. Lütfen tekrar giriş yapınız."
                )
            if bool(row.get("must_change_password")):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Parola değiştirilmesi gerekmektedir."
                )
        except HTTPException:
            raise
        except Exception:
            pass

def verify_jwt_token(token: str) -> dict:
    """Verifies and decodes a JWT token with explicit algorithm, required claims, and authoritative revocation."""
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Erişim engellendi. Giriş yapılması gerekiyor."
        )

    verify_key, algorithms = get_verification_key_and_alg()
    if not verify_key or not algorithms:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Sunucu güvenlik yapılandırması eksik (JWT_PUBLIC_KEY veya JWT_SECRET)."
        )

    try:
        payload = jwt.decode(
            token,
            verify_key,
            algorithms=algorithms,
            options={
                "require": ["exp"]
            }
        )

        user_id = payload.get("id") if payload.get("id") is not None else payload.get("sub")
        role = payload.get("role")
        token_version = payload.get("token_version")

        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Geçersiz kimlik belirteci: kullanıcı kimliği (id/sub) eksik."
            )
        if not role or not isinstance(role, str):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Geçersiz kimlik belirteci: kullanıcı rolü eksik."
            )
        if token_version is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Geçersiz kimlik belirteci: token_version eksik."
            )
        if payload.get("must_change_password") is True:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Parola değiştirilmesi gerekmektedir."
            )

        # Authoritative real-time revocation check against backend or database
        check_authoritative_revocation(token, int(user_id), int(token_version), role)

        return payload
    except HTTPException:
        raise
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Oturum süresi dolmuş."
        )
    except jwt.MissingRequiredClaimError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Geçersiz kimlik belirteci: zorunlu alanlar eksik."
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Geçersiz oturum anahtarı."
        )

async def require_authenticated_user(
    request: Request = None,
    credentials: HTTPAuthorizationCredentials = Security(security)
) -> dict:
    """FastAPI dependency to require a valid authenticated user strictly via Authorization Bearer token."""
    token = None
    if credentials and getattr(credentials, "credentials", None):
        token = credentials.credentials

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Erişim engellendi. Giriş yapılması gerekiyor."
        )
    return verify_jwt_token(token)
