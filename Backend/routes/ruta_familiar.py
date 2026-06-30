from fastapi import APIRouter, HTTPException, Depends, Request
from models.model_familiar import CrearFamiliar, VerificarFamiliar, ActualizarFamiliar
from services.service_familiar import (
    registrar_familiar, verificar_familiar,
    listar_grupos_familiar, listar_pacientes_familiar,
    actualizar_fcm_familiar, actualizar_familiar,
)
from pydantic import BaseModel, Field
from security.limiter import limiter
from services.service_auth import revocar_token
from security.dependencies import get_familiar_actual, oauth2_scheme
from security.jwt_handler import verificar_token
from database.database import get_database


class FCMTokenFamiliar(BaseModel):
    token: str = Field(..., max_length=512)

router = APIRouter(prefix="/familiares", tags=["Familiares"])


@router.post("/registrar")
@limiter.limit("10/minute")
async def registrar(request: Request, datos: CrearFamiliar):
    resultado = await registrar_familiar(datos)
    if "error" in resultado:
        raise HTTPException(status_code=400, detail=resultado["error"])
    return resultado


@router.post("/verificar")
@limiter.limit("5/minute")
async def verificar(request: Request, datos: VerificarFamiliar):
    resultado = await verificar_familiar(datos.email, datos.password)
    if "mensaje" in resultado:
        raise HTTPException(status_code=401, detail=resultado["mensaje"])
    return resultado


@router.post("/logout")
async def logout(
    token: str = Depends(oauth2_scheme),
    familiar_actual=Depends(get_familiar_actual),
):
    datos = verificar_token(token)
    if datos:
        await revocar_token(datos.get("jti"), datos.get("exp"))
    db = get_database()
    await db["UbicacionesFamiliares"].delete_many({"familiar_id": str(familiar_actual["_id"])})
    return {"mensaje": "Sesión cerrada exitosamente"}


@router.get("/grupos")
async def mis_grupos(familiar_actual=Depends(get_familiar_actual)):
    familiar_id = str(familiar_actual["_id"])
    resultado   = await listar_grupos_familiar(familiar_id)
    if isinstance(resultado, dict) and "error" in resultado:
        raise HTTPException(status_code=500, detail=resultado["error"])
    return resultado


@router.put("/actualizar")
async def actualizar_perfil_familiar(
    datos: ActualizarFamiliar,
    familiar_actual = Depends(get_familiar_actual),
):
    familiar_id = str(familiar_actual["_id"])
    resultado   = await actualizar_familiar(familiar_id, datos.model_dump(exclude_none=True))
    if "error" in resultado:
        raise HTTPException(status_code=400, detail=resultado["error"])
    return resultado


@router.patch("/fcm-token")
async def actualizar_fcm_token_familiar(
    datos: FCMTokenFamiliar,
    familiar_actual = Depends(get_familiar_actual),
):
    return await actualizar_fcm_familiar(familiar_actual["email"], datos.token)


@router.get("/pacientes")
async def mis_pacientes(familiar_actual=Depends(get_familiar_actual)):
    familiar_id = str(familiar_actual["_id"])
    resultado   = await listar_pacientes_familiar(familiar_id)
    if isinstance(resultado, dict) and "error" in resultado:
        raise HTTPException(status_code=500, detail=resultado["error"])
    return resultado
