from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import os
from utils.Logger import Logger

load_dotenv()

_client = None
_db = None


def get_database():
    global _client, _db
    
    if _db is not None:
        return _db
    
    try:
        uri = os.getenv("MONGO_URI")
        db_name = os.getenv("DATABASE_NAME", "UbiLife")
        _client = AsyncIOMotorClient(uri)
        _db = _client[db_name]
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