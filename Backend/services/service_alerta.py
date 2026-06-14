from datetime import datetime, timedelta, timezone
from typing import Optional
from bson import ObjectId
from FCM.client import enviar_notificacion_multicast
from utilidades.geo import distancia_metros
from utilidades.mongo_utils import to_object_id, to_str_id
from database.database import get_database
from utils.Logger import Logger

COOLDOWN_ALERTA_SEGUNDOS    = 300   # 5 minutos entre alertas de zona
COOLDOWN_VELOCIDAD_SEGUNDOS = 120   # 2 minutos entre notificaciones de anomalía
VELOCIDAD_ANOMALIA_KMH      = 40.0  # umbral km/h

UMBRAL_SENAL_PERDIDA_S   = 60    # segundos sin datos → GPS offline
VENTANA_DISPOSITIVO_S    = 300   # dispositivo debe haber tenido señal en los últimos 5 min
COOLDOWN_SENAL_PERDIDA_S = 300   # 5 min entre alertas de señal perdida
RADIO_PROXIMIDAD_METROS  = 50    # radio para considerar que alguien está "cerca"
VENTANA_ZONA_MUERTA_S    = 180   # ambos perdieron señal en un margen de 3 min → zona muerta


# ─────────────────────────────────────────────────────────────────────
# EVALUACIÓN DE GEOCERCAS
# ─────────────────────────────────────────────────────────────────────

async def evaluar_zonas_seguras(paciente_id, lat: float, lng: float) -> None:
    # BUG CORREGIDO: colecciones obtenidas dentro de la función (no al importar el módulo)
    db = get_database()
    coleccion_zonas_seguras = db["ZonasSeguras"]
    coleccion_pacientes     = db["Pacientes"]

    if isinstance(paciente_id, ObjectId):
        paciente_id_str = str(paciente_id)
    else:
        paciente_id_str = str(paciente_id)

    todas_zonas = await coleccion_zonas_seguras.find({
        "paciente_id": paciente_id_str,
    }).to_list(length=None)

    if not todas_zonas:
        return

    # Auto-activar zonas inactivas cuando el paciente entra por primera vez
    for zona in todas_zonas:
        if not zona.get("activa", False):
            d = distancia_metros(lat, lng, zona["centro"]["latitud"], zona["centro"]["longitud"])
            if d <= zona["radio_metros"]:
                await coleccion_zonas_seguras.update_one(
                    {"_id": zona["_id"]},
                    {"$set": {"activa": True}},
                )
                zona["activa"] = True
                Logger.add_to_log("info", f"Zona '{zona['nombre']}' auto-activada | paciente={paciente_id_str}")

    # Solo las zonas activas generan alertas
    zonas = [z for z in todas_zonas if z.get("activa", False)]
    if not zonas:
        return

    dentro_de_alguna = False
    zona_mas_cercana = None
    distancia_minima = float("inf")

    for zona in zonas:
        d = distancia_metros(
            lat, lng,
            zona["centro"]["latitud"],
            zona["centro"]["longitud"],
        )
        if d <= zona["radio_metros"]:
            dentro_de_alguna = True
            break
        if d < distancia_minima:
            distancia_minima = d
            zona_mas_cercana = zona

    try:
        paciente = await coleccion_pacientes.find_one({"_id": ObjectId(paciente_id_str)})
    except Exception:
        paciente = await coleccion_pacientes.find_one({"_id": paciente_id_str})

    if not paciente:
        Logger.add_to_log("warn", f"Paciente {paciente_id_str} no encontrado al evaluar zonas")
        return

    estaba_fuera  = paciente.get("fuera_de_zona", False)
    ultima_alerta = paciente.get("ultima_alerta_timestamp")
    ahora         = datetime.now(timezone.utc)

    if dentro_de_alguna:
        if estaba_fuera:
            try:
                await coleccion_pacientes.update_one(
                    {"_id": ObjectId(paciente_id_str)},
                    {"$set": {"fuera_de_zona": False}},
                )
            except Exception:
                await coleccion_pacientes.update_one(
                    {"_id": paciente_id_str},
                    {"$set": {"fuera_de_zona": False}},
                )
            Logger.add_to_log("info", f"Paciente {paciente_id_str} volvió a zona segura")
        return

    if not estaba_fuera:
        await crear_y_despachar_alerta(
            paciente=paciente,
            zona_mas_cercana=zona_mas_cercana,
            lat=lat,
            lng=lng,
            tipo="salida_zona_segura",
            distancia=distancia_minima,
        )
        try:
            await coleccion_pacientes.update_one(
                {"_id": ObjectId(paciente_id_str)},
                {"$set": {"fuera_de_zona": True, "ultima_alerta_timestamp": ahora}},
            )
        except Exception:
            await coleccion_pacientes.update_one(
                {"_id": paciente_id_str},
                {"$set": {"fuera_de_zona": True, "ultima_alerta_timestamp": ahora}},
            )
        return

    if ultima_alerta is not None and ultima_alerta.tzinfo is None:
        ultima_alerta = ultima_alerta.replace(tzinfo=timezone.utc)

    if (ultima_alerta is None or
            (ahora - ultima_alerta).total_seconds() >= COOLDOWN_ALERTA_SEGUNDOS):
        await crear_y_despachar_alerta(
            paciente=paciente,
            zona_mas_cercana=zona_mas_cercana,
            lat=lat,
            lng=lng,
            tipo="alerta_periodica",
            distancia=distancia_minima,
        )
        try:
            await coleccion_pacientes.update_one(
                {"_id": ObjectId(paciente_id_str)},
                {"$set": {"ultima_alerta_timestamp": ahora}},
            )
        except Exception:
            await coleccion_pacientes.update_one(
                {"_id": paciente_id_str},
                {"$set": {"ultima_alerta_timestamp": ahora}},
            )


