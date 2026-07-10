from datetime import datetime, timezone, timedelta
import secrets
import string
from database.database import get_database
from models.model_grupo import CrearGrupo, ActualizarGrupo, UbicacionCuidador, UbicacionFamiliar
from bson import ObjectId
from utils.Logger import Logger
from utils.geo import calcular_distancia


async def listar_grupos(cuidador_id: str) -> list:
    try:
        db         = get_database()
        col_grupos = db["Grupos"]
        cursor     = col_grupos.find({"cuidador_ids": cuidador_id})
        grupos = []
        async for g in cursor:
            g["id"] = str(g["_id"])
            del g["_id"]
            grupos.append(g)
        Logger.add_to_log("info", f"Grupos listados para cuidador: {cuidador_id}")
        return grupos
    except Exception as ex:
        Logger.add_to_log("error", f"Error al listar grupos: {ex}")
        return {"error": f"No se pudieron listar los grupos: {ex}"}


def _generar_codigo() -> str:
    chars = string.ascii_uppercase + string.digits
    return "FAM-" + "".join(secrets.choice(chars) for _ in range(6))


# Horas de validez por defecto de una invitación
INVITACION_EXPIRA_HORAS = 72


async def crear_grupo(datos: CrearGrupo):
    try:
        db             = get_database()
        col_grupos     = db["Grupos"]
        col_cuidadores = db["Cuidadores"]
        col_pacientes  = db["Pacientes"]

        # Verificar que el cuidador principal existe
        cuidador = await col_cuidadores.find_one({"_id": ObjectId(datos.cuidador_principal_id)})
        if not cuidador:
            Logger.add_to_log("warn", f"Cuidador principal no encontrado: {datos.cuidador_principal_id}")
            return {"mensaje": "No se encontró el cuidador principal"}

        # Verificar que los pacientes existen y pertenecen al cuidador
        for paciente_id in datos.paciente_ids:
            paciente = await col_pacientes.find_one({"_id": ObjectId(paciente_id)})
            if not paciente:
                Logger.add_to_log("warn", f"Paciente no encontrado: {paciente_id}")
                return {"mensaje": f"No se encontró el paciente {paciente_id}"}
            if str(paciente.get("id_cuidador")) != datos.cuidador_principal_id:
                Logger.add_to_log("warn", f"Paciente {paciente_id} no pertenece al cuidador: {datos.cuidador_principal_id}")
                return {"error": f"El paciente {paciente_id} no pertenece a tu cuenta"}

        resultado = await col_grupos.insert_one({
            "nombre":                datos.nombre,
            "cuidador_principal_id": datos.cuidador_principal_id,
            "cuidador_ids":          [datos.cuidador_principal_id],
            "paciente_ids":          datos.paciente_ids,
            "familiar_ids":          [],
            "created_at":            datetime.now(timezone.utc)
        })

        grupo_id = str(resultado.inserted_id)

        # Agregar grupo_id al cuidador principal
        await col_cuidadores.update_one(
            {"_id": ObjectId(datos.cuidador_principal_id)},
            {"$push": {"grupo_ids": grupo_id}}
        )

        # Agregar grupo_id a cada paciente
        for paciente_id in datos.paciente_ids:
            await col_pacientes.update_one(
                {"_id": ObjectId(paciente_id)},
                {"$push": {"grupo_ids": grupo_id}}
            )

        Logger.add_to_log("info", f"Grupo creado: {grupo_id}")
        return {"mensaje": "Grupo creado exitosamente", "grupo_id": grupo_id}

    except Exception as ex:
        Logger.add_to_log("error", f"Error al crear grupo: {ex}")
        return {"error": f"No se pudo crear el grupo: {ex}"}


