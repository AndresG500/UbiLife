import os
import asyncio
import bcrypt
from datetime import datetime, timedelta, timezone
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
        Logger.add_to_log("info", f"Admin creado: {datos.email}")
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
            Logger.add_to_log("warn", f"Login admin fallido: {email}")
            return {"error": "Credenciales inválidas"}

        token = crear_token({"sub": admin["email"]})
        Logger.add_to_log("info", f"Login admin exitoso: {email}")
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
                "id_dispositivo":      d["id_dispositivo"],
                "detectado_en":        d.get("dispositivo_detectado"),
                "registrado_por_admin": d.get("registrado_por_admin", False),
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


async def registrar_dispositivo_admin(id_dispositivo: str):
    try:
        db = get_database()

        if await db["DispositivosBloqueados"].find_one({"id_dispositivo": id_dispositivo}):
            return {"error": "El dispositivo está bloqueado y no puede registrarse"}

        await db["DispositivosDisponibles"].update_one(
            {"id_dispositivo": id_dispositivo},
            {
                "$set": {
                    "id_dispositivo":        id_dispositivo,
                    "dispositivo_detectado": datetime.now(timezone.utc),
                    "registrado_por_admin":  True,
                },
                "$setOnInsert": {"created_at": datetime.now(timezone.utc)},
            },
            upsert=True,
        )
        Logger.add_to_log("info", f"Dispositivo pre-registrado por admin: {id_dispositivo}")
        return {"mensaje": f"Dispositivo {id_dispositivo} registrado y disponible para vinculación"}
    except Exception as ex:
        Logger.add_to_log("error", f"Error registrando dispositivo (admin): {ex}")
        return {"error": "No se pudo registrar el dispositivo"}


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


# ─── Dashboard ────────────────────────────────────────────────────────────────

async def obtener_estadisticas():
    try:
        db       = get_database()
        hace_24h = datetime.now(timezone.utc) - timedelta(hours=24)

        total_cuidadores      = await db["Cuidadores"].count_documents({})
        cuidadores_activos    = await db["Cuidadores"].count_documents({"activo": True})
        total_familiares      = await db["Familiares"].count_documents({})
        total_pacientes       = await db["Pacientes"].count_documents({})
        pacientes_activos     = await db["Pacientes"].count_documents({"activo": True})
        disp_vinculados       = await db["Dispositivos"].count_documents({"paciente_id": {"$ne": None}})
        disp_libres           = await db["Dispositivos"].count_documents({"paciente_id": None})
        disp_disponibles      = await db["DispositivosDisponibles"].count_documents({})
        disp_bloqueados       = await db["DispositivosBloqueados"].count_documents({})
        alertas_24h           = await db["Alertas"].count_documents({"timestamp": {"$gte": hace_24h}})
        alertas_pendientes    = await db["Alertas"].count_documents({"estado": {"$in": ["pendiente", "enviada"]}})

        return {
            "cuidadores":  {"total": total_cuidadores, "activos": cuidadores_activos},
            "familiares":  {"total": total_familiares},
            "pacientes":   {"total": total_pacientes, "activos": pacientes_activos},
            "dispositivos": {
                "vinculados":   disp_vinculados,
                "libres":       disp_libres,
                "disponibles":  disp_disponibles,
                "bloqueados":   disp_bloqueados,
            },
            "alertas": {
                "ultimas_24h": alertas_24h,
                "pendientes":  alertas_pendientes,
            },
        }
    except Exception as ex:
        Logger.add_to_log("error", f"Error obteniendo estadísticas: {ex}")
        return {"error": "No se pudieron obtener las estadísticas"}