# ─────────────────────────────────────────────────────────────────────
# DETECCIÓN DE ANOMALÍA DE VELOCIDAD
# ─────────────────────────────────────────────────────────────────────

async def _actualizar_flag_zona(paciente_id_str: str, lat: float, lng: float) -> None:
    """Actualiza fuera_de_zona sin enviar alertas. Se usa durante modo viaje."""
    db = get_database()
    todas_zonas = await db["ZonasSeguras"].find({"paciente_id": paciente_id_str}).to_list(length=None)
    if not todas_zonas:
        return
    for zona in todas_zonas:
        if not zona.get("activa", False):
            d = distancia_metros(lat, lng, zona["centro"]["latitud"], zona["centro"]["longitud"])
            if d <= zona["radio_metros"]:
                await db["ZonasSeguras"].update_one({"_id": zona["_id"]}, {"$set": {"activa": True}})
                zona["activa"] = True
    zonas = [z for z in todas_zonas if z.get("activa", False)]
    if not zonas:
        return
    dentro = any(
        distancia_metros(lat, lng, z["centro"]["latitud"], z["centro"]["longitud"]) <= z["radio_metros"]
        for z in zonas
    )
    try:
        await db["Pacientes"].update_one(
            {"_id": ObjectId(paciente_id_str)},
            {"$set": {"fuera_de_zona": not dentro}},
        )
    except Exception:
        await db["Pacientes"].update_one(
            {"_id": paciente_id_str},
            {"$set": {"fuera_de_zona": not dentro}},
        )


async def detectar_anomalia_velocidad(paciente: dict, lat: float, lng: float) -> None:
    db = get_database()
    paciente_id_str = str(paciente["_id"])
    ahora = datetime.now(timezone.utc)

    # Recargar desde DB para evitar race condition con mensajes MQTT concurrentes
    doc_fresco = await db["Pacientes"].find_one(
        {"_id": paciente["_id"]},
        {"ultima_alerta_velocidad_timestamp": 1},
    )
    ultima_alerta_vel = doc_fresco.get("ultima_alerta_velocidad_timestamp") if doc_fresco else None
    if ultima_alerta_vel is not None:
        if ultima_alerta_vel.tzinfo is None:
            ultima_alerta_vel = ultima_alerta_vel.replace(tzinfo=timezone.utc)
        if (ahora - ultima_alerta_vel).total_seconds() < COOLDOWN_VELOCIDAD_SEGUNDOS:
            return

    # Obtener los 2 últimos puntos del historial para calcular velocidad
    puntos = await db["Historial"].find(
        {"paciente_id": paciente_id_str}
    ).sort("timestamp", -1).limit(2).to_list(length=2)

    if len(puntos) < 2:
        return

    punto_anterior = puntos[1]
    prev_lat = punto_anterior["coordenadas"]["latitud"]
    prev_lng = punto_anterior["coordenadas"]["longitud"]
    prev_ts  = punto_anterior["timestamp"]

    if prev_ts.tzinfo is None:
        prev_ts = prev_ts.replace(tzinfo=timezone.utc)

    curr_ts = puntos[0].get("timestamp", ahora)
    if curr_ts.tzinfo is None:
        curr_ts = curr_ts.replace(tzinfo=timezone.utc)

    tiempo_s = (curr_ts - prev_ts).total_seconds()
    if tiempo_s <= 0:
        return

    distancia_m  = distancia_metros(prev_lat, prev_lng, lat, lng)
    velocidad_kmh = (distancia_m / 1000.0) / (tiempo_s / 3600.0)

    if velocidad_kmh < VELOCIDAD_ANOMALIA_KMH:
        return

    Logger.add_to_log("info", f"Anomalía velocidad | paciente={paciente_id_str} velocidad={velocidad_kmh:.1f} km/h")

    await crear_y_despachar_alerta(
        paciente=paciente,
        zona_mas_cercana=None,
        lat=lat,
        lng=lng,
        tipo="anomalia_velocidad",
        distancia=0.0,
    )

    try:
        await db["Pacientes"].update_one(
            {"_id": ObjectId(paciente_id_str)},
            {"$set": {"ultima_alerta_velocidad_timestamp": ahora}},
        )
    except Exception:
        await db["Pacientes"].update_one(
            {"_id": paciente_id_str},
            {"$set": {"ultima_alerta_velocidad_timestamp": ahora}},
        )


