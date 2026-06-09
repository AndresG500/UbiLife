# services/service_zona_segura.py
from datetime import datetime, timezone
from math import radians, sin, cos, sqrt, atan2
from database.database import get_database
from models.model_zonasegura import CrearZonaSegura, ActualizarZonaSegura
from bson import ObjectId
from utils.Logger import Logger
from utils.sanitizer import sanitize_string


def verificar_si_dentro(latitud_paciente: float, longitud_paciente: float,
    latitud_centro: float, longitud_centro: float,
    radio_metros: float) -> bool:
    R = 6371000
    lat1, lat2 = radians(latitud_paciente), radians(latitud_centro)
    dlat = radians(latitud_centro - latitud_paciente)
    dlng = radians(longitud_centro - longitud_paciente)
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlng / 2) ** 2
    distancia = R * 2 * atan2(sqrt(a), sqrt(1 - a))
    return distancia <= radio_metros


async def obtener_zonas_familiar(familiar_id: str) -> list:
    db = get_database()
    grupos = await db["Grupos"].find({"familiar_ids": familiar_id}).to_list(length=None)
    if not grupos:
        return []
    paciente_ids: list[str] = []
    for g in grupos:
        paciente_ids.extend(g.get("paciente_ids", []))
    if not paciente_ids:
        return []
    zonas = []
    async for zona in db["ZonasSeguras"].find({"paciente_id": {"$in": paciente_ids}}):
        zona["id"] = str(zona["_id"])
        del zona["_id"]
        zonas.append(zona)
    return zonas


async def verificar_paciente_pertenece_a_familiar(paciente_id: str, familiar_id: str) -> bool:
    try:
        db = get_database()
        grupo = await db["Grupos"].find_one({"familiar_ids": familiar_id, "paciente_ids": paciente_id})
        return grupo is not None
    except Exception:
        return False


async def verificar_paciente_pertenece_a_cuidador(paciente_id: str, cuidador_email: str) -> bool:
    try:
        db = get_database()
        cuidador = await db["Cuidadores"].find_one({"email": cuidador_email})
        if not cuidador:
            return False
        cuidador_id = str(cuidador["_id"])
        paciente = await db["Pacientes"].find_one({"_id": ObjectId(paciente_id)})
        if not paciente:
            return False
        if str(paciente.get("id_cuidador")) == cuidador_id:
            return True
        grupo = await db["Grupos"].find_one({"cuidador_ids": cuidador_id, "paciente_ids": paciente_id})
        return grupo is not None
    except Exception:
        return False


async def crear_zona_segura(datos: CrearZonaSegura):
    try:
        db = get_database()
        coleccion = db["ZonasSeguras"]

        try:
            paciente = await db["Pacientes"].find_one({"_id": ObjectId(datos.paciente_id)})
        except Exception:
            paciente = None
        if not paciente:
            return {"error": "Paciente no encontrado"}

        zona_existente = await coleccion.find_one({
            "paciente_id": datos.paciente_id,
            "nombre": datos.nombre
        })
        if zona_existente:
            Logger.add_to_log("warn", f"Zona ya existe para paciente: {datos.paciente_id}")
            return {"mensaje": "Ya existe una zona con ese nombre para este paciente"}

        # Activar inmediatamente si el paciente ya está dentro según su última ubicación conocida
        activa_inicial = False
        try:
            paciente = await db["Pacientes"].find_one({"_id": ObjectId(datos.paciente_id)})
            if paciente and paciente.get("ultima_ubicacion"):
                ul = paciente["ultima_ubicacion"]
                activa_inicial = verificar_si_dentro(
                    ul["latitud"], ul["longitud"],
                    datos.centro.latitud, datos.centro.longitud,
                    datos.radio_metros,
                )
        except Exception:
            pass

        await coleccion.insert_one({
            "paciente_id": datos.paciente_id,
            "cuidador_id": datos.cuidador_id,
            "nombre": sanitize_string(datos.nombre, 100),
            "centro": datos.centro.model_dump(),
            "radio_metros": datos.radio_metros,
            "activa": activa_inicial,
            "created_at": datetime.now(timezone.utc)
        })

        Logger.add_to_log("info", f"Zona segura creada para paciente: {datos.paciente_id} (activa={activa_inicial})")
        return {"mensaje": "Zona segura creada exitosamente"}

    except Exception as ex:
        Logger.add_to_log("error", f"Error al crear zona segura: {ex}")
        return {"error": f"No se pudo crear la zona segura: {ex}"}


async def obtener_zonas_por_paciente(paciente_id: str, cuidador_email: str) -> list:
    if not await verificar_paciente_pertenece_a_cuidador(paciente_id, cuidador_email):
        return {"error": "No tienes permiso para ver este paciente"}

    try:
        db = get_database()
        coleccion = db["ZonasSeguras"]
        cursor = coleccion.find({"paciente_id": paciente_id})

        zonas = []
        async for zona in cursor:
            zona["id"] = str(zona["_id"])
            del zona["_id"]
            zonas.append(zona)

        Logger.add_to_log("info", f"Zonas obtenidas para paciente: {paciente_id}")
        return zonas

    except Exception as ex:
        Logger.add_to_log("error", f"Error al obtener zonas: {ex}")
        return {"error": f"No se pudieron obtener las zonas seguras: {ex}"}


