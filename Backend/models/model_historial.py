from pydantic import BaseModel, Field
from datetime import datetime

class CoordenadasPaciente(BaseModel):
    latitud: float = Field(..., ge=-90, le=90, description="Latitud de la ubicación del paciente")
    longitud: float = Field(..., ge=-180, le=180, description="Longitud de la ubicación del paciente")

class HistorialUbicacionBase(BaseModel):
    paciente_id: str = Field(..., description="ID del paciente asociado")
    dispositivo_id: str = Field(..., description="ID del dispositivo asociado")
    coordenadas: CoordenadasPaciente = Field(..., description="Coordenadas capturadas")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Momento de la captura")

class RespuestaHistorialUbicacion(HistorialUbicacionBase):
    id: str = Field(..., description="ID del historial de ubicación")

    class Config:
        from_attributes = True

class UltimaUbicacion(BaseModel):
    paciente_id: str = Field(..., description="ID del paciente")
    coordenadas: CoordenadasPaciente = Field(..., description="Última coordenada registrada")
    timestamp: datetime = Field(..., description="Cuándo fue registrada")