async def eliminar_grupo(grupo_id: str, cuidador_id: str):
    try:
        db             = get_database()
        col_grupos     = db["Grupos"]
        col_cuidadores = db["Cuidadores"]
        col_pacientes  = db["Pacientes"]

        grupo = await col_grupos.find_one({"_id": ObjectId(grupo_id)})
        if not grupo:
            Logger.add_to_log("warn", f"Grupo no encontrado: {grupo_id}")
            return {"mensaje": "No se encontró el grupo"}

        if str(grupo.get("cuidador_principal_id")) != cuidador_id:
            Logger.add_to_log("warn", f"Intento de eliminación no autorizado: {cuidador_id}")
            return {"error": "No tienes permiso para eliminar este grupo"}

        # Desvincular grupo de todos los cuidadores
        for c_id in grupo["cuidador_ids"]:
            await col_cuidadores.update_one(
                {"_id": ObjectId(c_id)},
                {"$pull": {"grupo_ids": grupo_id}}
            )

        # Desvincular grupo de todos los pacientes
        for paciente_id in grupo["paciente_ids"]:
            await col_pacientes.update_one(
                {"_id": ObjectId(paciente_id)},
                {"$pull": {"grupo_ids": grupo_id}}
            )

        await col_grupos.delete_one({"_id": ObjectId(grupo_id)})

        Logger.add_to_log("info", f"Grupo eliminado: {grupo_id}")
        return {"mensaje": "Grupo eliminado exitosamente"}

    except Exception as ex:
        Logger.add_to_log("error", f"Error al eliminar grupo: {ex}")
        return {"error": f"No se pudo eliminar el grupo: {ex}"}


async def agregar_cuidador(grupo_id: str, cuidador_id: str, cuidador_solicitante_id: str):
    try:
        db             = get_database()
        col_grupos     = db["Grupos"]
        col_cuidadores = db["Cuidadores"]

        grupo = await col_grupos.find_one({"_id": ObjectId(grupo_id)})
        if not grupo:
            Logger.add_to_log("warn", f"Grupo no encontrado: {grupo_id}")
            return {"mensaje": "No se encontró el grupo"}

        if str(grupo.get("cuidador_principal_id")) != cuidador_solicitante_id:
            Logger.add_to_log("warn", f"Intento de agregar cuidador sin autorización: {cuidador_solicitante_id}")
            return {"error": "No tienes permiso para agregar cuidadores a este grupo"}

        cuidador = await col_cuidadores.find_one({"_id": ObjectId(cuidador_id)})
        if not cuidador:
            Logger.add_to_log("warn", f"Cuidador no encontrado: {cuidador_id}")
            return {"mensaje": "No se encontró el cuidador"}

        if cuidador_id in grupo["cuidador_ids"]:
            Logger.add_to_log("warn", f"Cuidador ya pertenece al grupo: {cuidador_id}")
            return {"mensaje": "El cuidador ya pertenece a este grupo"}

        await col_grupos.update_one(
            {"_id": ObjectId(grupo_id)},
            {"$push": {"cuidador_ids": cuidador_id}}
        )

        await col_cuidadores.update_one(
            {"_id": ObjectId(cuidador_id)},
            {"$push": {"grupo_ids": grupo_id}}
        )

        Logger.add_to_log("info", f"Cuidador {cuidador_id} agregado al grupo {grupo_id}")
        return {"mensaje": "Cuidador agregado al grupo exitosamente"}

    except Exception as ex:
        Logger.add_to_log("error", f"Error al agregar cuidador: {ex}")
        return {"error": f"No se pudo agregar el cuidador: {ex}"}


async def eliminar_cuidador(grupo_id: str, cuidador_id: str, cuidador_solicitante_id: str):
    try:
        db             = get_database()
        col_grupos     = db["Grupos"]
        col_cuidadores = db["Cuidadores"]

        grupo = await col_grupos.find_one({"_id": ObjectId(grupo_id)})
        if not grupo:
            Logger.add_to_log("warn", f"Grupo no encontrado: {grupo_id}")
            return {"mensaje": "No se encontró el grupo"}

        es_principal   = str(grupo.get("cuidador_principal_id")) == cuidador_solicitante_id
        es_autoeliminacion = cuidador_id == cuidador_solicitante_id
        if not es_principal and not es_autoeliminacion:
            Logger.add_to_log("warn", f"Eliminación de cuidador no autorizada: {cuidador_solicitante_id}")
            return {"error": "No tienes permiso para eliminar cuidadores de este grupo"}

        # El cuidador principal no puede ser eliminado del grupo
        if cuidador_id == str(grupo.get("cuidador_principal_id")):
            Logger.add_to_log("warn", f"Intento de eliminar al cuidador principal: {cuidador_id}")
            return {"mensaje": "El cuidador principal no puede ser eliminado del grupo"}

        if cuidador_id not in grupo["cuidador_ids"]:
            Logger.add_to_log("warn", f"Cuidador no pertenece al grupo: {cuidador_id}")
            return {"mensaje": "El cuidador no pertenece a este grupo"}

        await col_grupos.update_one(
            {"_id": ObjectId(grupo_id)},
            {"$pull": {"cuidador_ids": cuidador_id}}
        )

        await col_cuidadores.update_one(
            {"_id": ObjectId(cuidador_id)},
            {"$pull": {"grupo_ids": grupo_id}}
        )

        Logger.add_to_log("info", f"Cuidador {cuidador_id} eliminado del grupo {grupo_id}")
        return {"mensaje": "Cuidador eliminado del grupo exitosamente"}

    except Exception as ex:
        Logger.add_to_log("error", f"Error al eliminar cuidador del grupo: {ex}")
        return {"error": f"No se pudo eliminar el cuidador del grupo: {ex}"}


