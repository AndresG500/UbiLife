import os
import asyncio
import bcrypt
from datetime import datetime, timezone
from bson import ObjectId
from database.database import get_database
from models.model_admin import CrearAdmin
from security.jwt_handler import crear_token
from utils.Logger import Logger

BCRYPT_ROUNDS = 12
AUTH_DELAY    = 0.2
_SETUP_KEY    = os.getenv("ADMIN_SETUP_KEY", "")


# ─── Auth ─────────────────────────────────────────────────────────────────────

async def crear_admin(datos: CrearAdmin):
    if not _SETUP_KEY or datos.setup_key != _SETUP_KEY:
        Logger.add_to_log("warn", "Intento de setup admin con clave inválida")
        return {"error": "Clave de configuración inválida"}
    try:
        db  = get_database()
        col = db["Administradores"]

        if await col.find_one({"email": datos.email}):
            return {"error": "El correo ya está registrado"}

        hashed = bcrypt.hashpw(datos.password.encode(), bcrypt.gensalt(rounds=BCRYPT_ROUNDS)).decode()
        await col.insert_one({
            "nombre":         datos.nombre,
            "email":          datos.email,
            "password":       hashed,
            "activo":         True,
            "fecha_creacion": datetime.now(timezone.utc),
        })
        Logger.add_to_log("info", "Admin creado")
        return {"mensaje": "Administrador creado exitosamente"}
    except Exception as ex:
        Logger.add_to_log("error", f"Error creando admin: {ex}")
        return {"error": "No se pudo crear el administrador"}


async def verificar_admin(email: str, password: str):
    try:
        db    = get_database()
        admin = await db["Administradores"].find_one({"email": email})
        dummy = bcrypt.hashpw(b"dummy", bcrypt.gensalt(rounds=BCRYPT_ROUNDS))
        stored = admin["password"].encode() if admin else dummy

        es_valida = bcrypt.checkpw(password.encode(), stored)
        await asyncio.sleep(AUTH_DELAY)

        if not admin or not es_valida or not admin.get("activo", True):
            Logger.add_to_log("warn", "Login admin fallido")
            return {"error": "Credenciales inválidas"}

        token = crear_token({"sub": admin["email"]})
        Logger.add_to_log("info", "Login admin exitoso")
        return {
            "access_token": token,
            "token_type":   "bearer",
            "admin": {
                "id":     str(admin["_id"]),
                "nombre": admin["nombre"],
                "email":  admin["email"],
            },
        }
    except Exception as ex:
        Logger.add_to_log("error", f"Error en login admin: {ex}")
        await asyncio.sleep(AUTH_DELAY)
        return {"error": "Credenciales inválidas"}


# ─── Gestión de cuidadores ────────────────────────────────────────────────────

async def listar_cuidadores():
    try:
        db         = get_database()
        resultado  = []
        async for c in db["Cuidadores"].find({}, {"password": 0}):
            total_pacientes = await db["Pacientes"].count_documents({"id_cuidador": str(c["_id"])})
            resultado.append({
                "id":               str(c["_id"]),
                "nombre":           c.get("name"),
                "email":            c.get("email"),
                "phone":            c.get("phone"),
                "activo":           c.get("activo", True),
                "fecha_creacion":   c.get("fecha_creacion"),
                "total_pacientes":  total_pacientes,
            })
        return resultado
    except Exception as ex:
        Logger.add_to_log("error", f"Error listando cuidadores (admin): {ex}")
        return {"error": "No se pudieron obtener los cuidadores"}


async def cambiar_estado_cuidador(cuidador_id: str, activo: bool):
    try:
        db         = get_database()
        resultado  = await db["Cuidadores"].update_one(
            {"_id": ObjectId(cuidador_id)},
            {"$set": {"activo": activo}},
        )
        if resultado.matched_count == 0:
            return {"error": "Cuidador no encontrado"}

        estado = "activada" if activo else "desactivada"
        Logger.add_to_log("info", f"Cuenta {cuidador_id} {estado} por admin")
        return {"mensaje": f"Cuenta {estado} exitosamente"}
    except Exception as ex:
        Logger.add_to_log("error", f"Error cambiando estado cuidador: {ex}")
        return {"error": "No se pudo actualizar el estado"}


# ─── Gestión de familiares ────────────────────────────────────────────────────

