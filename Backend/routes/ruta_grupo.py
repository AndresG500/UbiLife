from typing import Annotated
from fastapi import APIRouter, HTTPException, Depends, Path, Request
from pydantic import BaseModel
from models.model_grupo import CrearGrupo, ActualizarGrupo, AgregarCuidador, AgregarPaciente, UbicacionCuidador, UbicacionFamiliar, CrearInvitacion
from services.service_grupo import (
    listar_grupos, crear_grupo, eliminar_grupo, obtener_grupo, actualizar_grupo,
    agregar_cuidador, eliminar_cuidador, eliminar_familiar,
    agregar_paciente,
    guardar_ubicacion_cuidador, obtener_ubicaciones_grupo, obtener_cuidador_mas_cercano,
    guardar_ubicacion_familiar, obtener_ubicaciones_grupo_familiar,
    obtener_miembros_grupo,
    consumir_invitacion, crear_invitacion, listar_invitaciones, revocar_invitacion,
)
from security.dependencies import get_cuidador_actual, get_familiar_actual
from security.limiter import limiter

class UnirseGrupo(BaseModel):
    codigo: str

MongoId = Annotated[str, Path(pattern=r'^[a-f\d]{24}$')]
router = APIRouter(prefix="/grupos", tags=["Grupos"])


# --- Endpoints protegidos (requieren JWT) ---

@router.get("/")
async def listar(cuidador_actual = Depends(get_cuidador_actual)):
    cuidador_id = str(cuidador_actual["_id"])
    resultado   = await listar_grupos(cuidador_id)
    if isinstance(resultado, dict) and "error" in resultado:
        raise HTTPException(status_code=500, detail=resultado["error"])
    return resultado


@router.post("/unirse")
@limiter.limit("5/minute")
async def unirse(
    request: Request,
    datos: UnirseGrupo,
    familiar_actual = Depends(get_familiar_actual),
):
    familiar_id = str(familiar_actual["_id"])
    resultado   = await consumir_invitacion(datos.codigo, familiar_id)
    if "error" in resultado:
        raise HTTPException(status_code=400, detail=resultado["error"])
    return resultado


@router.post("/registrar")
async def registrar(
    datos: CrearGrupo,
    cuidador_actual = Depends(get_cuidador_actual)
):
    datos.cuidador_principal_id = str(cuidador_actual["_id"])
    resultado = await crear_grupo(datos)
    if "error" in resultado:
        raise HTTPException(status_code=500, detail=resultado["error"])
    return resultado


@router.delete("/{grupo_id}")
async def eliminar(
    grupo_id: MongoId,
    cuidador_actual = Depends(get_cuidador_actual)
):
    cuidador_id = str(cuidador_actual["_id"])
    resultado = await eliminar_grupo(grupo_id, cuidador_id)
    if "error" in resultado:
        raise HTTPException(status_code=403, detail=resultado["error"])
    return resultado


@router.put("/{grupo_id}")
async def actualizar(
    grupo_id: MongoId,
    datos: ActualizarGrupo,
    cuidador_actual = Depends(get_cuidador_actual)
):
    cuidador_id = str(cuidador_actual["_id"])
    resultado = await actualizar_grupo(grupo_id, cuidador_id, datos)
    if "error" in resultado:
        raise HTTPException(status_code=403, detail=resultado["error"])
    return resultado


@router.get("/{grupo_id}")
async def obtener(
    grupo_id: MongoId,
    cuidador_actual = Depends(get_cuidador_actual)
):
    resultado = await obtener_grupo(grupo_id)
    if "error" in resultado:
        raise HTTPException(status_code=404, detail=resultado["error"])
    if str(cuidador_actual["_id"]) not in resultado.get("cuidador_ids", []):
        raise HTTPException(status_code=403, detail="No tienes acceso a este grupo")
    return resultado


@router.post("/{grupo_id}/cuidadores")
async def add_cuidador(
    grupo_id: MongoId,
    datos: AgregarCuidador,
    cuidador_actual = Depends(get_cuidador_actual)
):
    resultado = await agregar_cuidador(grupo_id, datos.cuidador_id, str(cuidador_actual["_id"]))
    if "error" in resultado:
        raise HTTPException(status_code=403, detail=resultado["error"])
    if "mensaje" in resultado and "ya pertenece" in resultado["mensaje"].lower():
        raise HTTPException(status_code=400, detail=resultado["mensaje"])
    return resultado


@router.delete("/{grupo_id}/cuidadores/{cuidador_id}")
async def remove_cuidador(
    grupo_id: MongoId,
    cuidador_id: MongoId,
    cuidador_actual = Depends(get_cuidador_actual)
):
    resultado = await eliminar_cuidador(grupo_id, cuidador_id, str(cuidador_actual["_id"]))
    if "error" in resultado:
        raise HTTPException(status_code=403, detail=resultado["error"])
    return resultado


@router.delete("/{grupo_id}/familiares/{familiar_id}")
async def remove_familiar(
    grupo_id: MongoId,
    familiar_id: MongoId,
    cuidador_actual = Depends(get_cuidador_actual)
):
    resultado = await eliminar_familiar(grupo_id, familiar_id, str(cuidador_actual["_id"]))
    if "error" in resultado:
        raise HTTPException(status_code=403, detail=resultado["error"])
    return resultado