async def eliminar_familiar(grupo_id: str, familiar_id: str, cuidador_solicitante_id: str) -> dict:
    try:
        db             = get_database()
        col_grupos     = db["Grupos"]
        col_familiares = db["Familiares"]

        grupo = await col_grupos.find_one({"_id": ObjectId(grupo_id)})
        if not grupo:
            Logger.add_to_log("warn", f"Grupo no encontrado: {grupo_id}")
            return {"mensaje": "No se encontró el grupo"}

        if cuidador_solicitante_id not in grupo.get("cuidador_ids", []):
            Logger.add_to_log("warn", f"Expulsión de familiar no autorizada: {cuidador_solicitante_id}")
            return {"error": "No tienes permiso para expulsar familiares de este grupo"}

        if familiar_id not in grupo.get("familiar_ids", []):
            Logger.add_to_log("warn", f"Familiar no pertenece al grupo: {familiar_id}")
            return {"mensaje": "El familiar no pertenece a este grupo"}

        await col_grupos.update_one(
            {"_id": ObjectId(grupo_id)},
            {"$pull": {"familiar_ids": familiar_id}}
        )

        await col_familiares.update_one(
            {"_id": ObjectId(familiar_id)},
            {"$pull": {"grupo_ids": grupo_id}}
        )

        # No se borra UbicacionesFamiliares: es una posición global por familiar
        # (sin grupo_id) y puede seguir siendo válida para otros grupos. Al quitar
        # la membresía, deja de aparecer en las consultas de ubicación de este grupo.

        Logger.add_to_log("info", f"Familiar {familiar_id} expulsado del grupo {grupo_id}")
        return {"mensaje": "Familiar eliminado del grupo exitosamente"}

    except Exception as ex:
        Logger.add_to_log("error", f"Error al eliminar familiar del grupo: {ex}")
        return {"error": f"No se pudo eliminar el familiar del grupo: {ex}"}


async def agregar_paciente(grupo_id: str, paciente_id: str, cuidador_solicitante_id: str):
    try:
        db            = get_database()
        col_grupos    = db["Grupos"]
        col_pacientes = db["Pacientes"]

        grupo = await col_grupos.find_one({"_id": ObjectId(grupo_id)})
        if not grupo:
            Logger.add_to_log("warn", f"Grupo no encontrado: {grupo_id}")
            return {"mensaje": "No se encontró el grupo"}

        if str(grupo.get("cuidador_principal_id")) != cuidador_solicitante_id:
            Logger.add_to_log("warn", f"Intento de agregar paciente sin autorización: {cuidador_solicitante_id}")
            return {"error": "No tienes permiso para agregar pacientes a este grupo"}

        paciente = await col_pacientes.find_one({"_id": ObjectId(paciente_id)})
        if not paciente:
            Logger.add_to_log("warn", f"Paciente no encontrado: {paciente_id}")
            return {"mensaje": "No se encontró el paciente"}

        if str(paciente.get("id_cuidador")) != cuidador_solicitante_id:
            Logger.add_to_log("warn", f"Paciente {paciente_id} no pertenece al cuidador: {cuidador_solicitante_id}")
            return {"error": "El paciente no pertenece a tu cuenta"}

        if paciente_id in grupo["paciente_ids"]:
            Logger.add_to_log("warn", f"Paciente ya pertenece al grupo: {paciente_id}")
            return {"mensaje": "El paciente ya pertenece a este grupo"}

        await col_grupos.update_one(
            {"_id": ObjectId(grupo_id)},
            {"$push": {"paciente_ids": paciente_id}}
        )

        await col_pacientes.update_one(
            {"_id": ObjectId(paciente_id)},
            {"$push": {"grupo_ids": grupo_id}}
        )

        Logger.add_to_log("info", f"Paciente {paciente_id} agregado al grupo {grupo_id}")
        return {"mensaje": "Paciente agregado al grupo exitosamente"}

    except Exception as ex:
        Logger.add_to_log("error", f"Error al agregar paciente: {ex}")
        return {"error": f"No se pudo agregar el paciente: {ex}"}


