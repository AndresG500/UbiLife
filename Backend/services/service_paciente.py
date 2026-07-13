from database.database import get_database  # ← corregido
from models.model_paciente import CrearPaciente, ActualizarPaciente
from bson import ObjectId
from datetime import datetime, timezone
from utils.Logger import Logger
from utils.sanitizer import sanitize_string
import os
from cryptography.fernet import Fernet

_FERNET_KEY = os.environ.get("FERNET_KEY", "")
_fernet = Fernet(_FERNET_KEY.encode()) if _FERNET_KEY else None

def cifrar(valor: str) -> str:
    if not _fernet:
        return sanitize_string(valor, 500)
    return _fernet.encrypt(valor.encode()).decode()

def descifrar(valor: str) -> str:
    if not _fernet:
        return valor
    try:
        return _fernet.decrypt(valor.encode()).decode()
    except Exception:
        return valor  # valor antiguo sin cifrar, lo devuelve tal cual

_CAMPOS_CIFRADOS = ("cedula", "enfermedad", "familiar_telefono")


async def registrar_paciente(datos: CrearPaciente, cuidador_email: str):  # ← recibe email del token
    try:
        db             = get_database()
        coleccion      = db["Pacientes"]
        col_cuidadores = db["Cuidadores"]

        cuidador = await col_cuidadores.find_one({"email": cuidador_email})  # ← busca por email
        if not cuidador:
            Logger.add_to_log("warn", "Cuidador no encontrado")
            return {"mensaje": "No se encontró el cuidador especificado"}

        resultado = await coleccion.insert_one({
            "nombre_paciente":    sanitize_string(datos.nombre_paciente, 100),
            "edad_paciente":      datos.edad_paciente,
            "enfermedad":         cifrar(datos.enfermedad) if datos.enfermedad else None,
            "cedula":             cifrar(datos.cedula) if datos.cedula else None,
            "eps":                sanitize_string(datos.eps, 100) if datos.eps else datos.eps,
            "familiar_nombre":    sanitize_string(datos.familiar_nombre, 100) if datos.familiar_nombre else datos.familiar_nombre,
            "familiar_telefono":  cifrar(datos.familiar_telefono) if datos.familiar_telefono else None,
            "id_cuidador":        str(cuidador["_id"]),
            "id_dispositivo":     datos.id_dispositivo,
            "foto":               datos.foto,
            "fuera_de_zona":       False,
            "ultima_alerta_timestamp": None,
            "ultima_ubicacion":   None,
            "ultima_señal":       None,
            "estado_dispositivo": None,
            "created_at":         datetime.now(timezone.utc),
            "activo":             True
        })

        await col_cuidadores.update_one(
            {"_id": cuidador["_id"]},
            {"$push": {"patient_ids": str(resultado.inserted_id)}}
        )

        Logger.add_to_log("info", "Paciente registrado")
        return {"mensaje": "Paciente registrado exitosamente", "id_paciente": str(resultado.inserted_id)}

    except Exception as ex:
        Logger.add_to_log("error", f"Error al registrar paciente: {ex}")
        return {"error": f"No se pudo registrar el paciente: {ex}"}


async def obtener_paciente(patient_id: str, cuidador_email: str):
    try:
        db             = get_database()
        coleccion      = db["Pacientes"]
        col_cuidadores = db["Cuidadores"]

        cuidador = await col_cuidadores.find_one({"email": cuidador_email})
        if not cuidador:
            return {"error": "Cuidador no encontrado"}

        paciente = await coleccion.find_one({"_id": ObjectId(patient_id)})
        if not paciente:
            return {"mensaje": "No se encontró el paciente"}

        if str(paciente.get("id_cuidador")) != str(cuidador["_id"]):
            return {"error": "No tienes permiso para ver este paciente"}

        paciente["_id"] = str(paciente["_id"])
        for campo in _CAMPOS_CIFRADOS:
            if paciente.get(campo):
                paciente[campo] = descifrar(paciente[campo])
        return paciente

    except Exception as ex:
        Logger.add_to_log("error", f"Error al obtener paciente: {ex}")
        return {"error": f"No se pudo obtener el paciente: {ex}"}


