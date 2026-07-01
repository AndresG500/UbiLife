from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional, Literal
from utils.sanitizer import sanitize_string


class CrearReporte(BaseModel):
    descripcion: str = Field(..., min_length=10, max_length=500)
    relacionado_dispositivo: bool = False
    paciente_id: Optional[str] = None

    @field_validator('descripcion', mode='before')
    @classmethod
    def sanitize_descripcion(cls, v):
        if isinstance(v, str):
            return sanitize_string(v, max_length=500)
        return v

    @model_validator(mode='after')
    def exigir_paciente_si_es_dispositivo(self):
        if self.relacionado_dispositivo and not self.paciente_id:
            raise ValueError("Debes indicar el paciente para reportar un problema de dispositivo")
        return self


class CambiarEstadoReporte(BaseModel):
    estado: Literal["recibido", "en_revision", "solucionado"]
