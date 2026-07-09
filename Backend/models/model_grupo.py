from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timezone

class GrupoBase(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=100)

class CrearGrupo(GrupoBase):
    cuidador_principal_id: Optional[str] = Field(None, description="Cuidador que crea el grupo")
    paciente_ids: list[str] = Field(default_factory=list)

class RespuestaGrupo(GrupoBase):
    id: str = Field(...)
    cuidador_principal_id: str = Field(...)
    cuidador_ids: list[str] = Field(default_factory=list)
    paciente_ids: list[str] = Field(default_factory=list)
    created_at: datetime = Field(...)

    class Config:
        from_attributes = True

class ActualizarGrupo(BaseModel):
    nombre: Optional[str] = Field(None, min_length=2, max_length=100)

class AgregarCuidador(BaseModel):
    cuidador_id: str = Field(...)

class AgregarPaciente(BaseModel):
    paciente_id: str = Field(...)

class CrearInvitacion(BaseModel):
    expira_horas: Optional[int] = Field(None, ge=1, le=720)

class UbicacionCuidador(BaseModel):
    cuidador_id: Optional[str] = Field(None)
    latitud: float = Field(..., ge=-90.0, le=90.0)
    longitud: float = Field(..., ge=-180.0, le=180.0)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UbicacionFamiliar(BaseModel):
    familiar_id: Optional[str] = Field(None)
    latitud: float = Field(..., ge=-90.0, le=90.0)
    longitud: float = Field(..., ge=-180.0, le=180.0)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))