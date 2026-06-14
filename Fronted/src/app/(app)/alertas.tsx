import { useCallback, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useFocusEffect } from 'expo-router'
import { Colors } from '@/constants/Colors'
import { alertaService } from '@/services/api'
import { useAuth } from '@/context/AuthContext'
import AnimatedScreen from '@/components/AnimatedScreen'

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

// ── Configuración visual por tipo y estado ────────────────────────────────────

const TIPO_CONFIG: Record<string, { label: string; icon: IoniconsName; color: string; bg: string }> = {
  salida_zona_segura: {
    label: 'Salida de zona segura',
    icon:  'location-outline',
    color: '#dc2626',
    bg:    '#fef2f2',
  },
  alerta_periodica: {
    label: 'Fuera de zona (recordatorio)',
    icon:  'refresh-circle-outline',
    color: '#ea580c',
    bg:    '#fff7ed',
  },
  anomalia_velocidad: {
    label: 'Movimiento inusual',
    icon:  'speedometer-outline',
    color: '#d97706',
    bg:    '#fffbeb',
  },
  posible_robo: {
    label: 'Posible robo del dispositivo',
    icon:  'warning-outline',
    color: '#7c3aed',
    bg:    '#f5f3ff',
  },
  senal_perdida: {
    label: 'Señal GPS perdida',
    icon:  'wifi-outline',
    color: '#6b7280',
    bg:    '#f3f4f6',
  },
}

const ESTADO_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  enviada:   { label: 'Activa',    color: '#dc2626', bg: '#fef2f2' },
  pendiente: { label: 'Pendiente', color: '#d97706', bg: '#fffbeb' },
  resuelta:  { label: 'Resuelta',  color: '#16a34a', bg: '#f0fdf4' },
  fallida:   { label: 'Fallida',   color: '#6b7280', bg: '#f3f4f6' },
}

// ── Card individual ───────────────────────────────────────────────────────────