# ─────────────────────────────────────────────────────────────────────
# ORQUESTADOR PRINCIPAL (llamado desde MQTT subscriber)
# ─────────────────────────────────────────────────────────────────────

async def procesar_ubicacion_paciente(paciente_id: str, lat: float, lng: float) -> None:
    from services.service_modo_viaje import _auto_expirar_modo_viaje

    db = get_database()
    try:
        paciente = await db["Pacientes"].find_one({"_id": ObjectId(paciente_id)})
    except Exception:
        paciente = await db["Pacientes"].find_one({"_id": paciente_id})

    if not paciente:
        Logger.add_to_log("warn", f"Paciente {paciente_id} no encontrado en procesar_ubicacion_paciente")
        return

    # Verificar y expirar modo viaje si corresponde
    modo_activo = await _auto_expirar_modo_viaje(paciente)

    if not modo_activo:
        # Sin modo viaje → evaluación normal de zonas + anomalía de velocidad
        await evaluar_zonas_seguras(paciente_id, lat, lng)
        await detectar_anomalia_velocidad(paciente, lat, lng)
        return

    tipo_viaje = paciente.get("modo_viaje_tipo")

    if tipo_viaje == "vehiculo":
        # Modo vehículo → suprimir alertas, pero mantener fuera_de_zona actualizado
        Logger.add_to_log("info", f"Modo viaje vehículo activo | paciente={paciente_id} — alertas suprimidas")
        await _actualizar_flag_zona(paciente_id, lat, lng)
        return

    # Modo caminata → suprimir alertas de zona, mantener flag y detectar velocidad
    Logger.add_to_log("info", f"Modo viaje caminata activo | paciente={paciente_id} — verificando velocidad")
    await _actualizar_flag_zona(paciente_id, lat, lng)
    await detectar_anomalia_velocidad(paciente, lat, lng)


# ─────────────────────────────────────────────────────────────────────
# CREACIÓN Y DESPACHO DE ALERTAS
# ─────────────────────────────────────────────────────────────────────

