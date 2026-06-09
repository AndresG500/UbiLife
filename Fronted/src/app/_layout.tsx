import { useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, LogBox } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { Ionicons } from '@expo/vector-icons'
import Constants from 'expo-constants'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { Colors } from '@/constants/Colors'
import { configurarListeners, verificarNotifInicial } from '@/utils/notificaciones'
import '@/global.css'

LogBox.ignoreLogs([
  'expo-notifications',
  '`expo-notifications` functionality is not fully supported in Expo Go',
])

const RUTAS_PUBLICAS = ['login', 'register', 'register-cuidador', 'register-familiar', 'elegir-rol']

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuth()
  const segments = useSegments()
  const router   = useRouter()

  useEffect(() => {
    if (loading) return
    const inApp     = segments[0] === '(app)'
    const enPublico = RUTAS_PUBLICAS.includes(segments[0] as string)

    if (!token && inApp) {
      router.replace('/login')
    } else if (!token && !enPublico) {
      router.replace('/login')
    } else if (token && !inApp) {
      router.replace('/(app)')
    }
  }, [token, loading, segments, router])

  if (loading) return null
  const inApp = segments[0] === '(app)'
  if (!token && inApp) return null
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

  useEffect(() => {
    const limpiar = configurarListeners(
      (titulo, cuerpo) => mostrarBanner(titulo, cuerpo),
      () => irAlInicio(),
    )
    verificarNotifInicial().then((hayRespuesta) => {
      if (hayRespuesta) irAlInicio()
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
})
