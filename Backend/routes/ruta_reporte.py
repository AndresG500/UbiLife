from fastapi import APIRouter, HTTPException, Depends
from models.model_reporte import CrearReporte
from services.service_reporte import crear_reporte
from security.dependencies import get_cuidador_o_familiar_actual

router = APIRouter(prefix="/reportes", tags=["reportes"])


@router.post("/")
async def reportar_problema(
    datos: CrearReporte,
    remitente_actual = Depends(get_cuidador_o_familiar_actual),
):
    resultado = await crear_reporte(datos, remitente_actual)
    if "error" in resultado:
        raise HTTPException(status_code=400, detail=resultado["error"])
    return resultado
