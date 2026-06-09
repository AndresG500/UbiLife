# routes/route_historial_ubicacion.py
from typing import Annotated
from fastapi import APIRouter, HTTPException, Depends, Path
from services.service_historial import obtener_ultima_ubicacion, obtener_historial_ubicaciones, eliminar_historial_paciente, obtener_historial_ubicaciones_familiar
from security.dependencies import get_cuidador_actual, get_familiar_actual

MongoId = Annotated[str, Path(pattern=r'^[a-f\d]{24}$')]
router = APIRouter(prefix="/historial-ubicaciones", tags=["Historial de Ubicaciones"])


# --- Endpoints protegidos (requieren JWT) ---

@router.get("/ultima/{paciente_id}")
async def obtener_ubicacion(
    paciente_id: MongoId,
    cuidador_actual = Depends(get_cuidador_actual)
):
    resultado = await obtener_ultima_ubicacion(paciente_id, cuidador_actual["email"])
    if "error" in resultado:
        raise HTTPException(status_code=403, detail=resultado["error"])
    if "mensaje" in resultado:
        raise HTTPException(status_code=404, detail=resultado["mensaje"])
    return resultado


@router.get("/ruta/{paciente_id}")
async def obtener_historial(
    paciente_id: MongoId,
    cuidador_actual = Depends(get_cuidador_actual)
):
    resultado = await obtener_historial_ubicaciones(paciente_id, cuidador_actual["email"])
    if isinstance(resultado, dict) and "error" in resultado:
        raise HTTPException(status_code=403, detail=resultado["error"])
    if isinstance(resultado, dict) and "mensaje" in resultado:
        raise HTTPException(status_code=404, detail=resultado["mensaje"])
    return resultado


@router.get("/ruta-familiar/{paciente_id}")
async def obtener_historial_familiar(
    paciente_id: MongoId,
    familiar_actual = Depends(get_familiar_actual)
):
    resultado = await obtener_historial_ubicaciones_familiar(paciente_id, str(familiar_actual["_id"]))
    if isinstance(resultado, dict) and "error" in resultado:
        raise HTTPException(status_code=403, detail=resultado["error"])
    if isinstance(resultado, dict) and "mensaje" in resultado:
        raise HTTPException(status_code=404, detail=resultado["mensaje"])
    return resultado


@router.delete("/eliminar/{paciente_id}")
async def eliminar_historial(
    paciente_id: MongoId,
    cuidador_actual = Depends(get_cuidador_actual)
):
    resultado = await eliminar_historial_paciente(paciente_id, cuidador_actual["email"])
    if "error" in resultado:
        raise HTTPException(status_code=403, detail=resultado["error"])
    if "mensaje" in resultado and "no se encontró" in resultado["mensaje"].lower():
        raise HTTPException(status_code=404, detail=resultado["mensaje"])
    return resultado