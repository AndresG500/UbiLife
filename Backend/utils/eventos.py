import asyncio
from collections import defaultdict
from typing import Dict, List

SSE_QUEUE_MAXSIZE = 50


class EventBus:
    def __init__(self):
        self._suscriptores: Dict[str, List[asyncio.Queue]] = defaultdict(list)

    def suscribir(self, topic: str, cola: asyncio.Queue):
        self._suscriptores[topic].append(cola)

    def desuscribir(self, topic: str, cola: asyncio.Queue):
        if cola in self._suscriptores[topic]:
            self._suscriptores[topic].remove(cola)

    async def publicar(self, topic: str, datos: dict):
        for cola in list(self._suscriptores[topic]):
            try:
                cola.put_nowait(datos)
            except asyncio.QueueFull:
                pass  # cliente lento o desconectado — evento descartado

bus_eventos = EventBus()