async def crear_y_despachar_alerta(
    paciente: dict,
    zona_mas_cercana: Optional[dict],
    lat: float,
    lng: float,
    tipo: str,
    distancia: float,
) -> None:
    # BUG CORREGIDO: colecciones obtenidas dentro de la función
    db = get_database()
    coleccion_alertas    = db["Alertas"]
    coleccion_grupos     = db["Grupos"]
    coleccion_cuidadores = db["Cuidadores"]

    paciente_id = paciente["_id"]
    if isinstance(paciente_id, ObjectId):
        paciente_id_str = str(paciente_id)
    else:
        paciente_id_str = str(paciente_id)

    # BUG CORREGIDO: usa nombre_paciente (campo real del modelo)
    nombre_paciente = paciente.get("nombre_paciente", "El paciente")

    if tipo == "salida_zona_segura":
        titulo = "⚠️ Alerta UbiLife"
        cuerpo = f"{nombre_paciente} ha salido de su zona segura"
    elif tipo == "anomalia_velocidad":
        titulo = f"⚠️ Movimiento inusual — {nombre_paciente}"
        cuerpo = f"{nombre_paciente} se mueve a alta velocidad sin modo viaje activo. ¿Está con usted?"
    else:
        titulo = f"⚠️ {nombre_paciente} sigue fuera de zona"
        cuerpo = f"Está a aproximadamente {int(distancia)} metros de la zona más cercana"

    ahora = datetime.now(timezone.utc)

    # BUG CORREGIDO: incluye paciente_nombre y zona_nombre para que el frontend pueda mostrarlos
    alerta_doc = {
        "paciente_id":             paciente_id_str,
        "paciente_nombre":         nombre_paciente,
        "zonasegura_id":           zona_mas_cercana["_id"] if zona_mas_cercana else None,
        "zona_nombre":             zona_mas_cercana.get("nombre") if zona_mas_cercana else None,
        "tipo":                    tipo,
        "latitud":                 lat,
        "longitud":                lng,
        "timestamp":               ahora,
        "estado":                  "pendiente",
        "mensaje":                 cuerpo,
        "cuidadores_notificados":  [],
        "fcm_exitos":              0,
        "fcm_fallos":              0,
        "ultima_notif":            ahora,
    }
    result    = await coleccion_alertas.insert_one(alerta_doc)
    alerta_id = result.inserted_id

    # BUG CORREGIDO: usa paciente_ids (array) en vez de paciente_id (singular)
    grupos = await coleccion_grupos.find({"paciente_ids": paciente_id_str}).to_list(length=None)
    if not grupos:
        Logger.add_to_log("warn", f"Paciente {paciente_id_str} sin cuidadores asignados")
        await coleccion_alertas.update_one(
            {"_id": alerta_id}, {"$set": {"estado": "fallida"}}
        )
        return

    cuidador_ids = []
    for g in grupos:
        # BUG CORREGIDO: usa cuidador_ids (array) en vez de cuidador_id (singular)
        cuidador_ids.extend(g.get("cuidador_ids", []))

    cuidador_ids_unicos = list(set(cuidador_ids))

    cuidadores = await coleccion_cuidadores.find(
        {"_id": {"$in": [
            ObjectId(cid) if isinstance(cid, str) and len(cid) == 24 else cid
            for cid in cuidador_ids_unicos
        ]}}
    ).to_list(length=None)

    tokens = []
    cuidador_ids_con_token = []
    for c in cuidadores:
        token = c.get("fcm_token")
        if token:
            tokens.append(token)
            cuidador_ids_con_token.append(to_str_id(c["_id"]))

    # También notificar a familiares del grupo
    familiar_ids_unicos = list({fid for g in grupos for fid in g.get("familiar_ids", [])})
    if familiar_ids_unicos:
        familiares = await db["Familiares"].find(
            {"_id": {"$in": [ObjectId(fid) for fid in familiar_ids_unicos if isinstance(fid, str) and len(fid) == 24]}}
        ).to_list(length=None)
        for f in familiares:
            token = f.get("fcm_token")
            if token:
                tokens.append(token)

    if not tokens:
        Logger.add_to_log("warn", f"Ningún cuidador ni familiar del paciente {paciente_id_str} tiene fcm_token registrado")
        await coleccion_alertas.update_one(
            {"_id": alerta_id}, {"$set": {"estado": "fallida"}}
        )
        return

    resultado = await enviar_notificacion_multicast(
        tokens=tokens,
        titulo=titulo,
        cuerpo=cuerpo,
        data={
            "tipo":        tipo,
            "alerta_id":   str(alerta_id),
            "paciente_id": paciente_id_str,
            "lat":         lat,
            "lng":         lng,
        },
    )

    estado_final = "enviada" if resultado["exitos"] > 0 else "fallida"
    await coleccion_alertas.update_one(
        {"_id": alerta_id},
        {"$set": {
            "estado":                 estado_final,
            "cuidadores_notificados": cuidador_ids_con_token,
            "fcm_exitos":             resultado["exitos"],
            "fcm_fallos":             resultado["fallos"],
        }},
    )

    Logger.add_to_log("info", f"Alerta {alerta_id} | tipo={tipo} | paciente={paciente_id_str} | destinatarios={len(tokens)} | FCM exitos={resultado['exitos']} fallos={resultado['fallos']}")

    if resultado["tokens_invalidos"]:
        await coleccion_cuidadores.update_many(
            {"fcm_token": {"$in": resultado["tokens_invalidos"]}},
            {"$unset": {"fcm_token": ""}},
        )
        await db["Familiares"].update_many(
            {"fcm_token": {"$in": resultado["tokens_invalidos"]}},
            {"$unset": {"fcm_token": ""}},
        )
        Logger.add_to_log("info", f"Limpiados {len(resultado['tokens_invalidos'])} tokens FCM inválidos")


