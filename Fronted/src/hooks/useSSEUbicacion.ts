import { useEffect, useRef, useState } from 'react';
import EventSource from 'react-native-sse';
import * as SecureStore from 'expo-secure-store';

const API_URL        = process.env.EXPO_PUBLIC_API_URL;
const DELAY_BASE_MS  = 5000;
const DELAY_MAX_MS   = 60000;
const MAX_REINTENTOS = 10;
const GPS_TIMEOUT_MS = 60_000; // sin datos en 60 s → GPS offline

interface UbicacionPaciente {
  latitude: number;
  longitude: number;
  timestamp: string;
}

export const useSSEUbicacion = (pacienteId: string | null) => {
  const [ubicacion,       setUbicacion]       = useState<UbicacionPaciente | null>(null);
  const [conectado,       setConectado]       = useState<boolean>(false);
  const [gpsActivo,       setGpsActivo]       = useState<boolean>(false);
  const [errorPermanente, setErrorPermanente] = useState<boolean>(false);
  const esRef            = useRef<EventSource | null>(null);
  const intentosRef      = useRef(0);
  const ultimoMensajeRef = useRef<number | null>(null);

  // Revisa cada 15 s si el último dato GPS sigue siendo fresco
  useEffect(() => {
    if (!pacienteId) {
      setGpsActivo(false);
      return;
    }
    const intervalo = setInterval(() => {
      if (ultimoMensajeRef.current === null) return;
      const elapsed = Date.now() - ultimoMensajeRef.current;
      setGpsActivo(elapsed < GPS_TIMEOUT_MS);
    }, 15_000);
    return () => clearInterval(intervalo);
  }, [pacienteId]);

  useEffect(() => {
    if (!pacienteId) {
      setConectado(false);
      setGpsActivo(false);
      ultimoMensajeRef.current = null;
      return;
    }

    let cancelado  = false;
    let conectando = false;
    intentosRef.current = 0;
    ultimoMensajeRef.current = null;
    setGpsActivo(false);
    setErrorPermanente(false);

    const conectar = async (): Promise<void> => {
      if (cancelado || conectando) return;
      conectando = true;

      try {
        if (intentosRef.current >= MAX_REINTENTOS) {
          setErrorPermanente(true);
          return;
        }

        esRef.current?.close();

        const token = await SecureStore.getItemAsync('token');
        if (!token || cancelado) return;

        const url = `${API_URL}/pacientes/${pacienteId}/ubicacion/stream`;

        const es = new EventSource(url, {
          headers: { Authorization: `Bearer ${token}` },
        });

        es.addEventListener('open', () => {
          if (!cancelado) {
            setConectado(true);
            setErrorPermanente(false);
            intentosRef.current = 0;
          }
        });

        es.addEventListener('message', (e) => {
          if (cancelado || !e.data) return;
          try {
            const datos = JSON.parse(e.data);
            // La frescura se mide con el timestamp REAL del GPS, no con la hora de
            // llegada: al conectar, el backend reenvía la última ubicación conocida
            // (posiblemente vieja) y no debe marcarse como "en línea".
            const tsMs   = datos.timestamp ? new Date(datos.timestamp).getTime() : Date.now();
            const tsFinal = Number.isNaN(tsMs) ? Date.now() : tsMs;
            ultimoMensajeRef.current = tsFinal;
            setGpsActivo(Date.now() - tsFinal < GPS_TIMEOUT_MS);
            setUbicacion({
              latitude:  datos.latitud  ?? datos.lat,
              longitude: datos.longitud ?? datos.lng,
              timestamp: datos.timestamp,
            });
          } catch (_) {}
        });

        es.addEventListener('error', () => {
          if (cancelado) return;
          setConectado(false);
          setGpsActivo(false);
          ultimoMensajeRef.current = null;
          esRef.current?.close();
          intentosRef.current += 1;
          const delay = Math.min(DELAY_BASE_MS * intentosRef.current, DELAY_MAX_MS);
          setTimeout(conectar, delay);
        });

        esRef.current = es;
      } finally {
        conectando = false;
      }
    };

    conectar();

    return () => {
      cancelado = true;
      esRef.current?.close();
    };
  }, [pacienteId]);

  return { ubicacion, conectado, gpsActivo, errorPermanente };
};