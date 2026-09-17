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

# Fallback in local dev: read backend/.env if JWT_SECRET is not in environment
if not JWT_SECRET:
    backend_env_path = os.path.join(os.path.dirname(BASE_DIR), "backend", ".env")
    if os.path.exists(backend_env_path):
        try:
            with open(backend_env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line_clean = line.strip()
                    if line_clean.startswith("JWT_SECRET=") and not line_clean.startswith("#"):
                        JWT_SECRET = line_clean.split("=", 1)[1].strip().strip('"').strip("'")
                        break
        except Exception:
            pass

def verify_jwt_token(token: str) -> dict:
    """Verifies and decodes a JWT token against JWT_SECRET."""
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Erişim engellendi. Giriş yapılması gerekiyor."
        )
    if not JWT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Sunucu güvenlik yapılandırması eksik (JWT_SECRET)."
        )
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Oturum süresi dolmuş."
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Geçersiz oturum anahtarı."
        )

async def require_authenticated_user(
    request: Request = None,
    credentials: HTTPAuthorizationCredentials = Security(security)
) -> dict:
    """FastAPI dependency to require a valid authenticated user via Bearer token or query token."""
    token = None
    if credentials and getattr(credentials, 'credentials', None):
        token = credentials.credentials
    elif request and hasattr(request, 'query_params') and request.query_params.get("token"):
        token = request.query_params.get("token")

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Erişim engellendi. Giriş yapılması gerekiyor."
        )
    return verify_jwt_token(token)
