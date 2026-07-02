from typing import Annotated
from fastapi import APIRouter, HTTPException, Depends, Path, Request
from models.model_admin import CrearAdmin, LoginAdmin, CambiarEstadoCuenta
from models.model_reporte import CambiarEstadoReporte
from services import service_admin
from services.service_auth import revocar_token
from security.dependencies import get_admin_actual, oauth2_scheme
from security.jwt_handler import verificar_token
from security.limiter import limiter

MongoId = Annotated[str, Path(pattern=r'^[a-f\d]{24}$')]
router  = APIRouter(prefix="/admin", tags=["Administrador"])


# ─── Auth ─────────────────────────────────────────────────────────────────────

@router.post("/setup", summary="Crear administrador (requiere ADMIN_SETUP_KEY)")
@limiter.limit("3/minute")
async def setup_admin(request: Request, datos: CrearAdmin):
    resultado = await service_admin.crear_admin(datos)
    if "error" in resultado:
        raise HTTPException(status_code=400, detail=resultado["error"])
    return resultado


@router.post("/login")
@limiter.limit("5/minute")
async def login_admin(request: Request, datos: LoginAdmin):
    resultado = await service_admin.verificar_admin(datos.email, datos.password)
    if "error" in resultado:
        raise HTTPException(status_code=401, detail=resultado["error"])
    return resultado


@router.post("/logout")
async def logout_admin(
    token: str = Depends(oauth2_scheme),
    admin_actual = Depends(get_admin_actual),
):
    datos = verificar_token(token)
    if datos:
        await revocar_token(datos.get("jti"), datos.get("exp"))
    return {"mensaje": "Sesión cerrada exitosamente"}


@router.get("/perfil")
async def perfil_admin(admin_actual = Depends(get_admin_actual)):
    return {
        "id":             str(admin_actual["_id"]),
        "nombre":         admin_actual.get("nombre"),
        "email":          admin_actual.get("email"),
        "activo":         admin_actual.get("activo"),
        "fecha_creacion": admin_actual.get("fecha_creacion"),
    }


# ─── Dashboard ────────────────────────────────────────────────────────────────

@router.get("/estadisticas")
async def estadisticas(admin_actual = Depends(get_admin_actual)):
    resultado = await service_admin.obtener_estadisticas()
    if "error" in resultado:
        raise HTTPException(status_code=500, detail=resultado["error"])
    return resultado


# ─── Gestión de cuidadores ────────────────────────────────────────────────────

@router.get("/cuidadores")
async def listar_cuidadores(admin_actual = Depends(get_admin_actual)):
    resultado = await service_admin.listar_cuidadores()
    if isinstance(resultado, dict) and "error" in resultado:
        raise HTTPException(status_code=500, detail=resultado["error"])
    return resultado


@router.patch("/cuidadores/{cuidador_id}/estado")
async def cambiar_estado_cuidador(
    cuidador_id: MongoId,
    datos: CambiarEstadoCuenta,
    admin_actual = Depends(get_admin_actual),
):
    resultado = await service_admin.cambiar_estado_cuidador(cuidador_id, datos.activo)
    if "error" in resultado:
        code = 404 if "no encontrado" in resultado["error"].lower() else 400
        raise HTTPException(status_code=code, detail=resultado["error"])
    return resultado


# ─── Gestión de familiares ────────────────────────────────────────────────────

@router.get("/familiares")
async def listar_familiares(admin_actual = Depends(get_admin_actual)):
    resultado = await service_admin.listar_familiares()
    if isinstance(resultado, dict) and "error" in resultado:
        raise HTTPException(status_code=500, detail=resultado["error"])
    return resultado


@router.patch("/familiares/{familiar_id}/estado")
async def cambiar_estado_familiar(
    familiar_id: MongoId,
    datos: CambiarEstadoCuenta,
    admin_actual = Depends(get_admin_actual),
):
    resultado = await service_admin.cambiar_estado_familiar(familiar_id, datos.activo)
    if "error" in resultado:
        code = 404 if "no encontrado" in resultado["error"].lower() else 400
        raise HTTPException(status_code=code, detail=resultado["error"])
    return resultado


# ─── Gestión de dispositivos ──────────────────────────────────────────────────

@router.get("/dispositivos")
async def listar_dispositivos(admin_actual = Depends(get_admin_actual)):
    resultado = await service_admin.listar_dispositivos_admin()
    if isinstance(resultado, dict) and "error" in resultado:
        raise HTTPException(status_code=500, detail=resultado["error"])
    return resultado


@router.patch("/dispositivos/{id_dispositivo}/bloquear", summary="Bloquear o desbloquear un dispositivo")
async def bloquear_dispositivo(
    id_dispositivo: str,
    admin_actual = Depends(get_admin_actual),
):
    resultado = await service_admin.bloquear_dispositivo(id_dispositivo)
    if "error" in resultado:
        raise HTTPException(status_code=400, detail=resultado["error"])
    return resultado


# ─── Gestión de reportes ──────────────────────────────────────────────────────

@router.get("/reportes")
async def listar_reportes(admin_actual = Depends(get_admin_actual)):
    resultado = await service_admin.listar_reportes_admin()
    if isinstance(resultado, dict) and "error" in resultado:
        raise HTTPException(status_code=500, detail=resultado["error"])
    return resultado


@router.patch("/reportes/{reporte_id}/estado", summary="Cambiar el estado de un reporte")
async def cambiar_estado_reporte(
    reporte_id: MongoId,
    datos: CambiarEstadoReporte,
    admin_actual = Depends(get_admin_actual),
):
    resultado = await service_admin.cambiar_estado_reporte(reporte_id, datos.estado)
    if "error" in resultado:
        code = 404 if "no encontrado" in resultado["error"].lower() else 400
        raise HTTPException(status_code=code, detail=resultado["error"])
    return resultado


@router.delete("/reportes/{reporte_id}", summary="Eliminar un reporte ya solucionado")
async def eliminar_reporte(
    reporte_id: MongoId,
    admin_actual = Depends(get_admin_actual),
):
    resultado = await service_admin.eliminar_reporte(reporte_id)
    if "error" in resultado:
        code = 404 if "no encontrado" in resultado["error"].lower() else 400
        raise HTTPException(status_code=code, detail=resultado["error"])
    return resultado
