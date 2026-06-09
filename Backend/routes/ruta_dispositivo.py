# routes/route_dispositivo.py
from fastapi import APIRouter, HTTPException, Depends
from models.model_dispositivo import CrearDispositivo, ActualizarDispositivo, VincularDispositivo
from services import service_dispositivo
from security.dependencies import get_cuidador_actual

router = APIRouter(prefix="/dispositivos", tags=["Dispositivos"])


# --- Endpoints protegidos (requieren JWT) ---

@router.get("/obtener/{id_dispositivo}")
async def obtener_dispositivo(
    id_dispositivo: str,
    cuidador_actual = Depends(get_cuidador_actual)
):
    resultado = await service_dispositivo.obtener_dispositivo(id_dispositivo, cuidador_actual["email"])
    if "error" in resultado:
        raise HTTPException(status_code=403, detail=resultado["error"])
    if "mensaje" in resultado:
        raise HTTPException(status_code=404, detail=resultado["mensaje"])
    return resultado


@router.get("/paciente/{paciente_id}")
async def obtener_dispositivo_por_paciente(
    paciente_id: str,
    cuidador_actual = Depends(get_cuidador_actual)
):
    resultado = await service_dispositivo.obtener_dispositivo_por_paciente(paciente_id, cuidador_actual["email"])
    if "error" in resultado:
        raise HTTPException(status_code=403, detail=resultado["error"])
    if "mensaje" in resultado:
        raise HTTPException(status_code=404, detail=resultado["mensaje"])
    return resultado


@router.patch("/actualizar/{id_dispositivo}")
async def actualizar_dispositivo(
    id_dispositivo: str,
    datos: ActualizarDispositivo,
    cuidador_actual = Depends(get_cuidador_actual)
):
    resultado = await service_dispositivo.actualizar_dispositivo(id_dispositivo, datos, cuidador_actual["email"])
    if "error" in resultado:
        raise HTTPException(status_code=403, detail=resultado["error"])
    if "mensaje" in resultado and "no se encontró" in resultado["mensaje"].lower():
        raise HTTPException(status_code=404, detail=resultado["mensaje"])
    return resultado


@router.patch("/desvincular/{id_dispositivo}")
async def desvincular_dispositivo(
    id_dispositivo: str,
    cuidador_actual = Depends(get_cuidador_actual)
):
    resultado = await service_dispositivo.desvincular_dispositivo(id_dispositivo, cuidador_actual["email"])
    if "error" in resultado:
        raise HTTPException(status_code=403, detail=resultado["error"])
    if "mensaje" in resultado and "no se encontró" in resultado["mensaje"].lower():
        raise HTTPException(status_code=404, detail=resultado["mensaje"])
    return resultado


@router.get("/disponibles")
async def obtener_dispositivos_disponibles(
    cuidador_actual = Depends(get_cuidador_actual)
):
    resultado = await service_dispositivo.obtener_dispositivos_disponibles()
    if isinstance(resultado, dict) and "error" in resultado:
        raise HTTPException(status_code=500, detail=resultado["error"])
    return resultado


@router.post("/vincular")
async def vincular_dispositivo(
    datos: VincularDispositivo,
    cuidador_actual = Depends(get_cuidador_actual)
):
    resultado = await service_dispositivo.vincular_dispositivo(
        datos.id_dispositivo, datos.paciente_id, cuidador_actual["email"]
    )
    if "error" in resultado:
        raise HTTPException(status_code=400, detail=resultado["error"])
    return resultado


@router.post("/anunciar")
async def anunciar_dispositivo(
    id_dispositivo: str,
    cuidador_actual = Depends(get_cuidador_actual),
):
    resultado = await service_dispositivo.anunciar_dispositivo(id_dispositivo)
    if "error" in resultado:
        raise HTTPException(status_code=500, detail=resultado["error"])
    return {"mensaje": "Dispositivo anunciado"}

