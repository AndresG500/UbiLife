import asyncio
import json
import ssl
import aiomqtt
from MQTT.config import settings
from database.database import get_database
from models.model_historial import HistorialUbicacionBase, CoordenadasPaciente
from services.service_historial import registrar_ubicacion
from utils.Logger import Logger
from services.service_alerta import procesar_ubicacion_paciente, resolver_alertas_senal_perdida
from utils.eventos import bus_eventos
from datetime import datetime, timezone


TOPIC_PATRON = "ubilife/dispositivo/+/gps"


async def procesar_mensaje_gps(id_dispositivo: str, payload: dict) -> None:
    lat = payload.get("lat")
    lng = payload.get("lng", payload.get("lon"))

    if lat is None or lng is None:
        Logger.add_to_log("warn", f"Payload sin coordenadas válidas: {payload}")
        return

    db = get_database()

    # ── 1. Dispositivo bloqueado por el admin → ignorar por completo ──────────
    #       Evita que reaparezca en DispositivosDisponibles y detiene el
    #       procesamiento de ubicación/alertas si ya estaba vinculado.
    if await db["DispositivosBloqueados"].find_one({"id_dispositivo": id_dispositivo}):
        return

    # ── 2. Verificar si el dispositivo ya está en la colección principal ──────
    dispositivo = await db["Dispositivos"].find_one({"id_dispositivo": id_dispositivo})

    if not dispositivo:
        # ── 3. No está vinculado aún → anunciarlo en DispositivosDisponibles ──
        #       Usamos upsert para no duplicar si ya estaba anunciado.
        #       Actualizamos dispositivo_detectado para refrescar la ventana de 5 min.
        result = await db["DispositivosDisponibles"].update_one(
            {"id_dispositivo": id_dispositivo},
            {
                "$set": {
                    "id_dispositivo":        id_dispositivo,
                    "dispositivo_detectado": datetime.now(timezone.utc),
                },
                "$setOnInsert": {
                    "created_at": datetime.now(timezone.utc),
                }
            },
            upsert=True,
        )
        if result.upserted_id:
            Logger.add_to_log(
                "info",
                f"Nuevo dispositivo detectado (sin vincular): {id_dispositivo}",
            )
        # No hay paciente asociado todavía → no hay nada más que procesar
        return

    # ── 4. El dispositivo existe en Dispositivos → actualizar última conexión ─
    await db["Dispositivos"].update_one(
        {"id_dispositivo": id_dispositivo},
        {"$set": {"ultima_conexion": datetime.now(timezone.utc)}},
    )

    paciente_id = dispositivo.get("paciente_id")

    # Señal recuperada → resolver alertas de señal perdida pendientes
    if paciente_id:
        try:
            await resolver_alertas_senal_perdida(str(paciente_id))
        except Exception as ex:
            Logger.add_to_log("warn", f"No se pudo resolver alerta señal perdida: {ex}")
    if not paciente_id:
        Logger.add_to_log("warn", f"Dispositivo {id_dispositivo} sin paciente asignado")
        return

    # ── 5. Construir y guardar la ubicación en el historial ───────────────────
    try:
        datos = HistorialUbicacionBase(
            paciente_id=str(paciente_id),
            dispositivo_id=id_dispositivo,
            coordenadas=CoordenadasPaciente(latitud=float(lat), longitud=float(lng)),
        )
    except Exception as ex:
        Logger.add_to_log("error", f"Coordenadas inválidas en payload MQTT: {ex}")
        return

    resultado = await registrar_ubicacion(datos)

    if isinstance(resultado, dict) and "error" in resultado:
        Logger.add_to_log("error", f"Fallo registrando ubicación MQTT: {resultado['error']}")
        return

    Logger.add_to_log(
        "info",
        f"GPS guardado | dispositivo={id_dispositivo} paciente={paciente_id} lat={lat} lng={lng}",
    )

    # ── 6. Evaluar alertas (geocercas + modo viaje + anomalía velocidad) ────────
    try:
        await procesar_ubicacion_paciente(str(paciente_id), float(lat), float(lng))
    except Exception as ex:
        Logger.add_to_log("error", f"Error procesando ubicación paciente: {ex}")

    await bus_eventos.publicar(
        topic=f"ubicacion/{paciente_id}",
        datos={
            "lat": lat,
            "lng": lng,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )


async def manejar_mensaje(message: aiomqtt.Message) -> None:
    topic  = message.topic.value
    partes = topic.split("/")

    if len(partes) != 4 or partes[0] != "ubilife" or partes[3] != "gps":
        Logger.add_to_log("warn", f"Tópico con formato inesperado: {topic}")
        return

    id_dispositivo = partes[2]

    try:
        payload = json.loads(message.payload.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        Logger.add_to_log("error", f"Payload no es JSON válido: {e}")
        return

    await procesar_mensaje_gps(id_dispositivo, payload)


async def mqtt_subscriber_task() -> None:
    tls_context = ssl.create_default_context()
    delay = 5

    while True:
        try:
            Logger.add_to_log("info", "Conectando a MQTT")
            async with aiomqtt.Client(
                hostname=settings.MQTT_HOST,
                port=settings.MQTT_PORT,
                username=settings.MQTT_USER,
                password=settings.MQTT_PASS,
                tls_context=tls_context,
                identifier=settings.mqtt_client_id,
                keepalive=60,
            ) as client:
                await client.subscribe(TOPIC_PATRON)
                Logger.add_to_log("info", f"Suscrito a {TOPIC_PATRON}")
                delay = 5  # reset backoff on successful connection

                async for message in client.messages:
                    try:
                        await manejar_mensaje(message)
                    except Exception as ex:
                        Logger.add_to_log("error", f"Error procesando mensaje MQTT: {ex}")

        except aiomqtt.MqttError as e:
            Logger.add_to_log("warn", f"Conexión MQTT perdida: {e} — reintentando en {delay}s")
            await asyncio.sleep(delay)
            delay = min(delay * 2, 60)
        except asyncio.CancelledError:
            Logger.add_to_log("info", "Tarea MQTT cancelada (shutdown del backend)")
            raise
        except Exception as ex:
            Logger.add_to_log("error", f"Error inesperado en subscriber MQTT: {ex}")
            await asyncio.sleep(delay)
            delay = min(delay * 2, 60)