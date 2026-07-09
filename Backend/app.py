from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from contextlib import asynccontextmanager
import asyncio
import os
import sentry_sdk

from MQTT.subscriber import mqtt_subscriber_task
from database.database import close_database, get_database
from routes.ruta_cliente import router as cuidador_router
from routes.ruta_paciente import router as paciente_router
from routes.ruta_dispositivo import router as dispositivo_router
from routes.ruta_historial import router as historial_router
from routes.ruta_zonasegura import router as zona_segura_router
from routes.ruta_grupo import router as grupo_router
from routes.ruta_alerta import router as alerta_router
from routes.ruta_familiar import router as familiar_router
from routes.ruta_modo_viaje import router as modo_viaje_router
from routes.ruta_admin import router as admin_router
from routes.ruta_reporte import router as reporte_router
from services.service_alerta import reenviar_alertas_activas, verificar_senal_perdida
from utils.Logger import Logger
from security.limiter import limiter

_sentry_dsn = os.getenv("SENTRY_DSN")
if _sentry_dsn:
    sentry_sdk.init(dsn=_sentry_dsn, traces_sample_rate=0.2)



async def tarea_alertas():
    while True:
        await asyncio.sleep(300)  # 5 minutos
        try:
            await reenviar_alertas_activas()
        except asyncio.CancelledError:
            raise
        except Exception as ex:
            Logger.add_to_log("error", f"Excepción en tarea_alertas: {ex}")


async def tarea_watchdog_gps():
    primera_ronda = True
    while True:
        await asyncio.sleep(30)  # cada 30 s
        try:
            if primera_ronda:
                print(
                    "\n ________________________\n"
                    "( Rex en alerta...!       )\n"
                    " ------------------------\n"
                    "       \\\n"
                    "        \\   / \\__\n"
                    "         \\ (    @\\___\n"
                    "          /          O\n"
                    "         /   (_____/\n"
                    "        /_____/   U\n"
                )
                primera_ronda = False
            await verificar_senal_perdida()
        except asyncio.CancelledError:
            raise
        except Exception as ex:
            Logger.add_to_log("error", f"Excepción en tarea_watchdog_gps: {ex}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    db = get_database()
    # TTL: borra tokens revocados automáticamente cuando expira el JWT
    await db["TokensRevocados"].create_index("exp", expireAfterSeconds=0)
    # TTL: borra ubicaciones de cuidadores/familiares si no se actualizan en 15 min
    await db["UbicacionesCuidadores"].create_index("timestamp", expireAfterSeconds=900)
    await db["UbicacionesFamiliares"].create_index("timestamp", expireAfterSeconds=900)
    # TTL: borra invitaciones automáticamente cuando caducan
    await db["Invitaciones"].create_index("expira_en", expireAfterSeconds=0)
    await db["Invitaciones"].create_index("token", unique=True)
    # Índices de consulta frecuente
    await db["Administradores"].create_index("email", unique=True)
    await db["Cuidadores"].create_index("email", unique=True)
    await db["Familiares"].create_index("email", unique=True)
    await db["Dispositivos"].create_index("id_dispositivo", unique=True)
    await db["Pacientes"].create_index("id_cuidador")
    await db["Historial"].create_index([("paciente_id", 1), ("timestamp", -1)])
    await db["Alertas"].create_index([("paciente_id", 1), ("estado", 1)])
    await db["ZonasSeguras"].create_index("paciente_id")

    alertas_task  = asyncio.create_task(tarea_alertas())
    mqtt_task     = asyncio.create_task(mqtt_subscriber_task())
    watchdog_task = asyncio.create_task(tarea_watchdog_gps())

    print(
        "\n  / \\__\n"
        " (    @\\___    ( ¡Rex en linea! Vigilando cada 30s... )\n"
        " /          O  \n"
        "/   (_____/    \n"
        "/_____/   U    \n"
    )

    yield

    print(
        "\n  / \\__\n"
        " (  - -\\___    ( zZz... hasta luego. )\n"
        " /          O  \n"
        "/   (_____/    \n"
        "/_____/   U    \n"
    )

    for task in (alertas_task, mqtt_task, watchdog_task):
        task.cancel()
    for task in (alertas_task, mqtt_task, watchdog_task):
        try:
            await task
        except asyncio.CancelledError:
            pass

    await close_database()


_produccion = os.getenv("ENVIRONMENT") == "production"

app = FastAPI(
    title="UbiLife API",
    description="Backend para el sistema de rastreo GPS de pacientes con Alzheimer",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None  if _produccion else "/docs",
    redoc_url=None if _produccion else "/redoc",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)


_raw_origins = os.getenv("ALLOWED_ORIGINS", "")
_allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()] or ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-XSS-Protection"] = "0"
    return response



@app.exception_handler(StarletteHTTPException)
async def handler_http(request: Request, exc: StarletteHTTPException):
    if exc.status_code == 500:
        Logger.add_to_log("error", f"Error interno [{request.method} {request.url.path}]: {exc.detail}")
        return JSONResponse(status_code=500, content={"detail": "Error interno del servidor"})
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(Exception)
async def handler_excepcion_global(request: Request, exc: Exception):
    Logger.add_to_log("error", f"Excepción no manejada [{request.method} {request.url.path}]: {exc}")
    return JSONResponse(status_code=500, content={"detail": "Error interno del servidor"})


app.include_router(cuidador_router)
app.include_router(paciente_router)
app.include_router(dispositivo_router)
app.include_router(historial_router)
app.include_router(zona_segura_router)
app.include_router(grupo_router)
app.include_router(alerta_router)
app.include_router(familiar_router)
app.include_router(modo_viaje_router)
app.include_router(admin_router)
app.include_router(reporte_router)


@app.get("/")
async def raiz():
    return {"mensaje": "UbiLife API corriendo"}