async def guardar_ubicacion_cuidador(datos: UbicacionCuidador):
    try:
        db  = get_database()
        now = datetime.now(timezone.utc)

        await db["UbicacionesCuidadores"].update_one(
            {"cuidador_id": datos.cuidador_id},
            {"$set": {
                "cuidador_id": datos.cuidador_id,
                "latitud":     datos.latitud,
                "longitud":    datos.longitud,
                "timestamp":   now,
            }},
            upsert=True,
        )

        # Persistir última posición en el documento principal (sin TTL) para detección de zona muerta
        try:
            await db["Cuidadores"].update_one(
                {"_id": ObjectId(datos.cuidador_id)},
                {"$set": {
                    "ultima_ubicacion_lat": datos.latitud,
                    "ultima_ubicacion_lng": datos.longitud,
                    "ultima_ubicacion_ts":  now,
                }},
            )
        except Exception:
            pass

        Logger.add_to_log("info", f"Ubicación de cuidador actualizada: {datos.cuidador_id}")
        return {"mensaje": "Ubicación actualizada exitosamente"}

    except Exception as ex:
        Logger.add_to_log("error", f"Error al guardar ubicación del cuidador: {ex}")
        return {"error": f"No se pudo guardar la ubicación: {ex}"}


async def obtener_ubicaciones_grupo(grupo_id: str, cuidador_solicitante_id: str):
    try:
        db                = get_database()
        col_grupos        = db["Grupos"]
        col_ubicaciones   = db["UbicacionesCuidadores"]
        col_ub_familiares = db["UbicacionesFamiliares"]
        col_cuidadores    = db["Cuidadores"]
        col_familiares    = db["Familiares"]
        col_pacientes     = db["Pacientes"]

        grupo = await col_grupos.find_one({"_id": ObjectId(grupo_id)})
        if not grupo:
            Logger.add_to_log("warn", f"Grupo no encontrado: {grupo_id}")
            return {"mensaje": "No se encontró el grupo"}

        if cuidador_solicitante_id not in grupo.get("cuidador_ids", []):
            Logger.add_to_log("warn", f"Cuidador {cuidador_solicitante_id} no pertenece al grupo {grupo_id}")
            return {"error": "No tienes permiso para ver las ubicaciones de este grupo"}

        # Ubicaciones de cuidadores (enriquecidas con su perfil para el mapa)
        ubicaciones_cuidadores = []
        async for ub in col_ubicaciones.find({"cuidador_id": {"$in": grupo["cuidador_ids"]}}):
            ub.pop("_id", None)
            ub["tipo"] = "cuidador"
            try:
                perfil = await col_cuidadores.find_one({"_id": ObjectId(ub["cuidador_id"])})
                if perfil:
                    ub["nombre"]   = perfil.get("name", "")
                    ub["telefono"] = perfil.get("phone")
                    ub["foto"]     = perfil.get("foto")
            except Exception:
                pass
            ubicaciones_cuidadores.append(ub)

        # Ubicaciones de familiares del grupo (para que el cuidador los vea en el mapa)
        ubicaciones_familiares = []
        async for ub in col_ub_familiares.find({"familiar_id": {"$in": grupo.get("familiar_ids", [])}}):
            ub.pop("_id", None)
            ub["tipo"] = "familiar"
            try:
                perfil = await col_familiares.find_one({"_id": ObjectId(ub["familiar_id"])})
                if perfil:
                    ub["nombre"]   = perfil.get("name", "")
                    ub["telefono"] = perfil.get("phone")
                    ub["foto"]     = perfil.get("foto")
            except Exception:
                pass
            ubicaciones_familiares.append(ub)

        # Ultima ubicacion de cada paciente
        ubicaciones_pacientes = []
        for paciente_id in grupo["paciente_ids"]:
            paciente = await col_pacientes.find_one({"_id": ObjectId(paciente_id)})
            if paciente and paciente.get("ultima_ubicacion"):
                ubicaciones_pacientes.append({
                    "paciente_id":      paciente_id,
                    "nombre_paciente":  paciente["nombre_paciente"],
                    "ultima_ubicacion": paciente["ultima_ubicacion"]
                })

        Logger.add_to_log("info", f"Ubicaciones obtenidas para grupo: {grupo_id}")
        return {
            "cuidadores": ubicaciones_cuidadores,
            "familiares": ubicaciones_familiares,
            "pacientes":  ubicaciones_pacientes
        }

    except Exception as ex:
        Logger.add_to_log("error", f"Error al obtener ubicaciones del grupo: {ex}")
        return {"error": f"No se pudieron obtener las ubicaciones: {ex}"}


