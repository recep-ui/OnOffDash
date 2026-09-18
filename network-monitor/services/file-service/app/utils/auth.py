import os
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

JWT_SECRET = os.getenv("JWT_SECRET")

def verify_jwt_token(token: str) -> dict:
    """Verifies and decodes a JWT token against JWT_SECRET, enforcing required identity claims."""
    secret = os.getenv("JWT_SECRET") or JWT_SECRET
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Erişim engellendi. Giriş yapılması gerekiyor."
        )
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Sunucu güvenlik yapılandırması eksik (JWT_SECRET)."
        )
    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            options={
                "require": ["exp"]
            }
        )

        # Enforce required identity claims (fail-closed)
        user_id = payload.get("id") or payload.get("sub")
        role = payload.get("role")

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
        if payload.get("must_change_password") is True:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Parola değiştirilmesi gerekmektedir."
            )

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
            detail="Geçersiz kimlik belirteci: son kullanma tarihi (exp) eksik."
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
    if credentials and getattr(credentials, 'credentials', None):
        token = credentials.credentials

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Erişim engellendi. Giriş yapılması gerekiyor."
        )
    return verify_jwt_token(token)

