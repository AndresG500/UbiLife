from datetime import datetime, timezone, timedelta
from typing import Optional
from bson import ObjectId
from database.database import get_database
from utils.Logger import Logger


async def activar_modo_viaje(
    paciente_id: str,
    tipo: str,
    duracion_horas: Optional[float],
    activado_por: str,
) -> dict:
    if duracion_horas is not None and duracion_horas <= 0:
        return {"error": "La duración debe ser mayor a 0 horas"}

    db = get_database()
    ahora = datetime.now(timezone.utc)
    fin = ahora + timedelta(hours=duracion_horas) if duracion_horas else None

    try:
        result = await db["Pacientes"].update_one(
            {"_id": ObjectId(paciente_id)},
            {"$set": {
                "modo_viaje_activo":       True,
                "modo_viaje_tipo":         tipo,
                "modo_viaje_inicio":       ahora,
                "modo_viaje_fin":          fin,
                "modo_viaje_activado_por": activado_por,
            }},
        )
        if result.matched_count == 0:
            return {"error": "Paciente no encontrado"}
        Logger.add_to_log("info", f"Modo viaje activado | paciente={paciente_id} tipo={tipo} fin={fin}")
        return {
            "mensaje": "Modo viaje activado",
            "tipo": tipo,
            "fin": fin.isoformat() if fin else None,
        }
    except Exception as e:
        Logger.add_to_log("error", f"Error activando modo viaje: {e}")
        return {"error": str(e)}


async def desactivar_modo_viaje(paciente_id: str) -> dict:
    db = get_database()
    try:
        result = await db["Pacientes"].update_one(
            {"_id": ObjectId(paciente_id)},
            {"$set": {
                "modo_viaje_activo":       False,
                "modo_viaje_tipo":         None,
                "modo_viaje_inicio":       None,
                "modo_viaje_fin":          None,
                "modo_viaje_activado_por": None,
            }},
        )
        if result.matched_count == 0:
            return {"error": "Paciente no encontrado"}

        # Verificar si el paciente está dentro de alguna zona segura activa
        paciente = await db["Pacientes"].find_one({"_id": ObjectId(paciente_id)})
        fuera = paciente.get("fuera_de_zona", False) if paciente else False

        Logger.add_to_log("info", f"Modo viaje desactivado | paciente={paciente_id}")
        return {
            "mensaje": "Modo viaje desactivado",
            "paciente_fuera_de_zona": fuera,
        }
    except Exception as e:
        Logger.add_to_log("error", f"Error desactivando modo viaje: {e}")
        return {"error": str(e)}


async def obtener_estado_modo_viaje(paciente_id: str) -> dict:
    db = get_database()
    try:
        paciente = await db["Pacientes"].find_one(
            {"_id": ObjectId(paciente_id)},
            {
                "modo_viaje_activo": 1,
                "modo_viaje_tipo": 1,
                "modo_viaje_inicio": 1,
                "modo_viaje_fin": 1,
                "modo_viaje_activado_por": 1,
                "nombre_paciente": 1,
            },
        )
        if not paciente:
            return {"error": "Paciente no encontrado"}

        fin = paciente.get("modo_viaje_fin")
        return {
            "activo":         paciente.get("modo_viaje_activo", False),
            "tipo":           paciente.get("modo_viaje_tipo"),
            "inicio":         paciente.get("modo_viaje_inicio"),
            "fin":            fin,
            "activado_por":   paciente.get("modo_viaje_activado_por"),
            "nombre_paciente": paciente.get("nombre_paciente"),
        }
    except Exception as e:
        Logger.add_to_log("error", f"Error obteniendo modo viaje: {e}")
        return {"error": str(e)}


async def _auto_expirar_modo_viaje(paciente: dict) -> bool:
    """Devuelve True si el modo viaje sigue activo después de verificar expiración."""
    if not paciente.get("modo_viaje_activo", False):
        return False

    fin = paciente.get("modo_viaje_fin")
    if fin is None:
        return True  # Indefinido, sigue activo

    if fin.tzinfo is None:
        fin = fin.replace(tzinfo=timezone.utc)

    if datetime.now(timezone.utc) < fin:
        return True  # Aún no expira

    # Expiró → desactivar
    db = get_database()
    try:
        await db["Pacientes"].update_one(
            {"_id": paciente["_id"]},
            {"$set": {
                "modo_viaje_activo":       False,
                "modo_viaje_tipo":         None,
                "modo_viaje_inicio":       None,
                "modo_viaje_fin":          None,
                "modo_viaje_activado_por": None,
            }},
        )
        Logger.add_to_log("info", f"Modo viaje expirado automáticamente | paciente={str(paciente['_id'])}")
    except Exception as e:
        Logger.add_to_log("error", f"Error al expirar modo viaje: {e}")

    return False