async def listar_familiares():
    try:
        db        = get_database()
        resultado = []
        async for f in db["Familiares"].find({}, {"password": 0}):
            resultado.append({
                "id":             str(f["_id"]),
                "nombre":         f.get("nombre"),
                "email":          f.get("email"),
                "telefono":       f.get("telefono"),
                "activo":         f.get("activo", True),
                "fecha_creacion": f.get("fecha_creacion"),
                "total_grupos":   len(f.get("grupo_ids", [])),
            })
        return resultado
    except Exception as ex:
        Logger.add_to_log("error", f"Error listando familiares (admin): {ex}")
        return {"error": "No se pudieron obtener los familiares"}


async def cambiar_estado_familiar(familiar_id: str, activo: bool):
    try:
        db        = get_database()
        resultado = await db["Familiares"].update_one(
            {"_id": ObjectId(familiar_id)},
            {"$set": {"activo": activo}},
        )
        if resultado.matched_count == 0:
            return {"error": "Familiar no encontrado"}

        estado = "activada" if activo else "desactivada"
        Logger.add_to_log("info", f"Cuenta familiar {familiar_id} {estado} por admin")
        return {"mensaje": f"Cuenta {estado} exitosamente"}
    except Exception as ex:
        Logger.add_to_log("error", f"Error cambiando estado familiar: {ex}")
        return {"error": "No se pudo actualizar el estado"}


# ─── Gestión de dispositivos ──────────────────────────────────────────────────

async def listar_dispositivos_admin():
    try:
        db = get_database()

        ids_bloqueados = {
            d["id_dispositivo"]
            async for d in db["DispositivosBloqueados"].find({}, {"id_dispositivo": 1})
        }

        vinculados = []
        async for d in db["Dispositivos"].find({"paciente_id": {"$ne": None}}):
            vinculados.append({
                "id_dispositivo":  d["id_dispositivo"],
                "paciente_id":     str(d["paciente_id"]),
                "ultima_conexion": d.get("ultima_conexion"),
                "bloqueado":       d["id_dispositivo"] in ids_bloqueados,
            })

        libres = []
        async for d in db["Dispositivos"].find({"paciente_id": None}):
            libres.append({
                "id_dispositivo":  d["id_dispositivo"],
                "ultima_conexion": d.get("ultima_conexion"),
                "bloqueado":       d["id_dispositivo"] in ids_bloqueados,
            })

        disponibles = []
        async for d in db["DispositivosDisponibles"].find({}):
            disponibles.append({
                "id_dispositivo": d["id_dispositivo"],
                "detectado_en":   d.get("dispositivo_detectado"),
            })

        bloqueados = []
        async for d in db["DispositivosBloqueados"].find({}):
            bloqueados.append({
                "id_dispositivo": d["id_dispositivo"],
                "bloqueado_en":   d.get("bloqueado_en"),
            })

        return {
            "vinculados":   vinculados,
            "libres":       libres,
            "disponibles":  disponibles,
            "bloqueados":   bloqueados,
        }
    except Exception as ex:
        Logger.add_to_log("error", f"Error listando dispositivos (admin): {ex}")
        return {"error": "No se pudieron obtener los dispositivos"}


async def bloquear_dispositivo(id_dispositivo: str):
    try:
        db = get_database()
        ya_bloqueado = await db["DispositivosBloqueados"].find_one({"id_dispositivo": id_dispositivo})

        if ya_bloqueado:
            await db["DispositivosBloqueados"].delete_one({"id_dispositivo": id_dispositivo})
            Logger.add_to_log("info", f"Dispositivo desbloqueado por admin: {id_dispositivo}")
            return {"mensaje": f"Dispositivo {id_dispositivo} desbloqueado", "bloqueado": False}

        # Bloquear: sacarlo de disponibles y registrarlo en bloqueados
        await db["DispositivosDisponibles"].delete_one({"id_dispositivo": id_dispositivo})
        await db["DispositivosBloqueados"].update_one(
            {"id_dispositivo": id_dispositivo},
            {"$set": {
                "id_dispositivo": id_dispositivo,
                "bloqueado_en":   datetime.now(timezone.utc),
            }},
            upsert=True,
        )
        Logger.add_to_log("info", f"Dispositivo bloqueado por admin: {id_dispositivo}")
        return {"mensaje": f"Dispositivo {id_dispositivo} bloqueado", "bloqueado": True}
    except Exception as ex:
        Logger.add_to_log("error", f"Error bloqueando dispositivo: {ex}")
        return {"error": "No se pudo actualizar el estado del dispositivo"}


# ─── Gestión de reportes ──────────────────────────────────────────────────────