async def borrar_paciente(patient_id: str, cuidador_email: str):
    try:
        db             = get_database()
        coleccion      = db["Pacientes"]
        col_cuidadores = db["Cuidadores"]

        cuidador = await col_cuidadores.find_one({"email": cuidador_email})
        if not cuidador:
            return {"error": "Cuidador no encontrado"}

        paciente = await coleccion.find_one({"_id": ObjectId(patient_id)})
        if not paciente:
            return {"mensaje": "No se encontró el paciente"}

        if str(paciente.get("id_cuidador")) != str(cuidador["_id"]):
            Logger.add_to_log("warn", f"Eliminación no autorizada: paciente {patient_id}")
            return {"error": "No tienes permiso para eliminar este paciente"}

        await coleccion.delete_one({"_id": ObjectId(patient_id)})
        await col_cuidadores.update_one(
            {"_id": cuidador["_id"]},
            {"$pull": {"patient_ids": patient_id}}
        )

        Logger.add_to_log("info", f"Paciente eliminado: {patient_id}")
        return {"mensaje": "Paciente eliminado exitosamente"}

    except Exception as ex:
        Logger.add_to_log("error", f"Error al eliminar paciente: {ex}")
        return {"error": f"No se pudo eliminar el paciente: {ex}"}


async def actualizar_paciente(patient_id: str, datos: ActualizarPaciente, cuidador_email: str):
    try:
        db             = get_database()
        coleccion      = db["Pacientes"]
        col_cuidadores = db["Cuidadores"]

        cuidador = await col_cuidadores.find_one({"email": cuidador_email})
        if not cuidador:
            return {"error": "Cuidador no encontrado"}

        paciente = await coleccion.find_one({"_id": ObjectId(patient_id)})
        if not paciente:
            return {"mensaje": "No se encontró el paciente"}

        if str(paciente.get("id_cuidador")) != str(cuidador["_id"]):
            Logger.add_to_log("warn", f"Actualización no autorizada: paciente {patient_id}")
            return {"error": "No tienes permiso para actualizar este paciente"}

        campos = {}
        if datos.nombre_paciente:
            campos["nombre_paciente"] = sanitize_string(datos.nombre_paciente, 100)
        if datos.edad_paciente is not None:
            campos["edad_paciente"] = datos.edad_paciente
        if datos.enfermedad is not None:
            campos["enfermedad"] = cifrar(datos.enfermedad)
        if datos.cedula is not None:
            campos["cedula"] = cifrar(datos.cedula)
        if datos.eps is not None:
            campos["eps"] = sanitize_string(datos.eps, 100)
        if datos.familiar_nombre is not None:
            campos["familiar_nombre"] = sanitize_string(datos.familiar_nombre, 100)
        if datos.familiar_telefono is not None:
            campos["familiar_telefono"] = cifrar(datos.familiar_telefono)
        if datos.id_dispositivo:
            campos["id_dispositivo"] = datos.id_dispositivo
        if datos.foto is not None:
            campos["foto"] = datos.foto

        if not campos:
            return {"mensaje": "No se proporcionaron campos para actualizar"}

        await coleccion.update_one({"_id": ObjectId(patient_id)}, {"$set": campos})
        Logger.add_to_log("info", f"Paciente actualizado: {patient_id}")
        return {"mensaje": "Paciente actualizado exitosamente"}

    except Exception as ex:
        Logger.add_to_log("error", f"Error al actualizar paciente: {ex}")
        return {"error": f"No se pudo actualizar el paciente: {ex}"}


async def listar_pacientes(cuidador_email: str):
    try:
        db             = get_database()
        col_cuidadores = db["Cuidadores"]
        col_pacientes  = db["Pacientes"]

        cuidador = await col_cuidadores.find_one({"email": cuidador_email})
        if not cuidador:
            return {"error": "Cuidador no encontrado"}

        cursor = col_pacientes.find({"id_cuidador": str(cuidador["_id"])})

        pacientes = []
        async for paciente in cursor:
            paciente["id_paciente"] = str(paciente["_id"])
            del paciente["_id"]
            for campo in _CAMPOS_CIFRADOS:
                if paciente.get(campo):
                    paciente[campo] = descifrar(paciente[campo])
            pacientes.append(paciente)

        Logger.add_to_log("info", "Pacientes listados para cuidador")
        return pacientes

    except Exception as ex:
        Logger.add_to_log("error", f"Error al listar pacientes: {ex}")
        return {"error": f"No se pudieron listar los pacientes: {ex}"}