import { useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, LogBox, Modal, ActivityIndicator } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { Ionicons } from '@expo/vector-icons'
import Constants from 'expo-constants'
import * as Location from 'expo-location'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { Colors } from '@/constants/Colors'
import { configurarListeners, verificarNotifInicial, type DatosVelocidad } from '@/utils/notificaciones'
import { alertaService } from '@/services/api'
import { eventosMapa } from '@/utils/eventosMapa'
import '@/global.css'

const TIPOS_CON_RUTA = ['salida_zona_segura', 'alerta_periodica', 'senal_perdida']

LogBox.ignoreLogs([
  'expo-notifications',
  '`expo-notifications` functionality is not fully supported in Expo Go',
])

const RUTAS_PUBLICAS = ['login', 'register', 'register-cuidador', 'register-familiar', 'elegir-rol', 'admin-login']

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { token, loading, tipoUsuario } = useAuth()
  const segments = useSegments()
  const router   = useRouter()

  useEffect(() => {
    if (loading) return
    const seg       = segments[0] as string
    const inApp     = seg === '(app)'
    const inAdmin   = seg === '(admin)'
    const enPublico = RUTAS_PUBLICAS.includes(seg)

    if (!token) {
      if (inApp || inAdmin) router.replace('/login')
      else if (!enPublico)  router.replace('/login')
    } else if (tipoUsuario === 'admin') {
      if (!inAdmin) router.replace('/(admin)' as any)
    } else {
      if (!inApp) router.replace('/(app)')
    }
  }, [token, loading, tipoUsuario, segments, router])

  if (loading) return null
  const seg0    = segments[0] as string
  const inApp   = seg0 === '(app)'
  const inAdmin = seg0 === '(admin)'
  if (!token && (inApp || inAdmin)) return null
  return <>{children}</>
}

interface NotifBanner {
  titulo: string
  cuerpo: string
}

const STATUS_BAR_TOP = (Constants.statusBarHeight ?? 24) + 12

