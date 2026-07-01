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
import AnimatedScreen from '@/components/AnimatedScreen'

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

type Estado = 'recibido' | 'en_revision' | 'solucionado'

type Reporte = {
  id: string
  remitente_nombre: string
  remitente_tipo: 'cuidador' | 'familiar'
  descripcion: string
  id_dispositivo?: string | null
  creado_en: string
  actualizado_en: string
}

type Reportes = {
  recibidos:    Reporte[]
  en_revision:  Reporte[]
  solucionados: Reporte[]
}

const ESTADO_CONFIG: Record<Estado, { label: string; color: string; bg: string; icon: IoniconsName }> = {
  recibido:    { label: 'Llegada',    color: '#dc2626', bg: '#fef2f2', icon: 'mail-unread-outline' },
  en_revision: { label: 'En revisión',color: Colors.warning, bg: '#fffbeb', icon: 'construct-outline' },
  solucionado: { label: 'Solucionado',color: Colors.success, bg: '#f0fdf4', icon: 'checkmark-done-outline' },
}

function ReporteCard({
  item, estado, onCambiarEstado, procesando,
}: {
  item: Reporte
  estado: Estado
  onCambiarEstado: (id: string, nuevoEstado: Estado) => void
  procesando: string | null
}) {
  const cfg = ESTADO_CONFIG[estado]

  const formatFecha = (iso?: string) =>
    iso ? new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

  const siguienteAccion =
    estado === 'recibido'    ? { label: 'Marcar en revisión', destino: 'en_revision' as Estado, icon: 'construct-outline' as IoniconsName } :
    estado === 'en_revision' ? { label: 'Marcar solucionado', destino: 'solucionado' as Estado, icon: 'checkmark-circle-outline' as IoniconsName } :
    { label: 'Reabrir', destino: 'en_revision' as Estado, icon: 'refresh-outline' as IoniconsName }

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={[styles.iconWrap, { backgroundColor: cfg.bg }]}>
          <Ionicons name={cfg.icon} size={18} color={cfg.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.remitenteNombre} numberOfLines={1}>{item.remitente_nombre}</Text>
          <Text style={styles.remitenteRol}>{item.remitente_tipo === 'familiar' ? 'Familiar' : 'Cuidador'}</Text>
        </View>
        <View style={[styles.estadoBadge, { backgroundColor: cfg.bg }]}>
          <Text style={[styles.estadoText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>

      <Text style={styles.descripcion}>{item.descripcion}</Text>

      {item.id_dispositivo ? (
        <View style={styles.dispositivoBox}>
          <Ionicons name="hardware-chip-outline" size={14} color="#7c3aed" />
          <Text style={styles.dispositivoText}>Dispositivo dañado: {item.id_dispositivo}</Text>
        </View>
      ) : null}

      <View style={styles.fechaFila}>
        <Ionicons name="time-outline" size={13} color={Colors.textSecondary} />
        <Text style={styles.fechaText}>{formatFecha(item.creado_en)}</Text>
      </View>

      <TouchableOpacity
        style={[styles.accionBtn, procesando === item.id && { opacity: 0.6 }]}
        onPress={() => onCambiarEstado(item.id, siguienteAccion.destino)}
        disabled={procesando === item.id}
        activeOpacity={0.85}
      >
        {procesando === item.id ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : (
          <>
            <Ionicons name={siguienteAccion.icon} size={15} color={Colors.primary} style={{ marginRight: 6 }} />
            <Text style={styles.accionBtnText}>{siguienteAccion.label}</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  )
}

function SeccionReportes({
  titulo, items, estado, onCambiarEstado, procesando,
}: {
  titulo: string; items: Reporte[]; estado: Estado
  onCambiarEstado: (id: string, nuevoEstado: Estado) => void
  procesando: string | null
}) {
  if (items.length === 0) return null
  return (
    <>
      <Text style={styles.seccionLabel}>{titulo} ({items.length})</Text>
      {items.map(item => (
        <ReporteCard key={item.id} item={item} estado={estado} onCambiarEstado={onCambiarEstado} procesando={procesando} />
      ))}
    </>
  )
}

export default function AdminReportesScreen() {
  const router                      = useRouter()
  const [reportes,  setReportes]    = useState<Reportes | null>(null)
  const [loading,   setLoading]     = useState(true)
  const [error,     setError]       = useState('')
  const [procesando,setProcesando]  = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await adminService.reportes()
      setReportes(res.data)
    } catch {
      setError('No se pudieron cargar los reportes.')
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  const handleCambiarEstado = (id: string, nuevoEstado: Estado) => {
    const label = ESTADO_CONFIG[nuevoEstado].label
    Alert.alert('Cambiar estado', `¿Marcar este reporte como "${label}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Confirmar',
        onPress: async () => {
          setProcesando(id)
          try {
            await adminService.cambiarEstadoReporte(id, nuevoEstado)
            await cargar()
          } catch {
            Alert.alert('Error', 'No se pudo actualizar el reporte.')
          } finally {
            setProcesando(null)
          }
        },
      },
    ])
  }

  const total = reportes
    ? reportes.recibidos.length + reportes.en_revision.length + reportes.solucionados.length
    : 0

  return (
    <AnimatedScreen>
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>

        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={22} color={Colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Reportes</Text>
        </View>

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
          ) : total === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="flag-outline" size={52} color={Colors.border} />
              <Text style={styles.emptyTitle}>Sin reportes</Text>
              <Text style={styles.emptyDesc}>
                Los problemas reportados por cuidadores y familiares aparecerán aquí.
              </Text>
            </View>
          ) : reportes ? (
            <>
              <SeccionReportes titulo="Llegadas"      items={reportes.recibidos}    estado="recibido"    onCambiarEstado={handleCambiarEstado} procesando={procesando} />
              <SeccionReportes titulo="En revisión"    items={reportes.en_revision}  estado="en_revision"  onCambiarEstado={handleCambiarEstado} procesando={procesando} />
              <SeccionReportes titulo="Solucionadas"   items={reportes.solucionados} estado="solucionado"  onCambiarEstado={handleCambiarEstado} procesando={procesando} />
            </>
          ) : null}
        </ScrollView>

      </SafeAreaView>
    </AnimatedScreen>
  )
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#102e50' },
  content: { flex: 1, backgroundColor: '#f7fbfc' },
  scrollContent: { padding: 16, paddingBottom: 32 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 18, gap: 12,
  },
  backBtn:     { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '700', color: Colors.white },

  seccionLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, marginTop: 4,
  },

  card: {
    backgroundColor: Colors.white, borderRadius: 20, padding: 16, marginBottom: 12,
    elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)',
  },

  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
  remitenteNombre: { fontSize: 14, fontWeight: '700', color: '#102e50' },
  remitenteRol:    { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },

  estadoBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  estadoText:  { fontSize: 11, fontWeight: '700' },

  descripcion: { fontSize: 13, color: Colors.text, lineHeight: 19, marginTop: 12 },

  dispositivoBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#f5f3ff', borderRadius: 10, padding: 10, marginTop: 10,
  },
  dispositivoText: { fontSize: 12, color: '#7c3aed', fontWeight: '600' },

  fechaFila: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  fechaText: { fontSize: 12, color: Colors.textSecondary },

  accionBtn: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    borderRadius: 10, paddingVertical: 9, marginTop: 12, borderWidth: 1.5,
    borderColor: Colors.primaryPale, backgroundColor: Colors.primaryBg,
  },
  accionBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },

  emptyWrap:  { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.text, marginTop: 16, marginBottom: 8 },
  emptyDesc:  { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  retryBtn:   { marginTop: 20, backgroundColor: '#102e50', borderRadius: 12, paddingHorizontal: 28, paddingVertical: 12 },
  retryText:  { color: Colors.white, fontWeight: '700', fontSize: 14 },
})
