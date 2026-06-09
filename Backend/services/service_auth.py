from datetime import datetime, timezone
from database.database import get_database
from utils.Logger import Logger


async def revocar_token(jti: str, exp_timestamp: int) -> None:
    if not jti or not exp_timestamp:
        return
    try:
        db = get_database()
        await db["TokensRevocados"].update_one(
            {"jti": jti},
            {"$set": {
                "jti":         jti,
                "exp":         datetime.fromtimestamp(exp_timestamp, tz=timezone.utc),
                "revocado_en": datetime.now(timezone.utc),
            }},
            upsert=True,
        )
        Logger.add_to_log("info", f"Token revocado: {jti}")
    except Exception as ex:
        Logger.add_to_log("error", f"Error revocando token {jti}: {ex}")


async def token_revocado(jti: str) -> bool:
    if not jti:
        return False
    try:
        db = get_database()
        encontrado = await db["TokensRevocados"].find_one({"jti": jti})
        return encontrado is not None
    except Exception as ex:
        Logger.add_to_log("error", f"Error consultando blacklist de tokens: {ex}")
        return False
