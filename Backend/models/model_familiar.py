from pydantic import BaseModel, Field, EmailStr
from typing import Optional
from datetime import datetime


class CrearFamiliar(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr = Field(..., max_length=254)
    password: str = Field(..., min_length=8)
    phone: Optional[str] = Field(None, pattern=r"^\+?[0-9]{7,15}$")
    foto: Optional[str] = Field(None, max_length=3_000_000)
    codigo_grupo: Optional[str] = Field(None)

class VerificarFamiliar(BaseModel):
    email: EmailStr = Field(..., max_length=254)
    password: str = Field(...)

class ActualizarFamiliar(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    phone: Optional[str] = Field(None, pattern=r"^\+?[0-9]{7,15}$")
    foto: Optional[str] = Field(None, max_length=3_000_000)

class RespuestaFamiliar(BaseModel):
    id: str = Field(...)
    name: str = Field(...)
    email: str = Field(...)
    phone: Optional[str] = Field(None)
    foto: Optional[str] = Field(None)
    grupo_ids: list[str] = Field(default_factory=list)
    created_at: datetime = Field(...)

    class Config:
        from_attributes = True
