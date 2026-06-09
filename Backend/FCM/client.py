import httpx
from typing import Optional

from utils.Logger import Logger

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def inicializar_firebase(credenciales_path: str = "") -> None:
    Logger.add_to_log("info", "Notificaciones: modo Expo Push activo")


async def enviar_notificacion_multicast(
    tokens: list[str],
    titulo: str,
    cuerpo: str,
    data: Optional[dict] = None,
) -> dict:
    """
    Envía notificaciones push a múltiples dispositivos vía Expo Push API.

    Args:
        tokens:  Lista de Expo Push Tokens de los dispositivos destino.
        titulo:  Título visible de la notificación.
        cuerpo:  Cuerpo visible de la notificación.
        data:    Datos adicionales enviados a la app (todos como strings).

    Returns:
        {
            "total": int,
            "exitos": int,
            "fallos": int,
            "tokens_invalidos": list[str],
        }
    """
    if not tokens:
        Logger.add_to_log("warn", "enviar_notificacion_multicast llamado sin tokens")
        return {"total": 0, "exitos": 0, "fallos": 0, "tokens_invalidos": []}

    # Expo acepta hasta 100 mensajes por request
    mensajes = [
        {
            "to":        token,
            "title":     titulo,
            "body":      cuerpo,
            "data":      {k: str(v) for k, v in (data or {}).items()},
            "sound":     "default",
            "priority":  "high",
            "channelId": "ubilife_alertas",  # canal configurado en el frontend
        }
        for token in tokens
    ]

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                EXPO_PUSH_URL,
                json=mensajes,
                headers={
                    "Content-Type": "application/json",
                    "Accept":       "application/json",
                },
            )
            response.raise_for_status()
            resultado = response.json()

    except httpx.TimeoutException:
        Logger.add_to_log("error", "Timeout contactando Expo Push API")
        return {"total": len(tokens), "exitos": 0, "fallos": len(tokens), "tokens_invalidos": []}

    except httpx.HTTPError as ex:
        Logger.add_to_log("error", f"Error HTTP en Expo Push API: {ex}")
        return {"total": len(tokens), "exitos": 0, "fallos": len(tokens), "tokens_invalidos": []}

    # Analizar tickets de respuesta
    tickets          = resultado.get("data", [])
    tokens_invalidos = []
    exitos           = 0
    fallos           = 0

    for i, ticket in enumerate(tickets):
        if ticket.get("status") == "ok":
            exitos += 1
        else:
            fallos += 1
            error_tipo = ticket.get("details", {}).get("error", "")
            if error_tipo == "DeviceNotRegistered":
                # Token inválido: app desinstalada o token expirado
                tokens_invalidos.append(tokens[i])
                Logger.add_to_log(
                    "warn",
                    f"Token inválido (DeviceNotRegistered): {tokens[i][:35]}...",
                )
            else:
                Logger.add_to_log(
                    "warn",
                    f"Error enviando a token #{i}: {ticket.get('message', error_tipo)}",
                )

    Logger.add_to_log(
        "info",
        f"Expo Push: {exitos} éxitos, {fallos} fallos de {len(tokens)} tokens",
    )

    return {
        "total":            len(tokens),
        "exitos":           exitos,
        "fallos":           fallos,
        "tokens_invalidos": tokens_invalidos,
    }