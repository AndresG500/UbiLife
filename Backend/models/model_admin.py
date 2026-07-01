from pydantic import BaseModel, Field, EmailStr, field_validator
from typing import Optional
from datetime import datetime
from utils.sanitizer import sanitize_string


class CrearAdmin(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=100)
    email: EmailStr = Field(..., max_length=254)
    password: str = Field(..., min_length=8)
    setup_key: str = Field(...)

    @field_validator('nombre', mode='before')
    @classmethod
    def sanitize_nombre(cls, v):
        if isinstance(v, str):
            return sanitize_string(v)
        return v


class LoginAdmin(BaseModel):
    email: EmailStr = Field(..., max_length=254)
    password: str = Field(...)


class RespuestaAdmin(BaseModel):
    id: str
    nombre: str
    email: str
    activo: bool
    fecha_creacion: datetime

    class Config:
        from_attributes = True


class CambiarEstadoCuenta(BaseModel):
    activo: bool
