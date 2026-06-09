from datetime import datetime, timedelta, timezone
from database.database import get_database
from models.model_historial import HistorialUbicacionBase
from bson import ObjectId
from utils.Logger import Logger
from utils.geo import calcular_distancia

DISTANCIA_MINIMA_METROS = 10
DIAS_HISTORIAL = 7


async def verificar_paciente_pertenece_a_cuidador(paciente_id: str, cuidador_email: str) -> bool:
    try:
        db = get_database()
        cuidador = await db["Cuidadores"].find_one({"email": cuidador_email})
        if not cuidador:
            return False
        paciente = await db["Pacientes"].find_one({"_id": ObjectId(paciente_id)})
        if not paciente:
            return False
        return str(paciente.get("id_cuidador")) == str(cuidador["_id"])
    except Exception:
        return False


async def registrar_ubicacion(datos: HistorialUbicacionBase):
    try:
        db = get_database()
        col_historial = db["Historial"]
        col_pacientes = db["Pacientes"]

        ultima = await col_historial.find_one(
            {"paciente_id": datos.paciente_id},
            sort=[("timestamp", -1)]
        )

        if ultima:
            distancia = calcular_distancia(
                ultima["coordenadas"]["latitud"],
                ultima["coordenadas"]["longitud"],
                datos.coordenadas.latitud,
                datos.coordenadas.longitud
            )
            if distancia < DISTANCIA_MINIMA_METROS:
                Logger.add_to_log("info", f"Ubicación descartada por distancia mínima: {datos.paciente_id}")
                return {"mensaje": "Ubicación descartada, el paciente no se ha movido lo suficiente"}

        await col_historial.insert_one({
            "paciente_id":   datos.paciente_id,
            "dispositivo_id": datos.dispositivo_id,
            "coordenadas":   datos.coordenadas.model_dump(),
            "timestamp":     datos.timestamp
        })

        await col_pacientes.update_one(
            {"_id": ObjectId(datos.paciente_id)},
            {
                "$set": {
                    "ultima_ubicacion": {
                        "latitud":   datos.coordenadas.latitud,
                        "longitud":  datos.coordenadas.longitud,
                        "timestamp": datos.timestamp,
                    }
                }
            }
        )

        Logger.add_to_log("info", f"Ubicación registrada para paciente: {datos.paciente_id}")
        return {"mensaje": "Ubicación registrada exitosamente"}

    except Exception as ex:
        Logger.add_to_log("error", f"Error al registrar ubicación: {ex}")
        return {"error": f"No se pudo registrar la ubicación: {ex}"}


async def obtener_ultima_ubicacion(paciente_id: str, cuidador_email: str) -> dict | None:
    if not await verificar_paciente_pertenece_a_cuidador(paciente_id, cuidador_email):
        return {"error": "No tienes permiso para ver este paciente"}

    try:
        db = get_database()
        coleccion = db["Historial"]

        ultima = await coleccion.find_one(
            {"paciente_id": paciente_id},
            sort=[("timestamp", -1)]
        )

        if not ultima:
            Logger.add_to_log("warn", f"Sin ubicaciones para paciente: {paciente_id}")
            return {"mensaje": "No se encontraron ubicaciones para este paciente"}

        ultima["id"] = str(ultima["_id"])
        del ultima["_id"]
        return ultima

    except Exception as ex:
        Logger.add_to_log("error", f"Error al obtener última ubicación: {ex}")
        return {"error": f"No se pudo obtener la última ubicación: {ex}"}


async def obtener_historial_ubicaciones(paciente_id: str, cuidador_email: str) -> list:
    if not await verificar_paciente_pertenece_a_cuidador(paciente_id, cuidador_email):
        return {"error": "No tienes permiso para ver este paciente"}

    try:
        db = get_database()
        coleccion = db["Historial"]
        corte = datetime.now(timezone.utc) - timedelta(days=DIAS_HISTORIAL)

        cursor = coleccion.find(
            {"paciente_id": paciente_id, "timestamp": {"$gte": corte}},
            sort=[("timestamp", 1)]
        ).limit(2000)

        historial = []
        async for doc in cursor:
            doc["id"] = str(doc["_id"])
            del doc["_id"]
            historial.append(doc)

        if not historial:
            Logger.add_to_log("warn", f"Sin historial para paciente: {paciente_id}")
            return {"mensaje": "No se encontró historial para este paciente"}

        Logger.add_to_log("info", f"Historial obtenido para paciente: {paciente_id}")
        return historial

    except Exception as ex:
        Logger.add_to_log("error", f"Error al obtener historial: {ex}")
        return {"error": f"No se pudo obtener el historial: {ex}"}


async def verificar_familiar_puede_ver_paciente(paciente_id: str, familiar_id: str) -> bool:
    try:
        db = get_database()
        grupo = await db["Grupos"].find_one({
            "familiar_ids": familiar_id,
            "paciente_ids": paciente_id,
        })
        return grupo is not None
    except Exception:
        return False


async def obtener_historial_ubicaciones_familiar(paciente_id: str, familiar_id: str):
    if not await verificar_familiar_puede_ver_paciente(paciente_id, familiar_id):
        return {"error": "No tienes permiso para ver este paciente"}

    try:
        db = get_database()
        coleccion = db["Historial"]
        corte = datetime.now(timezone.utc) - timedelta(days=DIAS_HISTORIAL)

        cursor = coleccion.find(
            {"paciente_id": paciente_id, "timestamp": {"$gte": corte}},
            sort=[("timestamp", 1)]
        ).limit(2000)

        historial = []
        async for doc in cursor:
            doc["id"] = str(doc["_id"])
            del doc["_id"]
            historial.append(doc)

        if not historial:
            Logger.add_to_log("warn", f"Sin historial para paciente (familiar): {paciente_id}")
            return {"mensaje": "No se encontró historial para este paciente"}

        Logger.add_to_log("info", f"Historial obtenido para paciente (familiar): {paciente_id}")
        return historial

    except Exception as ex:
        Logger.add_to_log("error", f"Error al obtener historial (familiar): {ex}")
        return {"error": f"No se pudo obtener el historial: {ex}"}


async def eliminar_historial_paciente(paciente_id: str, cuidador_email: str):
    if not await verificar_paciente_pertenece_a_cuidador(paciente_id, cuidador_email):
        return {"error": "No tienes permiso para eliminar historial de este paciente"}

    try:
        db = get_database()
        coleccion = db["Historial"]

        resultado = await coleccion.delete_many({"paciente_id": paciente_id})

        if resultado.deleted_count == 0:
            Logger.add_to_log("warn", f"Sin historial para eliminar: {paciente_id}")
            return {"mensaje": "No se encontró historial para eliminar"}

        Logger.add_to_log("info", f"Historial eliminado para paciente: {paciente_id}")
        return {"mensaje": f"Historial eliminado exitosamente ({resultado.deleted_count} registros)"}

    except Exception as ex:
        Logger.add_to_log("error", f"Error al eliminar historial: {ex}")
        return {"error": f"No se pudo eliminar el historial: {ex}"}