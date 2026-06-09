from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import os
import ssl
from utils.Logger import Logger

load_dotenv()

_client = None
_db = None


def _tls_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def get_database():
    global _client, _db
    
    if _db is not None:
        return _db
    
    try:
        uri = os.getenv("MONGO_URI")
        _client = AsyncIOMotorClient(
            uri,
            tls=True,
            ssl_context=_tls_context(),
        )
        _db = _client["UbiLife"]
        Logger.add_to_log("info", "Conexión a MongoDB establecida")
        return _db

    except Exception as ex:
        Logger.add_to_log("error", f"Error al conectar a MongoDB: {ex}")
        raise ConnectionError(f"No se pudo conectar a MongoDB: {ex}")


async def close_database():
    global _client, _db
    
    if _client is not None:
        _client.close()
        _client = None
        _db = None
        Logger.add_to_log("info", "Conexión a MongoDB cerrada")


def is_connected() -> bool:
    return _db is not None


conexion_database = get_database