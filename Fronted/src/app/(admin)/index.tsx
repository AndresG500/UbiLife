import { useCallback, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter, useFocusEffect } from 'expo-router'
import { Colors } from '@/constants/Colors'
import { adminService } from '@/services/api'
import { useAuth } from '@/context/AuthContext'
import AnimatedScreen from '@/components/AnimatedScreen'

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

function StatCard({
  icon, color, bg, titulo, valor, subtitulo, onPress,
}: {
  icon: IoniconsName; color: string; bg: string
  titulo: string; valor: number | string; subtitulo?: string; onPress?: () => void
}) {
  const Wrapper = onPress ? TouchableOpacity : View
  return (
    <Wrapper style={styles.statCard} onPress={onPress} activeOpacity={onPress ? 0.85 : undefined}>
      <View style={[styles.statIconWrap, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={styles.statValor}>{valor}</Text>
      <Text style={styles.statTitulo}>{titulo}</Text>
      {subtitulo ? <Text style={styles.statSub}>{subtitulo}</Text> : null}
    </Wrapper>
  )
}

function NavCard({
  icon, titulo, desc, onPress,
}: {
  icon: IoniconsName; titulo: string; desc: string; onPress: () => void
}) {
  return (
    <TouchableOpacity style={styles.navCard} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.navCardIconWrap}>
        <Ionicons name={icon} size={24} color={Colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.navCardTitulo}>{titulo}</Text>
        <Text style={styles.navCardDesc}>{desc}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
    </TouchableOpacity>
  )
}

export default function AdminDashboard() {
  const router            = useRouter()
  const { cuidador, logout } = useAuth()
  const [stats,   setStats]  = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]  = useState('')

  const cargar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await adminService.estadisticas()
      setStats(res.data)
    } catch {
      setError('No se pudieron cargar las estadísticas.')
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  const handleLogout = () => {
    Alert.alert('Cerrar sesión', '¿Seguro que deseas salir?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir', style: 'destructive',
        onPress: async () => {
          await adminService.logout()
          await logout()
        },
      },
    ])
  }

  return (
    <AnimatedScreen>
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIconWrap}>
              <Ionicons name="shield-checkmark" size={20} color={Colors.primaryLight} />
            </View>
            <View>
              <Text style={styles.headerTitle}>Panel administrativo</Text>
              <Text style={styles.headerSub}>UbiLife</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
            <Ionicons name="log-out-outline" size={22} color="rgba(255,255,255,0.75)" />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Saludo */}
          <Text style={styles.saludo}>
            Bienvenido, <Text style={styles.saludoNombre}>{cuidador?.name ?? 'Admin'}</Text>
          </Text>

          {/* ── Stats ── */}
          <Text style={styles.sectionLabel}>Resumen de la plataforma</Text>

          {loading ? (
            <ActivityIndicator style={{ marginTop: 32 }} size="large" color={Colors.primary} />
          ) : error ? (
            <View style={styles.errorBox}>
              <Ionicons name="warning-outline" size={15} color={Colors.error} style={{ marginRight: 6 }} />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={cargar} style={{ marginLeft: 8 }}>
                <Text style={[styles.errorText, { fontWeight: '700', textDecorationLine: 'underline' }]}>Reintentar</Text>
              </TouchableOpacity>
            </View>
          ) : stats ? (
            <>
              <View style={styles.statsGrid}>
                <StatCard
                  icon="people-circle-outline" color="#102e50" bg="#e8eef5"
                  titulo="Usuarios"
                  valor={stats.usuarios?.total ?? 0}
                  subtitulo={`${stats.usuarios?.activos ?? 0} activos`}
                />
                <StatCard
                  icon="person-outline" color="#0369a1" bg="#e0f2fe"
                  titulo="Pacientes"
                  valor={stats.pacientes?.total ?? 0}
                  subtitulo={`${stats.pacientes?.activos ?? 0} activos`}
                />
                <StatCard
                  icon="hardware-chip-outline" color="#7c3aed" bg="#f5f3ff"
                  titulo="Dispositivos"
                  valor={stats.dispositivos?.vinculados ?? 0}
                  subtitulo={`${stats.dispositivos?.disponibles ?? 0} disponibles`}
                />
                <StatCard
                  icon="flag-outline" color="#dc2626" bg="#fef2f2"
                  titulo="Reportes"
                  valor={stats.reportes?.recibidos ?? 0}
                  subtitulo={`${stats.reportes?.en_revision ?? 0} en revisión`}
                  onPress={() => router.push('/(admin)/reportes' as any)}
                />
              </View>
            </>
          ) : null}

          {/* ── Navegación ── */}
          <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Gestión</Text>

          <NavCard
            icon="people-circle"
            titulo="Usuarios"
            desc="Ver, activar o desactivar cuidadores y familiares"
            onPress={() => router.push('/(admin)/usuarios' as any)}
          />
          <NavCard
            icon="hardware-chip"
            titulo="Dispositivos"
            desc="Inventario y bloqueo de dispositivos"
            onPress={() => router.push('/(admin)/dispositivos' as any)}
          />
        </ScrollView>

      </SafeAreaView>
    </AnimatedScreen>
  )
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#102e50' },
  content: { flex: 1, backgroundColor: '#f7fbfc' },
  scrollContent: { padding: 16, paddingBottom: 40 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 18,
  },
  headerLeft:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.white },
  headerSub:   { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 1 },
  logoutBtn:   { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },

  saludo:       { fontSize: 15, color: Colors.textSecondary, marginBottom: 20, marginTop: 4 },
  saludoNombre: { fontWeight: '700', color: Colors.text },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
  },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },

  statCard: {
    flex: 1, minWidth: '45%',
    backgroundColor: Colors.white, borderRadius: 18, padding: 16,
    elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)',
  },
  statIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  statValor:  { fontSize: 28, fontWeight: '800', color: '#102e50' },
  statTitulo: { fontSize: 13, fontWeight: '600', color: Colors.text, marginTop: 2 },
  statSub:    { fontSize: 11, color: Colors.textSecondary, marginTop: 3 },

  navCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.white, borderRadius: 18, padding: 18,
    marginBottom: 12, elevation: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)',
  },
  navCardIconWrap: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#e8eef5', justifyContent: 'center', alignItems: 'center',
  },
  navCardTitulo: { fontSize: 15, fontWeight: '700', color: '#102e50' },
  navCardDesc:   { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  errorBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FEF2F2', borderRadius: 12, padding: 14,
    marginBottom: 16, borderLeftWidth: 3, borderLeftColor: Colors.error,
  },
  errorText: { flex: 1, color: Colors.error, fontSize: 13 },
})
