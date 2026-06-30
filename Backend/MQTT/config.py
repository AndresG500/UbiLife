"""
Configuración global del proyecto UbiLife.
 
Lee variables de entorno desde el archivo `.env` ubicado en la raíz
del directorio `Backend/`. Usa pydantic-settings para validación.
"""
 
import socket
import uuid

from pydantic_settings import BaseSettings, SettingsConfigDict

_default_client_id = f"ubilife-{socket.gethostname()}-{uuid.uuid4().hex[:8]}"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # MongoDB
    MONGODB_URL: str = "mongodb://localhost:27017"
    DATABASE_NAME: str = "ubilife"

    # MQTT (HiveMQ Cloud)
    MQTT_HOST: str
    MQTT_PORT: int = 8883
    MQTT_USER: str
    MQTT_PASS: str
    MQTT_CLIENT_ID: str = ""

    @property
    def mqtt_client_id(self) -> str:
        return self.MQTT_CLIENT_ID.strip() or _default_client_id
 
 
settings = Settings()