# ─────────────────────────────────────────────────────────────────────
# OPERACIONES PARA EL ROUTER HTTP
# ─────────────────────────────────────────────────────────────────────

async def listar_alertas_familiar(familiar_id: str) -> list[dict]:
    db = get_database()
    grupos = await db["Grupos"].find({"familiar_ids": familiar_id}).to_list(length=None)
    if not grupos:
        return []
    paciente_ids: list[str] = []
    for g in grupos:
        paciente_ids.extend(g.get("paciente_ids", []))
    if not paciente_ids:
        return []
    alertas = await db["Alertas"].find(
        {"paciente_id": {"$in": paciente_ids}}
    ).sort("timestamp", -1).to_list(length=None)
    return alertas


async def _paciente_ids_del_cuidador(cuidador_id: str) -> list[str]:
    db     = get_database()
    grupos = await db["Grupos"].find({"cuidador_ids": cuidador_id}).to_list(length=None)
    ids: list[str] = []
    for g in grupos:
        ids.extend(g.get("paciente_ids", []))
    return list(set(ids))


async def listar_alertas(cuidador_id: str, paciente_id: Optional[str] = None) -> list[dict]:
    db            = get_database()
    paciente_ids  = await _paciente_ids_del_cuidador(cuidador_id)
    query: dict   = {"paciente_id": {"$in": paciente_ids}}
    if paciente_id:
        pid = to_str_id(paciente_id)
        if pid not in paciente_ids:
            return []
        query["paciente_id"] = pid
    return await db["Alertas"].find(query).sort("timestamp", -1).to_list(length=None)


async def obtener_alerta(alerta_id: str, cuidador_id: str) -> Optional[dict]:
    db     = get_database()
    alerta = await db["Alertas"].find_one({"_id": ObjectId(alerta_id)})
    if not alerta:
        return None
    paciente_ids = await _paciente_ids_del_cuidador(cuidador_id)
    if str(alerta.get("paciente_id")) not in paciente_ids:
        return None
    return alerta


async def actualizar_estado(alerta_id: str, nuevo_estado: str, cuidador_id: str) -> Optional[dict]:
    alerta = await obtener_alerta(alerta_id, cuidador_id)
    if not alerta:
        return None
    db = get_database()
    await db["Alertas"].update_one(
        {"_id": ObjectId(alerta_id)},
        {"$set": {"estado": nuevo_estado}},
    )
    return await obtener_alerta(alerta_id, cuidador_id)


async def responder_alerta_velocidad(alerta_id: str, cuidador_id: str, viajando: bool) -> Optional[dict]:
    alerta = await obtener_alerta(alerta_id, cuidador_id)
    if not alerta:
        return None
    if alerta.get("tipo") != "anomalia_velocidad":
        return None

    db = get_database()
    paciente_id = str(alerta["paciente_id"])

    if viajando:
        from services.service_modo_viaje import activar_modo_viaje
        await activar_modo_viaje(
            paciente_id=paciente_id,
            tipo="vehiculo",
            duracion_horas=None,
            activado_por=cuidador_id,
        )
        await db["Alertas"].update_one(
            {"_id": ObjectId(alerta_id)},
            {"$set": {"estado": "resuelta"}},
        )
        Logger.add_to_log("info", f"Alerta velocidad resuelta (viajando) | alerta={alerta_id} | modo viaje activado | paciente={paciente_id}")
    else:
        await db["Alertas"].update_one(
            {"_id": ObjectId(alerta_id)},
            {"$set": {"tipo": "posible_robo"}},
        )
        Logger.add_to_log("warning", f"Posible robo reportado | alerta={alerta_id} | paciente={paciente_id}")

    return await obtener_alerta(alerta_id, cuidador_id)


# ─────────────────────────────────────────────────────────────────────
# TAREA PERIÓDICA DE REENVÍO
# ─────────────────────────────────────────────────────────────────────