async def obtener_zona_por_id(zona_id: str) -> dict | None:
    try:
        db = get_database()
        coleccion = db["ZonasSeguras"]
        zona = await coleccion.find_one({"_id": ObjectId(zona_id)})

        if not zona:
            Logger.add_to_log("warn", f"Zona no encontrada: {zona_id}")
            return {"mensaje": "No se encontró la zona segura"}

        zona["id"] = str(zona["_id"])
        del zona["_id"]
        return zona

    except Exception as ex:
        Logger.add_to_log("error", f"Error al obtener zona: {ex}")
        return {"error": f"No se pudo obtener la zona segura: {ex}"}


async def actualizar_zona_segura(zona_id: str, datos: ActualizarZonaSegura, cuidador_email: str):
    try:
        db = get_database()
        coleccion = db["ZonasSeguras"]
        zona = await coleccion.find_one({"_id": ObjectId(zona_id)})

        if not zona:
            Logger.add_to_log("warn", f"Zona no encontrada para actualizar: {zona_id}")
            return {"mensaje": "No se encontró la zona segura"}

        cuidador = await db["Cuidadores"].find_one({"email": cuidador_email})
        if not cuidador:
            return {"error": "Cuidador no encontrado"}
        if not zona.get("cuidador_id") or str(zona["cuidador_id"]) != str(cuidador["_id"]):
            Logger.add_to_log("warn", f"Actualización no autorizada: {cuidador_email} vs zona {zona_id}")
            return {"error": "No tienes permiso para actualizar esta zona"}

        campos = {}
        if datos.nombre is not None:
            campos["nombre"] = sanitize_string(datos.nombre, 100)
        if datos.centro is not None:
            campos["centro"] = datos.centro.model_dump()
        if datos.radio_metros is not None:
            campos["radio_metros"] = datos.radio_metros
        if datos.activa is not None:
            campos["activa"] = datos.activa

        if campos:
            await coleccion.update_one({"_id": ObjectId(zona_id)}, {"$set": campos})

        Logger.add_to_log("info", f"Zona segura actualizada: {zona_id}")
        return {"mensaje": "Zona segura actualizada exitosamente"}

    except Exception as ex:
        Logger.add_to_log("error", f"Error al actualizar zona segura: {ex}")
        return {"error": f"No se pudo actualizar la zona segura: {ex}"}


async def eliminar_zona_segura(zona_id: str, cuidador_email: str):
    try:
        db = get_database()
        coleccion = db["ZonasSeguras"]
        zona = await coleccion.find_one({"_id": ObjectId(zona_id)})

        if not zona:
            Logger.add_to_log("warn", f"Zona no encontrada para eliminar: {zona_id}")
            return {"mensaje": "No se encontró la zona segura"}

        cuidador = await db["Cuidadores"].find_one({"email": cuidador_email})
        if not cuidador:
            return {"error": "Cuidador no encontrado"}
        if not zona.get("cuidador_id") or str(zona["cuidador_id"]) != str(cuidador["_id"]):
            Logger.add_to_log("warn", f"Eliminación no autorizada: {cuidador_email} vs zona {zona_id}")
            return {"error": "No tienes permiso para eliminar esta zona"}

        await coleccion.delete_one({"_id": ObjectId(zona_id)})

        Logger.add_to_log("info", f"Zona segura eliminada: {zona_id}")
        return {"mensaje": "Zona segura eliminada exitosamente"}

    except Exception as ex:
        Logger.add_to_log("error", f"Error al eliminar zona segura: {ex}")
        return {"error": f"No se pudo eliminar la zona segura: {ex}"}


async def verificar_paciente_en_zonas(paciente_id: str, latitud: float, longitud: float) -> dict:
    try:
        db = get_database()
        coleccion = db["ZonasSeguras"]
        cursor = coleccion.find({"paciente_id": paciente_id, "activa": True})

        zonas_activas = [zona async for zona in cursor]

        if not zonas_activas:
            Logger.add_to_log("warn", f"Sin zonas activas para paciente: {paciente_id}")
            return {"dentro": False, "zona": None, "mensaje": "El paciente no tiene zonas seguras activas"}

        for zona in zonas_activas:
            dentro = verificar_si_dentro(
                latitud, longitud,
                zona["centro"]["latitud"],
                zona["centro"]["longitud"],
                zona["radio_metros"]
            )
            if dentro:
                Logger.add_to_log("info", f"Paciente {paciente_id} dentro de zona: {zona['nombre']}")
                return {"dentro": True, "zona": zona["nombre"]}

        Logger.add_to_log("warn", f"Paciente {paciente_id} fuera de todas las zonas seguras")
        return {"dentro": False, "zona": None, "mensaje": "El paciente está fuera de todas las zonas seguras"}

    except Exception as ex:
        Logger.add_to_log("error", f"Error al verificar zonas: {ex}")
        return {"error": f"No se pudo verificar la ubicación del paciente: {ex}"}