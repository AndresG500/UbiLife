from datetime import datetime, timezone
from bson import ObjectId
from database.database import get_database
from models.model_reporte import CrearReporte
from services.service_familiar import listar_pacientes_familiar
from utils.Logger import Logger


async def _resolver_id_dispositivo(paciente_id: str, remitente_id: str, remitente_tipo: str):
    """Devuelve (id_dispositivo, error). El paciente debe pertenecer al remitente."""
    db = get_database()

    try:
        paciente_oid = ObjectId(paciente_id)
    except Exception:
        return None, "ID de paciente inválido"

    if remitente_tipo == "cuidador":
        paciente = await db["Pacientes"].find_one({"_id": paciente_oid, "id_cuidador": remitente_id})
    else:
        pacientes_familiar = await listar_pacientes_familiar(remitente_id)
        if not isinstance(pacientes_familiar, list):
            pacientes_familiar = []
        paciente = next((p for p in pacientes_familiar if p.get("id_paciente") == paciente_id), None)

    if not paciente:
        return None, "No tienes permiso para reportar sobre este paciente"

    id_dispositivo = paciente.get("id_dispositivo")
    if not id_dispositivo:
        return None, "Este paciente no tiene un dispositivo vinculado"

    return id_dispositivo, None


async def crear_reporte(datos: CrearReporte, remitente: dict) -> dict:
    try:
        db             = get_database()
        remitente_id   = str(remitente["_id"])
        remitente_tipo = remitente["_tipo"]

        id_dispositivo = None
        if datos.relacionado_dispositivo:
            id_dispositivo, error = await _resolver_id_dispositivo(datos.paciente_id, remitente_id, remitente_tipo)
            if error:
                return {"error": error}

        ahora = datetime.now(timezone.utc)
        reporte = {
            "remitente_id":     remitente_id,
            "remitente_tipo":   remitente_tipo,
            "remitente_nombre": remitente.get("name"),
            "descripcion":      datos.descripcion,
            "id_dispositivo":   id_dispositivo,
            "estado":           "recibido",
            "creado_en":        ahora,
            "actualizado_en":   ahora,
        }
        resultado = await db["Reportes"].insert_one(reporte)

        Logger.add_to_log("info", f"Reporte creado por {remitente_tipo} {remitente_id}: {resultado.inserted_id}")
        return {"mensaje": "Reporte enviado correctamente", "id": str(resultado.inserted_id)}
    except Exception as ex:
        Logger.add_to_log("error", f"Error creando reporte: {ex}")
        return {"error": "No se pudo enviar el reporte"}
