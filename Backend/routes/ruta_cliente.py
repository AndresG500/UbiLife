from fastapi import APIRouter, HTTPException, Depends, Request
from models.model_cuidador import RespuestaCuidador, CrearCuidador, ActualizarCuidador, VerificarCuidador
from services.service_cuidador import registrar_cuidador, borrar_cuidador, actualizar_cuidador, verificar_cuidador, actualizar_fcm
from services.service_auth import revocar_token
from security.dependencies import get_cuidador_actual, oauth2_scheme
from security.jwt_handler import verificar_token
from security.limiter import limiter
from database.database import get_database
from pydantic import BaseModel, Field

router = APIRouter(prefix="/cuidadores", tags=["Cuidadores"])

class FCMToken(BaseModel):
    token: str = Field(..., max_length=512)

@router.post("/registrar")
@limiter.limit("10/minute")
async def registrar(request: Request, datos: CrearCuidador):
    resultado = await registrar_cuidador(datos)
    if "error" in resultado:
        raise HTTPException(status_code=400, detail=resultado["error"])
    return resultado

@router.delete("/eliminar")
async def eliminar(cuidador_actual = Depends(get_cuidador_actual)):
    email = cuidador_actual["email"]
    resultado = await borrar_cuidador(email, email)
    if "error" in resultado:
        raise HTTPException(status_code=403, detail=resultado["error"])
    return resultado

@router.put("/actualizar")
async def actualizar(datos: ActualizarCuidador, cuidador_actual = Depends(get_cuidador_actual)):
    email = cuidador_actual["email"]
    resultado = await actualizar_cuidador(email, datos, email)
    if "error" in resultado:
        raise HTTPException(status_code=403, detail=resultado["error"])
    return resultado

@router.get("/perfil")
async def perfil(cuidador_actual = Depends(get_cuidador_actual)):
    cuidador_actual["_id"] = str(cuidador_actual["_id"])
    return cuidador_actual

@router.post("/verificar")
@limiter.limit("5/minute")
async def verificar(request: Request, datos: VerificarCuidador):
    resultado = await verificar_cuidador(datos.email, datos.password)
    if "error" in resultado:
        raise HTTPException(status_code=401, detail=resultado["error"])
    if "mensaje" in resultado:
        raise HTTPException(status_code=401, detail=resultado["mensaje"])
    return resultado


@router.post("/logout")
async def logout(
    token: str = Depends(oauth2_scheme),
    cuidador_actual = Depends(get_cuidador_actual),
):
    datos = verificar_token(token)
    if datos:
        await revocar_token(datos.get("jti"), datos.get("exp"))
    db = get_database()
    await db["UbicacionesCuidadores"].delete_many({"cuidador_id": str(cuidador_actual["_id"])})
    return {"mensaje": "Sesión cerrada exitosamente"}

@router.patch("/fcm-token")
async def actualizar_fcm_token(
    datos: FCMToken,
    cuidador_actual: dict = Depends(get_cuidador_actual),
):
    email = cuidador_actual.get("email")
    return await actualizar_fcm(email, datos.token)