async def reenviar_alertas_activas() -> dict:
    try:
        db = get_database()
        coleccion_alertas    = db["Alertas"]
        coleccion_pacientes  = db["Pacientes"]
        coleccion_grupos     = db["Grupos"]
        coleccion_cuidadores = db["Cuidadores"]

        ahora  = datetime.now(timezone.utc)
        cutoff = ahora - timedelta(seconds=COOLDOWN_ALERTA_SEGUNDOS)

        alertas_activas = await coleccion_alertas.find({
            "estado":      "enviada",
            "ultima_notif": {"$lt": cutoff},
        }).to_list(length=None)

        if not alertas_activas:
            Logger.add_to_log("info", "No hay alertas activas pendientes de reenvío")
            return {"mensaje": "Sin alertas pendientes"}

        Logger.add_to_log("info", f"Encontradas {len(alertas_activas)} alertas activas para reenviar")

        for alerta in alertas_activas:
            paciente_id = alerta.get("paciente_id")
            paciente_id_str = str(paciente_id) if paciente_id else None
            if not paciente_id_str:
                continue

            try:
                paciente = await coleccion_pacientes.find_one({"_id": ObjectId(paciente_id_str)})
            except Exception:
                paciente = await coleccion_pacientes.find_one({"_id": paciente_id_str})

            if not paciente:
                continue

            nombre_paciente = paciente.get("nombre_paciente", "El paciente")
            lat = alerta.get("latitud", 0)
            lng = alerta.get("longitud", 0)

            grupos = await coleccion_grupos.find(
                {"paciente_ids": paciente_id_str}
            ).to_list(length=None)
            if not grupos:
                continue

            cuidador_ids = []
            for g in grupos:
                cuidador_ids.extend(g.get("cuidador_ids", []))

            object_ids = []
            for cid in set(cuidador_ids):
                try:
                    object_ids.append(
                        ObjectId(cid) if isinstance(cid, str) and len(cid) == 24 else cid
                    )
                except Exception:
                    pass

            if not object_ids:
                continue

            cuidadores = await coleccion_cuidadores.find(
                {"_id": {"$in": object_ids}}
            ).to_list(length=None)

            tokens = [c.get("fcm_token") for c in cuidadores if c.get("fcm_token")]

            # También notificar a familiares del grupo
            familiar_ids_reenvio = list({fid for g in grupos for fid in g.get("familiar_ids", [])})
            if familiar_ids_reenvio:
                familiares_reenvio = await db["Familiares"].find(
                    {"_id": {"$in": [ObjectId(fid) for fid in familiar_ids_reenvio if isinstance(fid, str) and len(fid) == 24]}}
                ).to_list(length=None)
                tokens.extend([f.get("fcm_token") for f in familiares_reenvio if f.get("fcm_token")])

            if not tokens:
                continue

            resultado = await enviar_notificacion_multicast(
                tokens=tokens,
                titulo=f"⚠️ Recordatorio: {nombre_paciente} sigue fuera de zona",
                cuerpo="El paciente sigue fuera de su zona segura.",
                data={
                    "tipo":        "alerta_periodica",
                    "alerta_id":   str(alerta["_id"]),
                    "paciente_id": paciente_id_str,
                    "lat":         str(lat),
                    "lng":         str(lng),
                },
            )

            await coleccion_alertas.update_one(
                {"_id": alerta["_id"]},
                {"$set": {"ultima_notif": ahora}},
            )

            Logger.add_to_log("info", f"Alerta {alerta['_id']} reenviada a {resultado['exitos']} cuidadores")

        return {"mensaje": f"Se procesaron {len(alertas_activas)} alertas"}

    except Exception as ex:
        Logger.add_to_log("error", f"Error en reenviar_alertas_activas: {ex}")
        return {"error": str(ex)}


# ─────────────────────────────────────────────────────────────────────
# WATCHDOG DE SEÑAL GPS
# ─────────────────────────────────────────────────────────────────────