@router.post("/{grupo_id}/invitaciones")
async def crear_invitacion_route(
    grupo_id: MongoId,
    datos: CrearInvitacion,
    cuidador_actual = Depends(get_cuidador_actual)
):
    resultado = await crear_invitacion(grupo_id, str(cuidador_actual["_id"]), datos.expira_horas)
    if "error" in resultado:
        raise HTTPException(status_code=403, detail=resultado["error"])
    return resultado


@router.get("/{grupo_id}/invitaciones")
async def listar_invitaciones_route(
    grupo_id: MongoId,
    cuidador_actual = Depends(get_cuidador_actual)
):
    resultado = await listar_invitaciones(grupo_id, str(cuidador_actual["_id"]))
    if isinstance(resultado, dict) and "error" in resultado:
        raise HTTPException(status_code=403, detail=resultado["error"])
    return resultado


@router.delete("/{grupo_id}/invitaciones/{invitacion_id}")
async def revocar_invitacion_route(
    grupo_id: MongoId,
    invitacion_id: MongoId,
    cuidador_actual = Depends(get_cuidador_actual)
):
    resultado = await revocar_invitacion(grupo_id, invitacion_id, str(cuidador_actual["_id"]))
    if "error" in resultado:
        raise HTTPException(status_code=403, detail=resultado["error"])
    return resultado


@router.post("/{grupo_id}/pacientes")
async def add_paciente(
    grupo_id: MongoId,
    datos: AgregarPaciente,
    cuidador_actual = Depends(get_cuidador_actual)
):
    resultado = await agregar_paciente(grupo_id, datos.paciente_id, str(cuidador_actual["_id"]))
    if "error" in resultado:
        raise HTTPException(status_code=403, detail=resultado["error"])
    if "mensaje" in resultado and "ya pertenece" in resultado["mensaje"].lower():
        raise HTTPException(status_code=400, detail=resultado["mensaje"])
    return resultado


@router.post("/{grupo_id}/ubicacion")
async def guardar_ubicacion(
    grupo_id: MongoId,
    datos: UbicacionCuidador,
    cuidador_actual = Depends(get_cuidador_actual)
):
    datos.cuidador_id = str(cuidador_actual["_id"])
    resultado = await guardar_ubicacion_cuidador(datos)
    if "error" in resultado:
        raise HTTPException(status_code=500, detail=resultado["error"])
    return resultado


@router.get("/{grupo_id}/ubicaciones")
async def obtener_ubicaciones(grupo_id: str, cuidador_actual = Depends(get_cuidador_actual)):
    resultado = await obtener_ubicaciones_grupo(grupo_id, str(cuidador_actual["_id"]))
    if "error" in resultado:
        raise HTTPException(status_code=403, detail=resultado["error"])
    return resultado


@router.get("/{grupo_id}/miembros")
async def get_miembros(grupo_id: MongoId, cuidador_actual = Depends(get_cuidador_actual)):
    grupo = await obtener_grupo(grupo_id)
    if "error" in grupo:
        raise HTTPException(status_code=404, detail=grupo["error"])
    if str(cuidador_actual["_id"]) not in grupo.get("cuidador_ids", []):
        raise HTTPException(status_code=403, detail="No tienes acceso a este grupo")
    resultado = await obtener_miembros_grupo(grupo_id)
    if "error" in resultado:
        raise HTTPException(status_code=404, detail=resultado["error"])
    return resultado


@router.get("/{grupo_id}/miembros/familiar")
async def get_miembros_familiar(grupo_id: MongoId, familiar_actual = Depends(get_familiar_actual)):
    grupo = await obtener_grupo(grupo_id)
    if "error" in grupo:
        raise HTTPException(status_code=404, detail=grupo["error"])
    if str(familiar_actual["_id"]) not in grupo.get("familiar_ids", []):
        raise HTTPException(status_code=403, detail="No tienes acceso a este grupo")
    resultado = await obtener_miembros_grupo(grupo_id)
    if "error" in resultado:
        raise HTTPException(status_code=404, detail=resultado["error"])
    return resultado


@router.post("/{grupo_id}/ubicacion/familiar")
async def guardar_ubicacion_familiar_route(
    grupo_id: MongoId,
    datos: UbicacionFamiliar,
    familiar_actual = Depends(get_familiar_actual)
):
    datos.familiar_id = str(familiar_actual["_id"])
    resultado = await guardar_ubicacion_familiar(datos)
    if "error" in resultado:
        raise HTTPException(status_code=500, detail=resultado["error"])
    return resultado


@router.get("/{grupo_id}/ubicaciones/familiar")
async def obtener_ubicaciones_familiar_route(
    grupo_id: MongoId,
    familiar_actual = Depends(get_familiar_actual)
):
    resultado = await obtener_ubicaciones_grupo_familiar(grupo_id, str(familiar_actual["_id"]))
    if "error" in resultado:
        raise HTTPException(status_code=403, detail=resultado["error"])
    return resultado


@router.get("/{grupo_id}/cuidador-cercano")
async def get_cuidador_cercano(grupo_id: str, latitud: float, longitud: float, cuidador_actual = Depends(get_cuidador_actual)):
    resultado = await obtener_cuidador_mas_cercano(grupo_id, latitud, longitud, str(cuidador_actual["_id"]))
    if "error" in resultado:
        raise HTTPException(status_code=403, detail=resultado["error"])
    if "mensaje" in resultado:
        raise HTTPException(status_code=404, detail=resultado["mensaje"])
    return resultado