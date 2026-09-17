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
    """Verifies and decodes a JWT token against JWT_SECRET."""
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
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Oturum süresi dolmuş."
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

