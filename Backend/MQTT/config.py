"""
Configuración global del proyecto UbiLife.
 
Lee variables de entorno desde el archivo `.env` ubicado en la raíz
del directorio `Backend/`. Usa pydantic-settings para validación.
"""
 
from pydantic_settings import BaseSettings, SettingsConfigDict
 
 
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
    MQTT_CLIENT_ID: str = "ubilife-backend"
 
 
settings = Settings()