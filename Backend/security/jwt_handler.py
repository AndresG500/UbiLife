import uuid
import jwt
from datetime import datetime, timedelta, timezone
from typing import Optional
from dotenv import load_dotenv
import os

# ─── Configuración ───────────────────────────────────────────────────────────
load_dotenv()
SECRET_KEY  = os.getenv("SECRET_KEY")
ALGORITHM   = os.getenv("ALGORITHM")
_expire_str = os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES")

if not SECRET_KEY or not ALGORITHM or not _expire_str:
    raise ValueError("Variables de entorno JWT requeridas: SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES")

ACCESS_TOKEN_EXPIRE_MINUTES = int(_expire_str)


# ─── Crear token ─────────────────────────────────────────────────────────────
def crear_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    payload = data.copy()
    expire  = datetime.now(timezone.utc) + (
        expires_delta if expires_delta
        else timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload.update({"exp": expire, "jti": str(uuid.uuid4())})
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


# ─── Verificar token ─────────────────────────────────────────────────────────
def verificar_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            return None
        return {
            "email": email,
            "jti":   payload.get("jti"),
            "exp":   payload.get("exp"),
        }
    except jwt.PyJWTError:
        return None