export default function RootLayout() {
  const router   = useRouter()
  const [banner, setBanner] = useState<NotifBanner | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [alertaVelocidad,      setAlertaVelocidad]      = useState<DatosVelocidad | null>(null)
  const [respondiendoVelocidad, setRespondiendoVelocidad] = useState(false)

  const mostrarBanner = (titulo: string, cuerpo: string) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setBanner({ titulo, cuerpo })
    timerRef.current = setTimeout(() => setBanner(null), 5000)
  }

  const cerrarBanner = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setBanner(null)
  }

  const irAlInicio = () => {
    cerrarBanner()
    router.replace('/(app)')
  }

  const mostrarRutaAlPaciente = async (destLat: number, destLng: number) => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') return
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      eventosMapa.emitirRuta(pos.coords.latitude, pos.coords.longitude, destLat, destLng)
    } catch {}
  }

  const handleResponderVelocidad = async (viajando: boolean) => {
    if (!alertaVelocidad) return
    setRespondiendoVelocidad(true)
    try {
      await alertaService.responder(alertaVelocidad.alertaId, viajando)
      setAlertaVelocidad(null)
      if (!viajando) {
        mostrarBanner('Posible robo reportado', 'Verifica la ubicación del paciente de inmediato.')
      }
    } catch {
      setAlertaVelocidad(null)
    } finally {
      setRespondiendoVelocidad(false)
    }
  }

  useEffect(() => {
    const limpiar = configurarListeners(
      (titulo, cuerpo) => mostrarBanner(titulo, cuerpo),
      () => irAlInicio(),
      (datos) => setAlertaVelocidad(datos),
      (_tipo, lat, lng) => mostrarRutaAlPaciente(lat, lng),
    )
    verificarNotifInicial().then((resultado) => {
      if (!resultado) return
      if (resultado.esVelocidad) {
        setAlertaVelocidad({ alertaId: resultado.alertaId, pacienteId: resultado.pacienteId })
      } else {
        irAlInicio()
        if (resultado.tipo && TIPOS_CON_RUTA.includes(resultado.tipo) && resultado.lat != null && resultado.lng != null) {
          mostrarRutaAlPaciente(resultado.lat, resultado.lng)
        }
      }
    })
    return limpiar
  }, [])

  return (
    <AuthProvider>
      <StatusBar style="light" />
      <View style={{ flex: 1 }}>
        <AuthGuard>
          <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
        </AuthGuard>

        {banner ? (
          <TouchableOpacity
            style={[styles.banner, { top: STATUS_BAR_TOP }]}
            onPress={irAlInicio}
            activeOpacity={0.92}
          >
            <View style={styles.bannerIconWrap}>
              <Ionicons name="alert-circle" size={22} color={Colors.error} />
            </View>
            <View style={styles.bannerTexts}>
              <Text style={styles.bannerTitulo} numberOfLines={1}>{banner.titulo}</Text>
              <Text style={styles.bannerCuerpo} numberOfLines={2}>{banner.cuerpo}</Text>
            </View>
            <TouchableOpacity onPress={cerrarBanner} hitSlop={10}>
              <Ionicons name="close" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          </TouchableOpacity>
        ) : null}

        <Modal visible={!!alertaVelocidad} transparent animationType="fade">
          <View style={styles.velocidadOverlay}>
            <View style={styles.velocidadSheet}>
              <View style={styles.velocidadIconWrap}>
                <Ionicons name="speedometer" size={34} color="#d97706" />
              </View>
              <Text style={styles.velocidadTitulo}>Movimiento inusual detectado</Text>
              <Text style={styles.velocidadCuerpo}>
                El dispositivo del paciente se está moviendo a alta velocidad.{'\n\n'}
                ¿El paciente está viajando con usted?
              </Text>
              <TouchableOpacity
                style={[styles.velocidadBtnSi, respondiendoVelocidad && { opacity: 0.6 }]}
                onPress={() => handleResponderVelocidad(true)}
                disabled={respondiendoVelocidad}
                activeOpacity={0.85}
              >
                {respondiendoVelocidad ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="car" size={18} color="#fff" />
                    <Text style={styles.velocidadBtnSiText}>Sí, está viajando</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.velocidadBtnNo, respondiendoVelocidad && { opacity: 0.6 }]}
                onPress={() => handleResponderVelocidad(false)}
                disabled={respondiendoVelocidad}
                activeOpacity={0.85}
              >
                <Ionicons name="warning" size={18} color="#dc2626" />
                <Text style={styles.velocidadBtnNoText}>No, reportar posible robo</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </AuthProvider>
  )
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 14,
    gap: 12,
    borderLeftWidth: 4,
    borderLeftColor: Colors.error,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    zIndex: 999,
  },
  bannerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerTexts:  { flex: 1 },
  bannerTitulo: { fontSize: 14, fontWeight: '700', color: Colors.text },
  bannerCuerpo: { fontSize: 12, color: Colors.textSecondary, marginTop: 2, lineHeight: 17 },

  velocidadOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  velocidadSheet: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 28,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 20,
  },
  velocidadIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fffbeb',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#fde68a',
  },
  velocidadTitulo: {
    fontSize: 18,
    fontWeight: '700',
    color: '#102e50',
    textAlign: 'center',
    marginBottom: 10,
  },
  velocidadCuerpo: {
    fontSize: 14,
    color: '#4b5563',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 28,
  },
  velocidadBtnSi: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#102e50',
    borderRadius: 14,
    paddingVertical: 15,
    width: '100%',
    marginBottom: 10,
  },
  velocidadBtnSiText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  velocidadBtnNo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 2,
    borderColor: '#dc2626',
    borderRadius: 14,
    paddingVertical: 14,
    width: '100%',
  },
  velocidadBtnNoText: {
    color: '#dc2626',
    fontSize: 15,
    fontWeight: '700',
  },
})
