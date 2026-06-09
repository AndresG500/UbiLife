from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class DispositivoBase(BaseModel):
    id_dispositivo: str
    paciente_id: str
    estado: bool = False  # False por defecto, True cuando el ESP32 se anuncie

class LocalizacionDispositivo(BaseModel):
    latitud: float = Field(..., ge=-90.0, le=90.0)
    longitud: float = Field(..., ge=-180.0, le=180.0)
    altitud: Optional[float] = None
    satellites: Optional[int] = None  # Calidad del fix GPS del BZ-251
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class CrearDispositivo(DispositivoBase):
    pass

class ActualizarDispositivo(BaseModel):
    estado: Optional[bool] = None
    ultima_localizacion: Optional[LocalizacionDispositivo] = None
    ultima_conexion: Optional[datetime] = None
    nivel_bateria: Optional[int] = Field(None, ge=0, le=100)

class DispositivoDisponible(BaseModel):
    id_dispositivo: str
    dispositivo_detectado: datetime = Field(default_factory=datetime.utcnow)

class VincularDispositivo(BaseModel):
    id_dispositivo: str
    paciente_id: str

class RegistroDispositivoBase(BaseModel):
    id: Optional[str] = Field(None, alias="_id")  # _id de MongoDB
    id_dispositivo: str
    paciente_id: str
    estado: bool
    ultima_localizacion: Optional[LocalizacionDispositivo] = None
    ultima_conexion: Optional[datetime] = None
    nivel_bateria: Optional[int] = Field(None, ge=0, le=100)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        from_attributes = True
        populate_by_name = True  # Necesario para que el alias "_id" funcione