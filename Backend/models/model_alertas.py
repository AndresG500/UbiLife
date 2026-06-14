from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class RespuestaAlerta(BaseModel):
    # BUG CORREGIDO: campos ahora coinciden exactamente con lo que guarda service_alerta.py
    id:                      str            = Field(...)
    paciente_id:             str            = Field(...)
    paciente_nombre:         Optional[str]  = Field(None)
    zonasegura_id:           Optional[str]  = Field(None)
    zona_nombre:             Optional[str]  = Field(None)
    tipo:                    str            = Field(...)   # salida_zona_segura | alerta_periodica
    latitud:                 float          = Field(...)
    longitud:                float          = Field(...)
    timestamp:               datetime       = Field(...)
    estado:                  str            = Field(...)   # pendiente | enviada | fallida | resuelta
    mensaje:                 str            = Field(...)
    cuidadores_notificados:  list[str]      = Field(default_factory=list)
    fcm_exitos:              int            = Field(0)
    fcm_fallos:              int            = Field(0)
    ultima_notif:            datetime       = Field(...)

    class Config:
        from_attributes = True


class AtenderAlerta(BaseModel):
    cuidador_id: str = Field(..., description="Cuidador que marca voy en camino")


class RespuestaVelocidad(BaseModel):
    viajando: bool = Field(..., description="True si el paciente viaja con el cuidador, False si es posible robo")