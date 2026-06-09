/**
 * Traduce un error de axios a un mensaje legible para el usuario.
 * Nunca expone detalles internos del backend.
 *
 * @param err      - Objeto de error capturado en el catch
 * @param fallback - Mensaje por defecto para esta acción específica
 */
export function mensajeDeError(err: any, fallback: string): string {
  const status: number | undefined = err?.response?.status
  if (!status) return 'Sin conexión. Verifica tu red e intenta de nuevo.'
  if (status === 401) return 'Tu sesión ha expirado. Inicia sesión de nuevo.'
  if (status === 403) return 'No tienes permiso para realizar esta acción.'
  if (status === 422) return 'Los datos enviados no son válidos. Verifica e intenta de nuevo.'
  if (status === 429) return 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.'
  if (status >= 500)  return 'Error en el servidor. Inténtalo más tarde.'
  return fallback
}
