from pydantic import BaseModel, Field, EmailStr, field_validator
from typing import Optional
from datetime import datetime
from utils.sanitizer import sanitize_string


class CuidadorBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr = Field(..., max_length=254)
    phone: Optional[str] = Field(None, pattern=r"^\+?[0-9]{7,15}$")
    foto: Optional[str] = Field(None, max_length=3_000_000)
    fcm_token: Optional[str] = Field(None, max_length=512)

    @field_validator('name', mode='before')
    @classmethod
    def sanitize_name(cls, v):
        if isinstance(v, str):
            return sanitize_string(v)
        return v

class CrearCuidador(CuidadorBase):
    password: str = Field(..., min_length=8)

class RespuestaCuidador(CuidadorBase):
    id: str = Field(...)
    grupo_ids: list[str] = Field(default_factory=list)
    fecha_creacion: datetime = Field(...)
    activo: bool = Field(True)

    class Config:
        from_attributes = True

class ActualizarCuidador(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    phone: Optional[str] = Field(None, pattern=r"^\+?[0-9]{7,15}$")
    foto: Optional[str] = Field(None, max_length=3_000_000)
    password: Optional[str] = Field(None, min_length=8)

class VerificarCuidador(BaseModel):
    email: EmailStr = Field(..., max_length=254)
    password: str = Field(...)