def _serializar_reporte(r: dict) -> dict:
    return {
        "id":                str(r["_id"]),
        "remitente_nombre":  r.get("remitente_nombre"),
        "remitente_tipo":    r.get("remitente_tipo"),
        "descripcion":       r.get("descripcion"),
        "id_dispositivo":    r.get("id_dispositivo"),
        "creado_en":         r.get("creado_en"),
        "actualizado_en":    r.get("actualizado_en"),
    }


async def listar_reportes_admin():
    try:
        db = get_database()

        recibidos, en_revision, solucionados = [], [], []
        async for r in db["Reportes"].find({}).sort("creado_en", -1):
            item = _serializar_reporte(r)
            if r.get("estado") == "recibido":
                recibidos.append(item)
            elif r.get("estado") == "en_revision":
                en_revision.append(item)
            elif r.get("estado") == "solucionado":
                solucionados.append(item)

        return {
            "recibidos":    recibidos,
            "en_revision":  en_revision,
            "solucionados": solucionados,
        }
    except Exception as ex:
        Logger.add_to_log("error", f"Error listando reportes (admin): {ex}")
        return {"error": "No se pudieron obtener los reportes"}


async def cambiar_estado_reporte(reporte_id: str, estado: str):
    try:
        db = get_database()
        try:
            reporte_oid = ObjectId(reporte_id)
        except Exception:
            return {"error": "ID de reporte inválido"}

        resultado = await db["Reportes"].update_one(
            {"_id": reporte_oid},
            {"$set": {"estado": estado, "actualizado_en": datetime.now(timezone.utc)}},
        )
        if resultado.matched_count == 0:
            return {"error": "Reporte no encontrado"}

        Logger.add_to_log("info", f"Reporte {reporte_id} actualizado a estado '{estado}'")
        return {"mensaje": "Estado del reporte actualizado", "estado": estado}
    except Exception as ex:
        Logger.add_to_log("error", f"Error cambiando estado de reporte: {ex}")
        return {"error": "No se pudo actualizar el reporte"}


async def eliminar_reporte(reporte_id: str):
    try:
        db = get_database()
        try:
            reporte_oid = ObjectId(reporte_id)
        except Exception:
            return {"error": "ID de reporte inválido"}

        reporte = await db["Reportes"].find_one({"_id": reporte_oid})
        if not reporte:
            return {"error": "Reporte no encontrado"}
        if reporte.get("estado") != "solucionado":
            return {"error": "Solo se pueden eliminar reportes solucionados"}

        await db["Reportes"].delete_one({"_id": reporte_oid})
        Logger.add_to_log("info", f"Reporte {reporte_id} eliminado")
        return {"mensaje": "Reporte eliminado exitosamente"}
    except Exception as ex:
        Logger.add_to_log("error", f"Error eliminando reporte: {ex}")
        return {"error": "No se pudo eliminar el reporte"}


# ─── Dashboard ────────────────────────────────────────────────────────────────

async def obtener_estadisticas():
    try:
        db = get_database()

        total_cuidadores      = await db["Cuidadores"].count_documents({})
        cuidadores_activos    = await db["Cuidadores"].count_documents({"activo": True})
        total_familiares      = await db["Familiares"].count_documents({})
        familiares_activos    = await db["Familiares"].count_documents({"activo": True})
        total_pacientes       = await db["Pacientes"].count_documents({})
        pacientes_activos     = await db["Pacientes"].count_documents({"activo": True})
        disp_vinculados       = await db["Dispositivos"].count_documents({"paciente_id": {"$ne": None}})
        disp_libres           = await db["Dispositivos"].count_documents({"paciente_id": None})
        disp_disponibles      = await db["DispositivosDisponibles"].count_documents({})
        disp_bloqueados       = await db["DispositivosBloqueados"].count_documents({})
        reportes_recibidos    = await db["Reportes"].count_documents({"estado": "recibido"})
        reportes_en_revision  = await db["Reportes"].count_documents({"estado": "en_revision"})

        return {
            "usuarios": {
                "total":   total_cuidadores + total_familiares,
                "activos": cuidadores_activos + familiares_activos,
            },
            "pacientes":   {"total": total_pacientes, "activos": pacientes_activos},
            "dispositivos": {
                "vinculados":   disp_vinculados,
                "libres":       disp_libres,
                "disponibles":  disp_disponibles,
                "bloqueados":   disp_bloqueados,
            },
            "reportes": {
                "recibidos":   reportes_recibidos,
                "en_revision": reportes_en_revision,
            },
        }
    except Exception as ex:
        Logger.add_to_log("error", f"Error obteniendo estadísticas: {ex}")
        return {"error": "No se pudieron obtener las estadísticas"}