async def obtener_cuidador_mas_cercano(grupo_id: str, latitud_paciente: float, longitud_paciente: float, cuidador_solicitante_id: str):
    try:
        db              = get_database()
        col_grupos      = db["Grupos"]
        col_ubicaciones = db["UbicacionesCuidadores"]
        col_cuidadores  = db["Cuidadores"]

        grupo = await col_grupos.find_one({"_id": ObjectId(grupo_id)})
        if not grupo:
            Logger.add_to_log("warn", f"Grupo no encontrado: {grupo_id}")
            return {"mensaje": "No se encontró el grupo"}

        if cuidador_solicitante_id not in grupo.get("cuidador_ids", []):
            Logger.add_to_log("warn", f"Cuidador {cuidador_solicitante_id} no pertenece al grupo {grupo_id}")
            return {"error": "No tienes permiso para ver este grupo"}

        mas_cercano  = None
        min_distancia = float("inf")

        async for ub in col_ubicaciones.find({"cuidador_id": {"$in": grupo["cuidador_ids"]}}):
            distancia = calcular_distancia(
                latitud_paciente, longitud_paciente,
                ub["latitud"], ub["longitud"]
            )
            if distancia < min_distancia:
                min_distancia = distancia
                mas_cercano   = ub["cuidador_id"]

        if not mas_cercano:
            Logger.add_to_log("warn", f"Sin ubicaciones de cuidadores para grupo: {grupo_id}")
            return {"mensaje": "No hay ubicaciones disponibles de los cuidadores"}

        cuidador = await col_cuidadores.find_one({"_id": ObjectId(mas_cercano)})
        if not cuidador:
            Logger.add_to_log("warn", f"Cuidador no encontrado: {mas_cercano}")
            return {"mensaje": "El cuidador más cercano ya no existe"}

        Logger.add_to_log("info", f"Cuidador más cercano: {mas_cercano}")
        return {
            "cuidador_id":  mas_cercano,
            "nombre":       cuidador["name"],
            "distancia_m":  round(min_distancia, 2)
        }

    except Exception as ex:
        Logger.add_to_log("error", f"Error al obtener cuidador más cercano: {ex}")
        return {"error": f"No se pudo obtener el cuidador más cercano: {ex}"}


async def obtener_grupo(grupo_id: str):
    try:
        db         = get_database()
        col_grupos = db["Grupos"]

        grupo = await col_grupos.find_one({"_id": ObjectId(grupo_id)})
        if not grupo:
            Logger.add_to_log("warn", f"Grupo no encontrado: {grupo_id}")
            return {"error": "No se encontró el grupo"}

        grupo["id"] = str(grupo["_id"])
        del grupo["_id"]

        Logger.add_to_log("info", f"Grupo obtenido: {grupo_id}")
        return grupo

    except Exception as ex:
        Logger.add_to_log("error", f"Error al obtener grupo: {ex}")
        return {"error": f"No se pudo obtener el grupo: {ex}"}


async def actualizar_grupo(grupo_id: str, cuidador_id: str, datos: ActualizarGrupo):
    try:
        db         = get_database()
        col_grupos = db["Grupos"]

        grupo = await col_grupos.find_one({"_id": ObjectId(grupo_id)})
        if not grupo:
            Logger.add_to_log("warn", f"Grupo no encontrado: {grupo_id}")
            return {"error": "No se encontró el grupo"}

        if str(grupo.get("cuidador_principal_id")) != cuidador_id:
            Logger.add_to_log("warn", f"Intento de actualización no autorizado: {cuidador_id}")
            return {"error": "No tienes permiso para actualizar este grupo"}

        campos = {}
        if datos.nombre:
            campos["nombre"] = datos.nombre

        if campos:
            await col_grupos.update_one({"_id": ObjectId(grupo_id)}, {"$set": campos})
            Logger.add_to_log("info", f"Grupo actualizado: {grupo_id}")
            return {"mensaje": "Grupo actualizado exitosamente"}
        else:
            return {"mensaje": "No se proporcionaron campos para actualizar"}

    except Exception as ex:
        Logger.add_to_log("error", f"Error al actualizar grupo: {ex}")
        return {"error": f"No se pudo actualizar el grupo: {ex}"}


async def crear_invitacion(grupo_id: str, cuidador_id: str, expira_horas: int | None = None) -> dict:
    try:
        db         = get_database()
        col_grupos = db["Grupos"]
        col_inv    = db["Invitaciones"]

        grupo = await col_grupos.find_one({"_id": ObjectId(grupo_id)})
        if not grupo:
            return {"error": "No se encontró el grupo"}
        if cuidador_id not in grupo.get("cuidador_ids", []):
            Logger.add_to_log("warn", f"Creación de invitación no autorizada: {cuidador_id}")
            return {"error": "No tienes permiso para crear invitaciones en este grupo"}

        horas     = expira_horas or INVITACION_EXPIRA_HORAS
        now       = datetime.now(timezone.utc)
        expira_en = now + timedelta(hours=horas)

        # Token único (reintenta ante colisión improbable; el índice único protege la carrera)
        token = None
        for _ in range(5):
            candidato = _generar_codigo()
            if not await col_inv.find_one({"token": candidato}):
                token = candidato
                break
        if not token:
            return {"error": "No se pudo generar una invitación, intenta de nuevo"}

        await col_inv.insert_one({
            "grupo_id":   grupo_id,
            "token":      token,
            "creado_por": cuidador_id,
            "created_at": now,
            "expira_en":  expira_en,
            "usado":      False,
            "usado_por":  None,
            "usado_en":   None,
        })

        Logger.add_to_log("info", f"Invitación creada para grupo {grupo_id} por {cuidador_id}")
        return {"token": token, "expira_en": expira_en.isoformat()}

    except Exception as ex:
        Logger.add_to_log("error", f"Error al crear invitación: {ex}")
        return {"error": f"No se pudo crear la invitación: {ex}"}


async def listar_invitaciones(grupo_id: str, cuidador_id: str):
    try:
        db         = get_database()
        col_grupos = db["Grupos"]
        col_inv    = db["Invitaciones"]

        grupo = await col_grupos.find_one({"_id": ObjectId(grupo_id)})
        if not grupo:
            return {"error": "No se encontró el grupo"}
        if cuidador_id not in grupo.get("cuidador_ids", []):
            return {"error": "No tienes permiso para ver las invitaciones de este grupo"}

        now    = datetime.now(timezone.utc)
        cursor = col_inv.find({"grupo_id": grupo_id, "usado": False, "expira_en": {"$gt": now}})
        invitaciones = []
        async for inv in cursor:
            invitaciones.append({
                "id":         str(inv["_id"]),
                "token":      inv["token"],
                "expira_en":  inv["expira_en"].isoformat() if inv.get("expira_en") else None,
                "created_at": inv["created_at"].isoformat() if inv.get("created_at") else None,
            })
        return invitaciones

    except Exception as ex:
        Logger.add_to_log("error", f"Error al listar invitaciones: {ex}")
        return {"error": f"No se pudieron listar las invitaciones: {ex}"}


