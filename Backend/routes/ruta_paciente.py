from fastapi import APIRouter, HTTPException, Depends, Path
from typing import Annotated
from models.model_paciente import CrearPaciente, ActualizarPaciente
from services.service_paciente import registrar_paciente, obtener_paciente, borrar_paciente, actualizar_paciente, listar_pacientes
from security.dependencies import get_cuidador_actual, get_cuidador_o_familiar_actual
from fastapi.responses import StreamingResponse
from bson import ObjectId
import json, asyncio
from utils.Logger import Logger
from database.database import get_database
from utils.eventos import bus_eventos

router  = APIRouter(prefix="/pacientes", tags=["Pacientes"])
MongoId = Annotated[str, Path(pattern=r'^[a-f\d]{24}$')]


# ─── PROTEGIDOS (todos requieren JWT) ────────────────────────────────────────

@router.post("/registrar")
async def registrar(
    datos: CrearPaciente,
    cuidador_actual = Depends(get_cuidador_actual)
):
    resultado = await registrar_paciente(datos, cuidador_actual["email"])
    if "error" in resultado:
        raise HTTPException(status_code=500, detail=resultado["error"])
    return resultado


@router.get("/")
async def listar(cuidador_actual = Depends(get_cuidador_actual)):
    resultado = await listar_pacientes(cuidador_actual["email"])
    if "error" in resultado:
        raise HTTPException(status_code=500, detail=resultado["error"])
    return resultado


@router.get("/{patient_id}")
async def obtener(
    patient_id: MongoId,
    cuidador_actual = Depends(get_cuidador_actual)
):
    resultado = await obtener_paciente(patient_id, cuidador_actual["email"])
    if "error" in resultado:
        raise HTTPException(status_code=403, detail=resultado["error"])
    return resultado


@router.delete("/{patient_id}")
async def eliminar(
    patient_id: MongoId,
    cuidador_actual = Depends(get_cuidador_actual)
):
    resultado = await borrar_paciente(patient_id, cuidador_actual["email"])
    if "error" in resultado:
        raise HTTPException(status_code=403, detail=resultado["error"])
    return resultado


@router.put("/{patient_id}")
async def actualizar(
    patient_id: MongoId,
    datos: ActualizarPaciente,
    cuidador_actual = Depends(get_cuidador_actual)
):
    resultado = await actualizar_paciente(patient_id, datos, cuidador_actual["email"])
    if "error" in resultado:
        raise HTTPException(status_code=403, detail=resultado["error"])
    return resultado

@router.get("/{id}/ubicacion/stream")
async def stream_ubicacion(id: MongoId, usuario_actual=Depends(get_cuidador_o_familiar_actual)):
    tipo = usuario_actual.get("_tipo")
    if tipo not in ("cuidador", "familiar"):
        raise HTTPException(status_code=403, detail="Tipo de usuario no reconocido")

    if tipo == "cuidador":
        verificacion = await obtener_paciente(id, usuario_actual["email"])
        if "error" in verificacion:
            raise HTTPException(status_code=403, detail=verificacion["error"])
    else:
        familiar_id = str(usuario_actual["_id"])
        db_check = get_database()
        grupo = await db_check["Grupos"].find_one({"familiar_ids": familiar_id, "paciente_ids": id})
        if not grupo:
            raise HTTPException(status_code=403, detail="No tienes acceso a este paciente")

    db = get_database()

    async def generar():
        cola: asyncio.Queue = asyncio.Queue(maxsize=50)
        topic = f"ubicacion/{id}"
        bus_eventos.suscribir(topic, cola)
        try:
            # Enviar la última ubicación conocida de inmediato
            try:
                paciente = await db.Pacientes.find_one({"_id": ObjectId(id)})
            except Exception:
                paciente = None
            if paciente and paciente.get("ultima_ubicacion"):
                ul = paciente["ultima_ubicacion"]
                datos = {
                    "latitud": ul.get("latitud"),
                    "longitud": ul.get("longitud"),
                    "timestamp": ul.get("timestamp", "").isoformat() if hasattr(ul.get("timestamp", ""), "isoformat") else str(ul.get("timestamp", "")),
                }
                yield f"data: {json.dumps(datos)}\n\n"

            # Esperar eventos en tiempo real
            while True:
                try:
                    datos = await asyncio.wait_for(cola.get(), timeout=25.0)
                    yield f"data: {json.dumps(datos)}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"  # keepalive para evitar timeout del cliente

        except asyncio.CancelledError:
            pass
        finally:
            bus_eventos.desuscribir(topic, cola)

    return StreamingResponse(
        generar(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )