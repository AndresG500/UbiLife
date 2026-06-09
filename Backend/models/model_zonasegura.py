from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class CentroZona(BaseModel):
    latitud: float = Field(..., ge=-90, le=90, description="Latitud del centro de la zona")
    longitud: float = Field(..., ge=-180, le=180, description="Longitud del centro de la zona")

class ZonaSeguraBase(BaseModel):
    paciente_id: str = Field(..., description="ID del paciente al que pertenece la zona")
    cuidador_id: str = Field(..., description="ID del cuidador que creó la zona")
    nombre: str = Field(..., min_length=2, max_length=100, description="Nombre de la zona segura")
    centro: CentroZona = Field(..., description="Coordenadas del centro de la zona")
    radio_metros: float = Field(..., ge=10, le=500, description="Radio de la zona en metros")
    activa: bool = Field(True, description="Indica si la zona está activa")

class CrearZonaSegura(BaseModel):
    paciente_id:  str            = Field(..., description="ID del paciente al que pertenece la zona")
    nombre:       str            = Field(..., min_length=2, max_length=100, description="Nombre de la zona segura")
    centro:       CentroZona     = Field(..., description="Coordenadas del centro de la zona")
    radio_metros: float          = Field(..., ge=50, le=500, description="Radio de la zona en metros")
    activa:       bool           = Field(True, description="Indica si la zona está activa")
    cuidador_id:  Optional[str]  = Field(None, description="ID del cuidador que creó la zona")

class ActualizarZonaSegura(BaseModel):
    nombre: Optional[str] = Field(None, min_length=2, max_length=100, description="Nuevo nombre de la zona")
    centro: Optional[CentroZona] = Field(None, description="Nuevo centro de la zona")
    radio_metros: Optional[float] = Field(None, ge=10, le=500, description="Nuevo radio de la zona")
    activa: Optional[bool] = Field(None, description="Estado de la zona")

class RespuestaZonaSegura(ZonaSeguraBase):
    id: str = Field(..., description="ID de la zona segura")
    created_at: datetime = Field(..., description="Fecha de creación de la zona")

    class Config:
        from_attributes = True