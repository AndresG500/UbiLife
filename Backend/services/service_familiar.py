from database.database import get_database
from models.model_familiar import CrearFamiliar
from datetime import datetime, timezone
import asyncio
import bcrypt
from utils.Logger import Logger
from security.jwt_handler import crear_token
from services.service_grupo import consumir_invitacion
from bson import ObjectId

BCRYPT_ROUNDS = 12
AUTH_DELAY = 0.2


async def registrar_familiar(datos: CrearFamiliar):
    try:
        db             = get_database()
        col_familiares = db["Familiares"]

        if await col_familiares.find_one({"email": datos.email}):
            Logger.add_to_log("warn", "Email familiar ya registrado")
            return {"error": "No se pudo completar el registro. Verifica tus datos."}

        hashed = bcrypt.hashpw(
            datos.password.encode("utf-8"),
            bcrypt.gensalt(rounds=BCRYPT_ROUNDS)
        ).decode("utf-8")

        doc = {
            "name":       datos.name,
            "email":      datos.email,
            "password":   hashed,
            "phone":      datos.phone,
            "foto":       datos.foto,
            "grupo_ids":  [],
            "activo":     True,
            "created_at": datetime.now(timezone.utc),
        }

        resultado   = await col_familiares.insert_one(doc)
        familiar_id = str(resultado.inserted_id)

        # El grupo es opcional: si viene una invitación, se consume (un solo uso).
        # Un código inválido NO bloquea el registro; el familiar podrá unirse luego.
        unido = False
        if datos.codigo_grupo:
            res   = await consumir_invitacion(datos.codigo_grupo, familiar_id)
            unido = "grupo_id" in res

        Logger.add_to_log("info", "Familiar registrado")
        return {"mensaje": "Familiar registrado exitosamente", "unido_a_grupo": unido}

    except Exception as ex:
        Logger.add_to_log("error", f"Error al registrar familiar: {ex}")
        return {"error": f"No se pudo registrar: {ex}"}


async def verificar_familiar(email: str, password: str):
    try:
        db             = get_database()
        col_familiares = db["Familiares"]
        familiar       = await col_familiares.find_one({"email": email})
        dummy_hash     = bcrypt.hashpw(b"dummy", bcrypt.gensalt(rounds=BCRYPT_ROUNDS))
        stored_hash    = familiar["password"].encode("utf-8") if familiar else dummy_hash

        es_valida = bcrypt.checkpw(password.encode("utf-8"), stored_hash)
        await asyncio.sleep(AUTH_DELAY)

        if not familiar or not es_valida:
            Logger.add_to_log("warn", "Verificación familiar fallida")
            return {"mensaje": "Credenciales inválidas"}

        if not familiar.get("activo", True):
            Logger.add_to_log("warn", "Familiar inactivo intentó iniciar sesión")
            return {"mensaje": "Credenciales inválidas"}

        token = crear_token({"sub": familiar["email"]})

        Logger.add_to_log("info", "Familiar verificado")
        return {
            "access_token": token,
            "token_type":   "bearer",
            "familiar": {
                "id":    str(familiar["_id"]),
                "name":  familiar.get("name", ""),
                "email": familiar.get("email", ""),
                "phone": familiar.get("phone", ""),
                "foto":  familiar.get("foto"),
            },
        }

    except Exception as ex:
        Logger.add_to_log("error", f"Error al verificar familiar: {ex}")
        await asyncio.sleep(AUTH_DELAY)
        return {"mensaje": "Credenciales inválidas"}


async def actualizar_familiar(familiar_id: str, datos: dict):
    try:
        db        = get_database()
        cambios   = {k: v for k, v in datos.items() if v is not None}
        if not cambios:
            return {"error": "No se enviaron cambios"}
        resultado = await db["Familiares"].update_one(
            {"_id": ObjectId(familiar_id)},
            {"$set": cambios},
        )
        if resultado.matched_count == 0:
            return {"error": "Familiar no encontrado"}
        Logger.add_to_log("info", f"Familiar actualizado: {familiar_id}")
        return {"mensaje": "Perfil actualizado correctamente"}
    except Exception as ex:
        Logger.add_to_log("error", f"Error al actualizar familiar: {ex}")
        return {"error": f"No se pudo actualizar: {ex}"}


async def actualizar_fcm_familiar(email: str, fcm_token: str):
    try:
        coleccion = get_database()["Familiares"]
        resultado = await coleccion.update_one(
            {"email": email},
            {"$set": {"fcm_token": fcm_token}}
        )
        if resultado.matched_count == 0:
            return {"error": "Familiar no encontrado"}
        Logger.add_to_log("info", "FCM token familiar actualizado")
        return {"mensaje": "Token FCM actualizado exitosamente"}
    except Exception as ex:
        Logger.add_to_log("error", f"Error al actualizar FCM token familiar: {ex}")
        return {"error": f"No se pudo actualizar el token: {ex}"}


async def listar_grupos_familiar(familiar_id: str) -> list:
    try:
        db            = get_database()
        col_grupos    = db["Grupos"]
        col_pacientes = db["Pacientes"]

        grupos = []
        async for g in col_grupos.find({"familiar_ids": familiar_id}):
            g["id"] = str(g["_id"])
            del g["_id"]
            pacientes = []
            for pid in g.get("paciente_ids", []):
                try:
                    p = await col_pacientes.find_one({"_id": ObjectId(pid)}, {"nombre_paciente": 1})
                    if p:
                        pacientes.append({"id_paciente": pid, "nombre_paciente": p["nombre_paciente"]})
                except Exception:
                    pass
            g["pacientes"] = pacientes
            grupos.append(g)

        Logger.add_to_log("info", f"Grupos listados para familiar: {familiar_id}")
        return grupos

    except Exception as ex:
        Logger.add_to_log("error", f"Error al listar grupos del familiar: {ex}")
        return {"error": f"No se pudieron listar los grupos: {ex}"}


async def listar_pacientes_familiar(familiar_id: str) -> list:
    try:
        db            = get_database()
        col_grupos    = db["Grupos"]
        col_pacientes = db["Pacientes"]

        paciente_ids: set[str] = set()
        async for g in col_grupos.find({"familiar_ids": familiar_id}):
            for pid in g.get("paciente_ids", []):
                paciente_ids.add(pid)

        pacientes = []
        for pid in paciente_ids:
            try:
                p = await col_pacientes.find_one({"_id": ObjectId(pid)})
                if p:
                    p["id_paciente"] = str(p["_id"])
                    del p["_id"]
                    pacientes.append(p)
            except Exception:
                pass

        Logger.add_to_log("info", f"Pacientes listados para familiar: {familiar_id}")
        return pacientes

    except Exception as ex:
        Logger.add_to_log("error", f"Error al listar pacientes del familiar: {ex}")
        return {"error": f"No se pudieron listar los pacientes: {ex}"}