function AlertaCard({
  item,
  esFamiliar,
  resolviendo,
  onResolver,
}: {
  item: any
  esFamiliar: boolean
  resolviendo: string | null
  onResolver: (id: string) => void
}) {
  const tipo = TIPO_CONFIG[item.tipo] ?? {
    label: item.tipo?.replace(/_/g, ' ') ?? '—',
    icon:  'alert-circle-outline' as IoniconsName,
    color: '#6b7280',
    bg:    '#f3f4f6',
  }
  const estado = ESTADO_CONFIG[item.estado] ?? {
    label: item.estado,
    color: '#6b7280',
    bg:    '#f3f4f6',
  }

  const formatFecha = (iso: string) =>
    new Date(iso).toLocaleString('es-CO', {
      day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit',
    })

  return (
    <View style={styles.card}>
      {/* Cabecera: ícono tipo + paciente + badge estado */}
      <View style={styles.cardHead}>
        <View style={[styles.tipoIconWrap, { backgroundColor: tipo.bg }]}>
          <Ionicons name={tipo.icon} size={20} color={tipo.color} />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.pacienteNombre} numberOfLines={1}>
            {item.paciente_nombre}
          </Text>
          <Text style={[styles.tipoLabel, { color: tipo.color }]}>{tipo.label}</Text>
        </View>

        <View style={[styles.estadoBadge, { backgroundColor: estado.bg }]}>
          <View style={[styles.estadoDot, { backgroundColor: estado.color }]} />
          <Text style={[styles.estadoText, { color: estado.color }]}>{estado.label}</Text>
        </View>
      </View>

      {/* Separador */}
      <View style={styles.sep} />

      {/* Meta: fecha y zona */}
      <View style={styles.metaFila}>
        <Ionicons name="time-outline" size={13} color={Colors.textSecondary} />
        <Text style={styles.metaText}>{formatFecha(item.timestamp)}</Text>
      </View>

      {item.zona_nombre ? (
        <View style={[styles.metaFila, { marginTop: 6 }]}>
          <Ionicons name="location-outline" size={13} color={Colors.textSecondary} />
          <Text style={styles.metaText}>{item.zona_nombre}</Text>
        </View>
      ) : null}

      {/* Botón resolver: solo cuidador, solo estado "enviada" */}
      {item.estado === 'enviada' && !esFamiliar ? (
        <TouchableOpacity
          style={[styles.resolverBtn, resolviendo === item.id && { opacity: 0.7 }]}
          onPress={() => onResolver(item.id)}
          disabled={!!resolviendo}
          activeOpacity={0.85}
        >
          {resolviendo === item.id ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <>
              <Ionicons
                name="checkmark-circle-outline"
                size={16}
                color={Colors.white}
                style={{ marginRight: 6 }}
              />
              <Text style={styles.resolverBtnText}>Marcar como resuelta</Text>
            </>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

// ── Pantalla principal ────────────────────────────────────────────────────────

export default function AlertasScreen() {
  const navigation      = useNavigation()
  const { tipoUsuario } = useAuth()
  const esFamiliar      = tipoUsuario === 'familiar'

  const [alertas,     setAlertas]     = useState<any[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [resolviendo, setResolviendo] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res   = esFamiliar
        ? await alertaService.listarFamiliar()
        : await alertaService.listar()
      const lista = Array.isArray(res.data) ? res.data : []
      setAlertas(
        lista.sort(
          (a: any, b: any) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )
      )
    } catch {
      setError('No se pudieron cargar las alertas.')
    } finally {
      setLoading(false)
    }
  }, [esFamiliar])

  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  const handleResolver = async (id: string) => {
    setResolviendo(id)
    try {
      await alertaService.resolver(id)
      await cargar()
    } finally {
      setResolviendo(null)
    }
  }

  return (
    <AnimatedScreen>
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {/* ── Header navy ── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.menuBtn}
          onPress={() => (navigation as any).openDrawer()}
          activeOpacity={0.8}
        >
          <Ionicons name="menu" size={24} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Historial de alertas</Text>
      </View>

      {/* ── Contenido ── */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator style={{ marginTop: 48 }} size="large" color={Colors.primary} />
        ) : error ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="cloud-offline-outline" size={52} color={Colors.border} />
            <Text style={styles.emptyTitle}>Sin conexión</Text>
            <Text style={styles.emptyDesc}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={cargar} activeOpacity={0.85}>
              <Text style={styles.retryText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : alertas.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="notifications-off-outline" size={52} color={Colors.border} />
            <Text style={styles.emptyTitle}>Sin alertas</Text>
            <Text style={styles.emptyDesc}>No hay alertas registradas aún.</Text>
          </View>
        ) : (
          alertas.map((item) => (
            <AlertaCard
              key={item.id}
              item={item}
              esFamiliar={esFamiliar}
              resolviendo={resolviendo}
              onResolver={handleResolver}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
    </AnimatedScreen>
  )
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#102e50' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 18, gap: 12,
  },
  menuBtn: {
    width: 40, height: 40, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '700', color: Colors.white },

  content:       { flex: 1, backgroundColor: '#f7fbfc' },
  scrollContent: { padding: 16, paddingBottom: 32 },

  /* ── Card ── */
  card: {
    backgroundColor: Colors.white,
    borderRadius: 20, padding: 18, marginBottom: 14,
    elevation: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)',
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },

  tipoIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },

  pacienteNombre: { fontSize: 15, fontWeight: '700', color: '#102e50' },
  tipoLabel:      { fontSize: 12, fontWeight: '600', marginTop: 2 },

  estadoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
    flexShrink: 0,
  },
  estadoDot:  { width: 6, height: 6, borderRadius: 3 },
  estadoText: { fontSize: 11, fontWeight: '700' },

  sep: { height: 1, backgroundColor: '#f0f4f8', marginVertical: 14 },

  metaFila: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 12, color: Colors.textSecondary },

  resolverBtn: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#102e50', borderRadius: 12,
    paddingVertical: 11, marginTop: 14, elevation: 2,
  },
  resolverBtnText: { color: Colors.white, fontWeight: '700', fontSize: 13 },

  /* ── Estado vacío / error ── */
  emptyWrap:  { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.text, marginTop: 16, marginBottom: 8 },
  emptyDesc:  { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  retryBtn:   {
    marginTop: 20, backgroundColor: '#102e50',
    borderRadius: 12, paddingHorizontal: 28, paddingVertical: 12,
  },
  retryText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
})