async def _alguien_cerca_o_zona_muerta(
    db, grupos: list, pac_lat: float, pac_lng: float, pac_ts: Optional[datetime]
) -> bool:
    cuidador_ids: set[str] = set()
    familiar_ids: set[str] = set()
    for g in grupos:
        cuidador_ids.update(g.get("cuidador_ids", []))
        familiar_ids.update(g.get("familiar_ids", []))

    for cuid in cuidador_ids:
        ub = await db["UbicacionesCuidadores"].find_one({"cuidador_id": cuid})
        if ub:
            if distancia_metros(pac_lat, pac_lng, ub["latitud"], ub["longitud"]) <= RADIO_PROXIMIDAD_METROS:
                return True
        try:
            c_doc = await db["Cuidadores"].find_one(
                {"_id": ObjectId(cuid)},
                {"ultima_ubicacion_lat": 1, "ultima_ubicacion_lng": 1, "ultima_ubicacion_ts": 1},
            )
        except Exception:
            c_doc = None
        if c_doc and c_doc.get("ultima_ubicacion_ts") and pac_ts:
            c_ts = c_doc["ultima_ubicacion_ts"]
            if c_ts.tzinfo is None:
                c_ts = c_ts.replace(tzinfo=timezone.utc)
            if abs((pac_ts - c_ts).total_seconds()) <= VENTANA_ZONA_MUERTA_S:
                if distancia_metros(pac_lat, pac_lng, c_doc["ultima_ubicacion_lat"], c_doc["ultima_ubicacion_lng"]) <= RADIO_PROXIMIDAD_METROS:
                    return True

    for fam in familiar_ids:
        ub = await db["UbicacionesFamiliares"].find_one({"familiar_id": fam})
        if ub:
            if distancia_metros(pac_lat, pac_lng, ub["latitud"], ub["longitud"]) <= RADIO_PROXIMIDAD_METROS:
                return True
        try:
            f_doc = await db["Familiares"].find_one(
                {"_id": ObjectId(fam)},
                {"ultima_ubicacion_lat": 1, "ultima_ubicacion_lng": 1, "ultima_ubicacion_ts": 1},
            )
        except Exception:
            f_doc = None
        if f_doc and f_doc.get("ultima_ubicacion_ts") and pac_ts:
            f_ts = f_doc["ultima_ubicacion_ts"]
            if f_ts.tzinfo is None:
                f_ts = f_ts.replace(tzinfo=timezone.utc)
            if abs((pac_ts - f_ts).total_seconds()) <= VENTANA_ZONA_MUERTA_S:
                if distancia_metros(pac_lat, pac_lng, f_doc["ultima_ubicacion_lat"], f_doc["ultima_ubicacion_lng"]) <= RADIO_PROXIMIDAD_METROS:
                    return True

    return False


async def _crear_alerta_senal_perdida(db, paciente: dict, lat: float, lng: float, grupos: list) -> None:
    paciente_id_str = str(paciente["_id"])
    nombre_paciente = paciente.get("nombre_paciente", "El paciente")
    ahora = datetime.now(timezone.utc)

    alerta_doc = {
        "paciente_id":            paciente_id_str,
        "paciente_nombre":        nombre_paciente,
        "zonasegura_id":          None,
        "zona_nombre":            None,
        "tipo":                   "senal_perdida",
        "latitud":                lat,
        "longitud":               lng,
        "timestamp":              ahora,
        "estado":                 "pendiente",
        "mensaje":                f"{nombre_paciente} ha perdido la señal GPS",
        "cuidadores_notificados": [],
        "fcm_exitos":             0,
        "fcm_fallos":             0,
        "ultima_notif":           ahora,
    }
    result    = await db["Alertas"].insert_one(alerta_doc)
    alerta_id = result.inserted_id

    cuidador_ids: list[str] = []
    for g in grupos:
        cuidador_ids.extend(g.get("cuidador_ids", []))
    cuidador_ids_unicos = list(set(cuidador_ids))

    cuidadores = await db["Cuidadores"].find({
        "_id": {"$in": [
            ObjectId(cid) if isinstance(cid, str) and len(cid) == 24 else cid
            for cid in cuidador_ids_unicos
        ]}
    }).to_list(length=None)

    tokens                 = [c.get("fcm_token") for c in cuidadores if c.get("fcm_token")]
    cuidador_ids_con_token = [to_str_id(c["_id"]) for c in cuidadores if c.get("fcm_token")]

    # También notificar a familiares del grupo
    familiar_ids_senal = list({fid for g in grupos for fid in g.get("familiar_ids", [])})
    if familiar_ids_senal:
        familiares_senal = await db["Familiares"].find(
            {"_id": {"$in": [ObjectId(fid) for fid in familiar_ids_senal if isinstance(fid, str) and len(fid) == 24]}}
        ).to_list(length=None)
        tokens.extend([f.get("fcm_token") for f in familiares_senal if f.get("fcm_token")])

    if not tokens:
        await db["Alertas"].update_one({"_id": alerta_id}, {"$set": {"estado": "fallida"}})
        Logger.add_to_log("warn", f"Sin tokens FCM para alerta señal perdida | paciente={paciente_id_str}")
        return

    resultado = await enviar_notificacion_multicast(
        tokens=tokens,
        titulo=f"📡 Señal GPS perdida — {nombre_paciente}",
        cuerpo=f"No se detecta señal del dispositivo de {nombre_paciente}. Última posición registrada disponible.",
        data={
            "tipo":        "senal_perdida",
            "alerta_id":   str(alerta_id),
            "paciente_id": paciente_id_str,
            "lat":         str(lat),
            "lng":         str(lng),
        },
    )

    estado_final = "enviada" if resultado["exitos"] > 0 else "fallida"
    await db["Alertas"].update_one(
        {"_id": alerta_id},
        {"$set": {
            "estado":                 estado_final,
            "cuidadores_notificados": cuidador_ids_con_token,
            "fcm_exitos":             resultado["exitos"],
            "fcm_fallos":             resultado["fallos"],
        }},
    )
    Logger.add_to_log("info", f"Alerta señal perdida | paciente={paciente_id_str} | FCM exitos={resultado['exitos']} fallos={resultado['fallos']}")
    if resultado["tokens_invalidos"]:
        await db["Cuidadores"].update_many(
            {"fcm_token": {"$in": resultado["tokens_invalidos"]}},
            {"$unset": {"fcm_token": ""}},
        )
        await db["Familiares"].update_many(
            {"fcm_token": {"$in": resultado["tokens_invalidos"]}},
            {"$unset": {"fcm_token": ""}},
        )