async def revocar_invitacion(grupo_id: str, invitacion_id: str, cuidador_id: str) -> dict:
    try:
        db         = get_database()
        col_grupos = db["Grupos"]
        col_inv    = db["Invitaciones"]

        grupo = await col_grupos.find_one({"_id": ObjectId(grupo_id)})
        if not grupo:
            return {"error": "No se encontró el grupo"}
        if cuidador_id not in grupo.get("cuidador_ids", []):
            return {"error": "No tienes permiso para revocar invitaciones de este grupo"}

        res = await col_inv.delete_one({"_id": ObjectId(invitacion_id), "grupo_id": grupo_id})
        if res.deleted_count == 0:
            return {"mensaje": "La invitación no existe o ya fue eliminada"}

        Logger.add_to_log("info", f"Invitación {invitacion_id} revocada en grupo {grupo_id}")
        return {"mensaje": "Invitación revocada"}

    except Exception as ex:
        Logger.add_to_log("error", f"Error al revocar invitación: {ex}")
        return {"error": f"No se pudo revocar la invitación: {ex}"}


async def consumir_invitacion(token: str, familiar_id: str) -> dict:
    """Consume una invitación de un solo uso y une al familiar al grupo.

    El flip atómico de `usado` (False→True) garantiza que un token solo pueda
    usarse una vez, sin condición de carrera entre dos familiares.
    """
    try:
        db             = get_database()
        col_grupos     = db["Grupos"]
        col_familiares = db["Familiares"]
        col_inv        = db["Invitaciones"]

        token = token.strip().upper()
        now   = datetime.now(timezone.utc)

        inv = await col_inv.find_one_and_update(
            {"token": token, "usado": False, "expira_en": {"$gt": now}},
            {"$set": {"usado": True, "usado_por": familiar_id, "usado_en": now}},
        )
        if not inv:
            Logger.add_to_log("warn", f"Invitación inválida/usada/caducada: {token}")
            return {"error": "Invitación inválida, ya utilizada o caducada. Pide una nueva al cuidador."}

        grupo_id = str(inv["grupo_id"])

        # Escrituras secundarias (best-effort, estilo del repo)
        await col_grupos.update_one(
            {"_id": ObjectId(grupo_id)},
            {"$addToSet": {"familiar_ids": familiar_id}}
        )
        await col_familiares.update_one(
            {"_id": ObjectId(familiar_id)},
            {"$addToSet": {"grupo_ids": grupo_id}}
        )

        Logger.add_to_log("info", f"Familiar {familiar_id} se unió al grupo {grupo_id} vía invitación")
        return {"mensaje": "Te has unido al grupo exitosamente", "grupo_id": grupo_id}

    except Exception as ex:
        Logger.add_to_log("error", f"Error al consumir invitación: {ex}")
        return {"error": f"No se pudo unir al grupo: {ex}"}


async def guardar_ubicacion_familiar(datos: UbicacionFamiliar):
    try:
        db  = get_database()
        now = datetime.now(timezone.utc)

        await db["UbicacionesFamiliares"].update_one(
            {"familiar_id": datos.familiar_id},
            {"$set": {
                "familiar_id": datos.familiar_id,
                "latitud":     datos.latitud,
                "longitud":    datos.longitud,
                "timestamp":   now,
            }},
            upsert=True,
        )

        # Persistir última posición en el documento principal (sin TTL) para detección de zona muerta
        try:
            await db["Familiares"].update_one(
                {"_id": ObjectId(datos.familiar_id)},
                {"$set": {
                    "ultima_ubicacion_lat": datos.latitud,
                    "ultima_ubicacion_lng": datos.longitud,
                    "ultima_ubicacion_ts":  now,
                }},
            )
        except Exception:
            pass

        Logger.add_to_log("info", f"Ubicación de familiar actualizada: {datos.familiar_id}")
        return {"mensaje": "Ubicación actualizada exitosamente"}

    except Exception as ex:
        Logger.add_to_log("error", f"Error al guardar ubicación del familiar: {ex}")
        return {"error": f"No se pudo guardar la ubicación: {ex}"}


