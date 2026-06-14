type RutaHandler = (fromLat: number, fromLng: number, toLat: number, toLng: number) => void

let _handler: RutaHandler | null = null
let _pendingRuta: [number, number, number, number] | null = null

export const eventosMapa = {
  onMostrarRuta(fn: RutaHandler) {
    _handler = fn
    if (_pendingRuta) {
      const args = _pendingRuta
      _pendingRuta = null
      fn(...args)
    }
  },
  emitirRuta(fromLat: number, fromLng: number, toLat: number, toLng: number) {
    if (_handler) {
      _handler(fromLat, fromLng, toLat, toLng)
    } else {
      _pendingRuta = [fromLat, fromLng, toLat, toLng]
    }
  },
  limpiarHandler() {
    _handler = null
  },
}