async def verificar_senal_perdida() -> None:
    db    = get_database()
    ahora = datetime.now(timezone.utc)
    limite_inferior = ahora - timedelta(seconds=VENTANA_DISPOSITIVO_S)
    limite_superior = ahora - timedelta(seconds=UMBRAL_SENAL_PERDIDA_S)

    dispositivos = await db["Dispositivos"].find({
        "ultima_conexion": {"$gte": limite_inferior, "$lt": limite_superior},
        "paciente_id":     {"$exists": True, "$ne": None},
    }).to_list(length=None)

    for dispositivo in dispositivos:
        paciente_id_str = str(dispositivo["paciente_id"])
        try:
            paciente = await db["Pacientes"].find_one({"_id": ObjectId(paciente_id_str)})
        except Exception:
            paciente = await db["Pacientes"].find_one({"_id": paciente_id_str})
        if not paciente:
            continue

        ultima_alerta_ts = paciente.get("ultima_senal_perdida_alerta")
        if ultima_alerta_ts is not None:
            if ultima_alerta_ts.tzinfo is None:
                ultima_alerta_ts = ultima_alerta_ts.replace(tzinfo=timezone.utc)
            if (ahora - ultima_alerta_ts).total_seconds() < COOLDOWN_SENAL_PERDIDA_S:
                continue

        ultima_ub = paciente.get("ultima_ubicacion")
        if not ultima_ub:
            continue
        pac_lat = ultima_ub.get("latitud")
        pac_lng = ultima_ub.get("longitud")
        if pac_lat is None or pac_lng is None:
            continue

        pac_ts = dispositivo.get("ultima_conexion")
        if pac_ts and pac_ts.tzinfo is None:
            pac_ts = pac_ts.replace(tzinfo=timezone.utc)

        grupos = await db["Grupos"].find({"paciente_ids": paciente_id_str}).to_list(length=None)
        if not grupos:
            continue

        if await _alguien_cerca_o_zona_muerta(db, grupos, pac_lat, pac_lng, pac_ts):
            Logger.add_to_log("info", f"Señal perdida suprimida (proximidad/zona muerta) | paciente={paciente_id_str}")
            continue

        await _crear_alerta_senal_perdida(db, paciente, pac_lat, pac_lng, grupos)

        try:
            await db["Pacientes"].update_one(
                {"_id": ObjectId(paciente_id_str)},
                {"$set": {"ultima_senal_perdida_alerta": ahora}},
            )
        except Exception:
            await db["Pacientes"].update_one(
                {"_id": paciente_id_str},
                {"$set": {"ultima_senal_perdida_alerta": ahora}},
            )


async def resolver_alertas_senal_perdida(paciente_id_str: str) -> None:
    db     = get_database()
    result = await db["Alertas"].update_many(
        {
            "paciente_id": paciente_id_str,
            "tipo":        "senal_perdida",
            "estado":      {"$in": ["pendiente", "enviada"]},
        },
        {"$set": {"estado": "resuelta"}},
    )
    if result.modified_count > 0:
        Logger.add_to_log("info", f"Alertas señal perdida resueltas automáticamente | paciente={paciente_id_str} | count={result.modified_count}")
    try:
        await db["Pacientes"].update_one(
            {"_id": ObjectId(paciente_id_str)},
            {"$unset": {"ultima_senal_perdida_alerta": ""}},
        )
    except Exception:
        pass