async def obtener_ubicaciones_grupo_familiar(grupo_id: str, familiar_solicitante_id: str):
    try:
        db                = get_database()
        col_grupos        = db["Grupos"]
        col_ub_cuidadores = db["UbicacionesCuidadores"]
        col_ub_familiares = db["UbicacionesFamiliares"]
        col_cuidadores    = db["Cuidadores"]
        col_familiares    = db["Familiares"]
        col_pacientes     = db["Pacientes"]

        grupo = await col_grupos.find_one({"_id": ObjectId(grupo_id)})
        if not grupo:
            return {"mensaje": "No se encontró el grupo"}

        if familiar_solicitante_id not in grupo.get("familiar_ids", []):
            return {"error": "No tienes permiso para ver las ubicaciones de este grupo"}

        ubicaciones_cuidadores = []
        async for ub in col_ub_cuidadores.find({"cuidador_id": {"$in": grupo["cuidador_ids"]}}):
            ub.pop("_id", None)
            ub["tipo"] = "cuidador"
            try:
                perfil = await col_cuidadores.find_one({"_id": ObjectId(ub["cuidador_id"])})
                if perfil:
                    ub["nombre"]   = perfil.get("name", "")
                    ub["telefono"] = perfil.get("phone")
                    ub["foto"]     = perfil.get("foto")
            except Exception:
                pass
            ubicaciones_cuidadores.append(ub)

        ubicaciones_familiares = []
        async for ub in col_ub_familiares.find({"familiar_id": {"$in": grupo.get("familiar_ids", [])}}):
            ub.pop("_id", None)
            ub["tipo"] = "familiar"
            try:
                perfil = await col_familiares.find_one({"_id": ObjectId(ub["familiar_id"])})
                if perfil:
                    ub["nombre"]   = perfil.get("name", "")
                    ub["telefono"] = perfil.get("phone")
                    ub["foto"]     = perfil.get("foto")
            except Exception:
                pass
            ubicaciones_familiares.append(ub)

        ubicaciones_pacientes = []
        for paciente_id in grupo.get("paciente_ids", []):
            try:
                paciente = await col_pacientes.find_one({"_id": ObjectId(paciente_id)})
                if paciente and paciente.get("ultima_ubicacion"):
                    ubicaciones_pacientes.append({
                        "paciente_id":      paciente_id,
                        "nombre_paciente":  paciente["nombre_paciente"],
                        "ultima_ubicacion": paciente["ultima_ubicacion"]
                    })
            except Exception:
                pass

        Logger.add_to_log("info", f"Ubicaciones obtenidas para grupo (familiar): {grupo_id}")
        return {
            "cuidadores": ubicaciones_cuidadores,
            "familiares": ubicaciones_familiares,
            "pacientes":  ubicaciones_pacientes
        }

    except Exception as ex:
        Logger.add_to_log("error", f"Error al obtener ubicaciones del grupo (familiar): {ex}")
        return {"error": f"No se pudieron obtener las ubicaciones: {ex}"}


async def obtener_miembros_grupo(grupo_id: str) -> dict:
    try:
        db             = get_database()
        col_grupos     = db["Grupos"]
        col_pacientes  = db["Pacientes"]
        col_familiares = db["Familiares"]
        col_ub_fam     = db["UbicacionesFamiliares"]

        grupo = await col_grupos.find_one({"_id": ObjectId(grupo_id)})
        if not grupo:
            return {"error": "Grupo no encontrado"}

        pacientes = []
        for pid in grupo.get("paciente_ids", []):
            try:
                p = await col_pacientes.find_one({"_id": ObjectId(pid)})
                if p:
                    pacientes.append({
                        "id":              str(p["_id"]),
                        "nombre_paciente": p.get("nombre_paciente", ""),
                        "enfermedad":      p.get("enfermedad", ""),
                        "ultima_ubicacion": p.get("ultima_ubicacion"),
                    })
            except Exception:
                pass

        familiares = []
        for fid in grupo.get("familiar_ids", []):
            try:
                f  = await col_familiares.find_one({"_id": ObjectId(fid)})
                ub = await col_ub_fam.find_one({"familiar_id": fid})
                if f:
                    familiares.append({
                        "id":    str(f["_id"]),
                        "name":  f.get("name", ""),
                        "email": f.get("email", ""),
                        "ultima_ubicacion": {
                            "latitud":   ub["latitud"],
                            "longitud":  ub["longitud"],
                            "timestamp": str(ub["timestamp"]),
                        } if ub else None,
                    })
            except Exception:
                pass

        Logger.add_to_log("info", f"Miembros obtenidos para grupo: {grupo_id}")
        return {"pacientes": pacientes, "familiares": familiares}

    except Exception as ex:
        Logger.add_to_log("error", f"Error al obtener miembros del grupo: {ex}")
        return {"error": str(ex)}