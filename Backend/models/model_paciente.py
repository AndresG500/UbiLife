from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import datetime, timezone
from enum import Enum
from utils.sanitizer import sanitize_string

class GeoPoint(BaseModel):
    latitud: float = Field(..., ge=-90.0, le=90.0)
    longitud: float = Field(..., ge=-180.0, le=180.0)
    recorded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class EstadoDispositivo(str, Enum):
    ONLINE  = "online"
    OFFLINE = "offline"
    UNKNOWN = "unknown"

class PacienteBase(BaseModel):
    nombre_paciente: str = Field(..., min_length=2, max_length=100)
    edad_paciente: Optional[int] = Field(None, ge=0, le=150)
    enfermedad: Optional[str] = Field(None, max_length=500)
    cedula: Optional[str] = Field(None, max_length=20)
    eps: Optional[str] = Field(None, max_length=100)
    familiar_nombre: Optional[str] = Field(None, max_length=100)
    familiar_telefono: Optional[str] = Field(None, max_length=20)
    fuera_de_zona: bool = False
    ultima_alerta_timestamp: Optional[datetime] = None
    modo_viaje_activo: bool = False
    modo_viaje_tipo: Optional[str] = None        # "caminata" | "vehiculo"
    modo_viaje_inicio: Optional[datetime] = None
    modo_viaje_fin: Optional[datetime] = None    # None = indefinido
    modo_viaje_activado_por: Optional[str] = None

    @field_validator('nombre_paciente', 'enfermedad', 'cedula', 'eps', 'familiar_nombre', 'familiar_telefono', mode='before')
    @classmethod
    def sanitize_fields(cls, v):
        if isinstance(v, str):
            return sanitize_string(v)
        return v

class CrearPaciente(PacienteBase):
    id_dispositivo: Optional[str] = Field(None)

class RespuestaPaciente(PacienteBase):
    id_paciente: str = Field(...)
    id_cuidador: str = Field(...)
    id_dispositivo: Optional[str] = Field(None)
    grupo_ids: list[str] = Field(default_factory=list)
    ultima_ubicacion: Optional[GeoPoint] = Field(None)
    estado_dispositivo: Optional[EstadoDispositivo] = Field(None)
    created_at: datetime = Field(...)
    activo: bool = Field(True)

    class Config:
        from_attributes = True

class ActualizarPaciente(BaseModel):
    nombre_paciente: Optional[str] = Field(None, min_length=2, max_length=100)
    edad_paciente: Optional[int] = Field(None, ge=0, le=150)
    enfermedad: Optional[str] = Field(None, max_length=500)
    cedula: Optional[str] = Field(None, max_length=20)
    eps: Optional[str] = Field(None, max_length=100)
    familiar_nombre: Optional[str] = Field(None, max_length=100)
    familiar_telefono: Optional[str] = Field(None, max_length=20)
    id_dispositivo: Optional[str] = Field(None)

class ActivarModoViaje(BaseModel):
    paciente_id: str
    tipo: str = Field(..., pattern="^(caminata|vehiculo)$")
    duracion_horas: Optional[float] = Field(None, gt=0)  # None = indefinido

class ActualizarUbicacion(BaseModel):
    patient_id: str = Field(...)
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    device_id: Optional[str] = Field(None)
    recorded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))