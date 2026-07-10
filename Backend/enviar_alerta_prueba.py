"""
Script de prueba para enviar una alerta manualmente (opción 3: directo a la BD).

Reutiliza `crear_y_despachar_alerta()` del servicio real, de modo que:
  1. Inserta el documento en la colección `Alertas` (se verá al hacer GET /alertas/).
  2. Envía el push por Expo a cuidadores/familiares del grupo con `fcm_token`.

Se debe ejecutar desde la carpeta Backend/ con el .venv activo y el .env cargado:

    cd Backend
    source .venv/bin/activate
    python enviar_alerta_prueba.py                         # usa el paciente por defecto, tipo salida_zona_segura
    python enviar_alerta_prueba.py --tipo anomalia_velocidad
    python enviar_alerta_prueba.py --paciente 6a511087ec535e81f7e17a16 --lat 11.24 --lng -74.17
"""

import argparse
import asyncio

from bson import ObjectId

from database.database import get_database, close_database
from services.service_alerta import crear_y_despachar_alerta, _crear_alerta_senal_perdida

# Paciente Alfredo (por defecto). Cámbialo con --paciente si hace falta.
PACIENTE_ID_DEFECTO = "6a511087ec535e81f7e17a16"

# Los 4 tipos de alerta que entiende el frontend.
# 'senal_perdida' usa otra función interna, por eso se maneja aparte más abajo.
TIPOS_VALIDOS = ("salida_zona_segura", "alerta_periodica", "anomalia_velocidad", "senal_perdida")


async def main() -> None:
    parser = argparse.ArgumentParser(description="Envía una alerta de prueba a un paciente.")
    parser.add_argument("--paciente", default=PACIENTE_ID_DEFECTO, help="ObjectId del paciente")
    parser.add_argument("--tipo", default="salida_zona_segura", choices=TIPOS_VALIDOS,
                        help="Tipo de alerta a generar")
    parser.add_argument("--lat", type=float, default=None,
                        help="Latitud (por defecto usa la última ubicación del paciente)")
    parser.add_argument("--lng", type=float, default=None,
                        help="Longitud (por defecto usa la última ubicación del paciente)")
    parser.add_argument("--distancia", type=float, default=120.0,
                        help="Distancia en metros a la zona (solo informativo en el mensaje)")
    args = parser.parse_args()

    db = get_database()

    # Buscar el paciente (tolerante a _id como ObjectId o string, igual que el servicio).
    try:
        paciente = await db["Pacientes"].find_one({"_id": ObjectId(args.paciente)})
    except Exception:
        paciente = await db["Pacientes"].find_one({"_id": args.paciente})

    if not paciente:
        print(f"❌ No se encontró el paciente {args.paciente}")
        await close_database()
        return

    # Coordenadas: las del CLI o, si no, la última ubicación registrada del paciente.
    ultima = paciente.get("ultima_ubicacion") or {}
    lat = args.lat if args.lat is not None else ultima.get("latitud")
    lng = args.lng if args.lng is not None else ultima.get("longitud")

    if lat is None or lng is None:
        print("❌ El paciente no tiene ultima_ubicacion y no se pasaron --lat/--lng.")
        await close_database()
        return

    nombre = paciente.get("nombre_paciente", "El paciente")
    print(f"➡️  Enviando alerta '{args.tipo}' para {nombre} ({args.paciente}) en ({lat}, {lng})...")

    if args.tipo == "senal_perdida":
        # Este tipo lo crea una función distinta que necesita los grupos del paciente.
        grupos = await db["Grupos"].find(
            {"paciente_ids": str(paciente["_id"])}
        ).to_list(length=None)
        if not grupos:
            print("❌ El paciente no pertenece a ningún grupo; no hay a quién notificar.")
            await close_database()
            return
        await _crear_alerta_senal_perdida(db, paciente, lat, lng, grupos)
    else:
        await crear_y_despachar_alerta(
            paciente=paciente,
            zona_mas_cercana=None,
            lat=lat,
            lng=lng,
            tipo=args.tipo,
            distancia=args.distancia,
        )

    # Releer la última alerta creada para reportar su estado.
    alerta = await db["Alertas"].find(
        {"paciente_id": str(paciente["_id"])}
    ).sort("timestamp", -1).limit(1).to_list(length=1)

    if alerta:
        a = alerta[0]
        print(f"✅ Alerta creada | id={a['_id']} | estado={a.get('estado')} "
              f"| fcm_exitos={a.get('fcm_exitos')} fcm_fallos={a.get('fcm_fallos')}")
        if a.get("estado") == "fallida":
            print("   ⚠️  Estado 'fallida': el paciente no tiene grupo con cuidadores/familiares "
                  "que tengan fcm_token. La alerta igual aparecerá al hacer GET /alertas/.")
    else:
        print("⚠️  No se pudo releer la alerta recién creada.")

    await close_database()


if __name__ == "__main__":
    asyncio.run(main())
