from database.database import get_database
from models.model_cuidador import CrearCuidador, ActualizarCuidador
from datetime import datetime, timezone
import asyncio
import bcrypt
from bson import ObjectId
from utils.Logger import Logger
from security.jwt_handler import crear_token

BCRYPT_ROUNDS = 12
AUTH_DELAY = 0.2


async def registrar_cuidador(datos: CrearCuidador):
    try:
        coleccion = get_database()["Cuidadores"]

        if await coleccion.find_one({"email": datos.email}):
            Logger.add_to_log("warn", "Correo ya registrado")
            return {"error": "No se pudo completar el registro. Verifica tus datos."}

        if datos.phone and await coleccion.find_one({"phone": datos.phone}):
            Logger.add_to_log("warn", "Teléfono ya registrado")
            return {"error": "No se pudo completar el registro. Verifica tus datos."}

        hashed = bcrypt.hashpw(datos.password.encode("utf-8"), bcrypt.gensalt(rounds=BCRYPT_ROUNDS)).decode("utf-8")

        await coleccion.insert_one({
            "name":    datos.name,
            "email":   datos.email,
            "password": hashed,
            "phone":  datos.phone,
            "foto":   datos.foto,
            "patient_ids": [],
            "activo": True,
            "fecha_creacion": datetime.now(timezone.utc),
        })

        Logger.add_to_log("info", f"Cuidador registrado")
        return {"mensaje": "Cuidador registrado exitosamente"}

    except Exception as ex:
        Logger.add_to_log("error", f"Error al registrar cuidador: {ex}")
        return {"error": f"No se pudo registrar el cuidador: {ex}"}


async def borrar_cuidador(email: str, email_solicitante: str):
    try:
        if email != email_solicitante:
            Logger.add_to_log("warn", "Intento de eliminación no autorizado")
            return {"error": "No tienes permiso para eliminar esta cuenta"}

        db = get_database()
        coleccion = db["Cuidadores"]
        cuidador = await coleccion.find_one({"email": email})

        if not cuidador:
            Logger.add_to_log("warn", "Cuidador no encontrado para eliminar")
            return {"mensaje": "No se encontró la cuenta"}

        cuidador_id = str(cuidador["_id"])

        # Cascade: delete patients and their dependent data
        pacientes = await db["Pacientes"].find({"id_cuidador": cuidador_id}).to_list(length=None)
        paciente_ids = [str(p["_id"]) for p in pacientes]
        if paciente_ids:
            await db["ZonasSeguras"].delete_many({"paciente_id": {"$in": paciente_ids}})
            await db["Alertas"].delete_many({"paciente_id": {"$in": paciente_ids}})
            await db["Historial"].delete_many({"paciente_id": {"$in": paciente_ids}})
            await db["Pacientes"].delete_many({"id_cuidador": cuidador_id})

        # Groups where cuidador is principal: delete the group
        async for grupo in db["Grupos"].find({"cuidador_principal_id": cuidador_id}):
            await db["Grupos"].delete_one({"_id": grupo["_id"]})

        # Groups where cuidador is just a member: remove from list
        await db["Grupos"].update_many(
            {"cuidador_ids": cuidador_id},
            {"$pull": {"cuidador_ids": cuidador_id}}
        )

        await db["UbicacionesCuidadores"].delete_one({"cuidador_id": cuidador_id})

        await coleccion.delete_one({"email": email})
        Logger.add_to_log("info", "Cuidador eliminado con cascade")
        return {"mensaje": "Cuenta eliminada exitosamente"}

    except Exception as ex:
        Logger.add_to_log("error", f"Error al eliminar cuidador: {ex}")
        return {"error": f"No se pudo eliminar el cuidador: {ex}"}


async def actualizar_cuidador(email: str, datos: ActualizarCuidador, email_solicitante: str):
    try:
        if email != email_solicitante:
            Logger.add_to_log("warn", "Intento de actualización no autorizado")
            return {"error": "No tienes permiso para actualizar esta cuenta"}

        coleccion = get_database()["Cuidadores"]
        cuidador = await coleccion.find_one({"email": email})

        if not cuidador:
            Logger.add_to_log("warn", "Cuidador no encontrado para actualizar")
            return {"mensaje": "No se encontró la cuenta"}

        campos = {}
        if datos.name:
            campos["name"] = datos.name
        if datos.phone:
            campos["phone"] = datos.phone
        if datos.foto is not None:
            campos["foto"] = datos.foto
        if datos.password:
            campos["password"] = bcrypt.hashpw(
                datos.password.encode("utf-8"), bcrypt.gensalt(rounds=BCRYPT_ROUNDS)
            ).decode("utf-8")

        if not campos:
            Logger.add_to_log("warn", "No se enviaron campos para actualizar")
            return {"mensaje": "No se enviaron campos para actualizar"}

        await coleccion.update_one({"email": email}, {"$set": campos})
        Logger.add_to_log("info", "Cuidador actualizado")
        return {"mensaje": "Cuenta actualizada exitosamente"}

    except Exception as ex:
        Logger.add_to_log("error", f"Error al actualizar cuidador: {ex}")
        return {"error": f"No se pudo actualizar el cuidador: {ex}"}


async def verificar_cuidador(email: str, password: str):
    try:
        db = get_database()
        coleccion = db["Cuidadores"]
        cuidador = await coleccion.find_one({"email": email})
        dummy_hash = bcrypt.hashpw(b"dummy_password", bcrypt.gensalt(rounds=BCRYPT_ROUNDS))
        stored_hash = cuidador["password"].encode("utf-8") if cuidador else dummy_hash

        es_valida = bcrypt.checkpw(password.encode("utf-8"), stored_hash)

        await asyncio.sleep(AUTH_DELAY)

        if not cuidador or not es_valida:
            Logger.add_to_log("warn", "Verificación fallida")
            return {"mensaje": "Credenciales inválidas"}

        if not cuidador.get("activo", True):
            Logger.add_to_log("warn", "Intento de login en cuenta inactiva")
            return {"mensaje": "Credenciales inválidas"}

        token = crear_token({"sub": cuidador["email"]})

        Logger.add_to_log("info", "Verificación exitosa")
        return {
            "access_token": token,
            "token_type":   "bearer",
            "cuidador": {
                "id":    str(cuidador["_id"]),
                "name":  cuidador.get("name", ""),
                "email": cuidador.get("email", ""),
                "phone": cuidador.get("phone", ""),
                "foto":  cuidador.get("foto"),
            },
        }

    except Exception as ex:
        Logger.add_to_log("error", f"Error al verificar cuidador: {ex}")
        await asyncio.sleep(AUTH_DELAY)
        return {"mensaje": "Credenciales inválidas"}

async def actualizar_fcm(email: str, fcm_token: str):
    try:
        coleccion = get_database()["Cuidadores"]
        resultado = await coleccion.update_one(
            {"email": email},
            {"$set": {"fcm_token": fcm_token}}
        )
        if resultado.matched_count == 0:
            return {"error": "Cuidador no encontrado"}
        Logger.add_to_log("info", "FCM token actualizado")
        return {"mensaje": "Token FCM actualizado exitosamente"}
    except Exception as ex:
        Logger.add_to_log("error", f"Error al actualizar FCM token: {ex}")
        return {"error": f"No se pudo actualizar el token: {ex}"}