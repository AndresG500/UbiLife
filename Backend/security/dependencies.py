from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from security.jwt_handler import verificar_token
from services.service_auth import token_revocado
from database.database import get_database

# ─── Configuración ───────────────────────────────────────────────────────────
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/cuidadores/verificar")


# ─── Dependencia principal ───────────────────────────────────────────────────
async def get_cuidador_actual(token: str = Depends(oauth2_scheme)):
    credenciales_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No autenticado o token inválido",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # 1. Verificar firma y vencimiento del token
    token_data = verificar_token(token)
    if token_data is None:
        raise credenciales_exception

    # 2. Verificar que el token no haya sido revocado (logout)
    if await token_revocado(token_data.get("jti")):
        raise credenciales_exception

    # 3. Buscar cuidador en la base de datos
    db = get_database()
    cuidador = await db["Cuidadores"].find_one(
        {"email": token_data["email"]},
        {"password": 0}
    )

    if cuidador is None:
        raise credenciales_exception

    return cuidador


async def get_cuidador_o_familiar_actual(token: str = Depends(oauth2_scheme)):
    """Acepta tokens de cuidador o familiar; agrega '_tipo' al dict retornado."""
    credenciales_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No autenticado o token inválido",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token_data = verificar_token(token)
    if token_data is None:
        raise credenciales_exception
    if await token_revocado(token_data.get("jti")):
        raise credenciales_exception

    db = get_database()
    email = token_data["email"]

    cuidador = await db["Cuidadores"].find_one({"email": email}, {"password": 0})
    if cuidador:
        cuidador["_tipo"] = "cuidador"
        return cuidador

    familiar = await db["Familiares"].find_one({"email": email}, {"password": 0})
    if familiar:
        familiar["_tipo"] = "familiar"
        return familiar

    raise credenciales_exception


async def get_admin_actual(token: str = Depends(oauth2_scheme)):
    credenciales_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No autenticado o token inválido",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token_data = verificar_token(token)
    if token_data is None:
        raise credenciales_exception
    if await token_revocado(token_data.get("jti")):
        raise credenciales_exception

    db    = get_database()
    admin = await db["Administradores"].find_one(
        {"email": token_data["email"], "activo": True},
        {"password": 0},
    )
    if admin is None:
        raise credenciales_exception
    return admin


async def get_familiar_actual(token: str = Depends(oauth2_scheme)):
    credenciales_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No autenticado o token inválido",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token_data = verificar_token(token)
    if token_data is None:
        raise credenciales_exception

    if await token_revocado(token_data.get("jti")):
        raise credenciales_exception

    db = get_database()
    familiar = await db["Familiares"].find_one(
        {"email": token_data["email"]},
        {"password": 0}
    )

    if familiar is None:
        raise credenciales_exception

    return familiar
