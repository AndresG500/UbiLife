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

type Dispositivo = {
  id_dispositivo: string
  paciente_id?: string
  ultima_conexion?: string
  detectado_en?: string
  bloqueado_en?: string
  bloqueado?: boolean
}

type Inventario = {
  vinculados:  Dispositivo[]
  libres:      Dispositivo[]
  disponibles: Dispositivo[]
  bloqueados:  Dispositivo[]
}

const ESTADO_CONFIG: Record<string, { label: string; color: string; bg: string; icon: IoniconsName }> = {
  vinculado:   { label: 'Vinculado',   color: '#0369a1', bg: '#e0f2fe', icon: 'link' },
  disponible:  { label: 'Disponible',  color: Colors.success, bg: '#f0fdf4', icon: 'radio-outline' },
  libre:       { label: 'Libre',       color: Colors.textSecondary, bg: '#f1f5f9', icon: 'hardware-chip-outline' },
  bloqueado:   { label: 'Bloqueado',   color: Colors.error, bg: '#fef2f2', icon: 'ban-outline' },
}

function DispositivoCard({
  item,
  estado,
  onBloquear,
  bloqueando,
}: {
  item: Dispositivo
  estado: keyof typeof ESTADO_CONFIG
  onBloquear: (id: string, yaEstaBloqueado: boolean) => void
  bloqueando: string | null
}) {
  const cfg        = ESTADO_CONFIG[estado]
  const esBloqueado = estado === 'bloqueado'

  const formatFecha = (iso?: string) =>
    iso ? new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

  return (
    <View style={[styles.card, esBloqueado && styles.cardBloqueado]}>
      <View style={styles.cardHead}>
        <View style={[styles.deviceIconWrap, { backgroundColor: cfg.bg }]}>
          <Ionicons name={cfg.icon} size={20} color={cfg.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.deviceId} numberOfLines={1}>{item.id_dispositivo}</Text>
        </View>
        <View style={[styles.estadoBadge, { backgroundColor: cfg.bg }]}>
          <Text style={[styles.estadoText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>

      {(item.ultima_conexion || item.detectado_en || item.bloqueado_en) && (
        <View style={styles.fechaFila}>
          <Ionicons name="time-outline" size={13} color={Colors.textSecondary} />
          <Text style={styles.fechaText}>
            {item.ultima_conexion
              ? `Última conexión: ${formatFecha(item.ultima_conexion)}`
              : item.detectado_en
              ? `Detectado: ${formatFecha(item.detectado_en)}`
              : `Bloqueado: ${formatFecha(item.bloqueado_en)}`}
          </Text>
        </View>
      )}

      {/* Botón bloquear/desbloquear (no aplica a "disponibles" que pueden estar en proceso de vinculación) */}
      {estado !== 'disponible' && (
        <TouchableOpacity
          style={[
            styles.bloquearBtn,
            esBloqueado ? styles.bloquearBtnDesbloquear : styles.bloquearBtnBloquear,
            bloqueando === item.id_dispositivo && { opacity: 0.6 },
          ]}
          onPress={() => onBloquear(item.id_dispositivo, esBloqueado)}
          disabled={bloqueando === item.id_dispositivo}
          activeOpacity={0.85}
        >
          {bloqueando === item.id_dispositivo ? (
            <ActivityIndicator size="small" color={esBloqueado ? Colors.success : Colors.error} />
          ) : (
            <>
              <Ionicons
                name={esBloqueado ? 'checkmark-circle-outline' : 'ban-outline'}
                size={15}
                color={esBloqueado ? Colors.success : Colors.error}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.bloquearBtnText, { color: esBloqueado ? Colors.success : Colors.error }]}>
                {esBloqueado ? 'Desbloquear' : 'Bloquear'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  )
}

function SeccionDispositivos({
  titulo, items, estado, onBloquear, bloqueando,
}: {
  titulo: string; items: Dispositivo[]; estado: keyof typeof ESTADO_CONFIG
  onBloquear: (id: string, yaEstaBloqueado: boolean) => void
  bloqueando: string | null
}) {
  if (items.length === 0) return null
  return (
    <>
      <Text style={styles.seccionLabel}>{titulo} ({items.length})</Text>
      {items.map(item => (
        <DispositivoCard
          key={item.id_dispositivo}
          item={item}
          estado={estado}
          onBloquear={onBloquear}
          bloqueando={bloqueando}
        />
      ))}
    </>
  )
}

export default function AdminDispositivosScreen() {
  const router                            = useRouter()
  const [inventario,  setInventario]      = useState<Inventario | null>(null)
  const [loading,     setLoading]         = useState(true)
  const [error,       setError]           = useState('')
  const [bloqueando,  setBloqueando]      = useState<string | null>(null)
  const [exito,       setExito]           = useState('')

  const mostrarExito = (msg: string) => {
    setExito(msg)
    setTimeout(() => setExito(''), 3000)
  }

  const cargar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await adminService.dispositivos()
      setInventario(res.data)
    } catch {
      setError('No se pudo cargar el inventario de dispositivos.')
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  const handleBloquear = (id: string, yaEstaBloqueado: boolean) => {
    const accion = yaEstaBloqueado ? 'desbloquear' : 'bloquear'
    Alert.alert(
      `${accion.charAt(0).toUpperCase() + accion.slice(1)} dispositivo`,
      `¿${accion.charAt(0).toUpperCase() + accion.slice(1)} el dispositivo "${id}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: yaEstaBloqueado ? 'Desbloquear' : 'Bloquear',
          style: yaEstaBloqueado ? 'default' : 'destructive',
          onPress: async () => {
            setBloqueando(id)
            try {
              const res = await adminService.bloquearDispositivo(id)
              await cargar()
              mostrarExito(res.data?.mensaje ?? 'Estado actualizado.')
            } catch {
              Alert.alert('Error', 'No se pudo actualizar el dispositivo.')
            } finally {
              setBloqueando(null)
            }
          },
        },
      ]
    )
  }

  const totalDispositivos = inventario
    ? inventario.vinculados.length + inventario.libres.length + inventario.disponibles.length + inventario.bloqueados.length
    : 0

  return (
    <AnimatedScreen>
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={22} color={Colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Dispositivos</Text>
        </View>

        <View style={{ flex: 1 }}>
          {exito ? (
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle-outline" size={15} color={Colors.success} style={{ marginRight: 6 }} />
              <Text style={styles.successText}>{exito}</Text>
            </View>
          ) : null}

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
            ) : totalDispositivos === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="hardware-chip-outline" size={52} color={Colors.border} />
                <Text style={styles.emptyTitle}>Sin dispositivos</Text>
                <Text style={styles.emptyDesc}>
                  Los dispositivos ESP32 aparecerán aquí automáticamente al conectarse por primera vez.
                </Text>
              </View>
            ) : inventario ? (
              <>
                <SeccionDispositivos titulo="Vinculados"  items={inventario.vinculados}  estado="vinculado"  onBloquear={handleBloquear} bloqueando={bloqueando} />
                <SeccionDispositivos titulo="Disponibles" items={inventario.disponibles} estado="disponible" onBloquear={handleBloquear} bloqueando={bloqueando} />
                <SeccionDispositivos titulo="Libres"      items={inventario.libres}      estado="libre"      onBloquear={handleBloquear} bloqueando={bloqueando} />
                <SeccionDispositivos titulo="Bloqueados"  items={inventario.bloqueados}  estado="bloqueado"  onBloquear={handleBloquear} bloqueando={bloqueando} />
              </>
            ) : null}
          </ScrollView>
        </View>

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
  cardBloqueado: { opacity: 0.8 },

  cardHead:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  deviceIconWrap:{ width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
  deviceId:      { fontSize: 14, fontWeight: '700', color: '#102e50' },

  estadoBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  estadoText:  { fontSize: 11, fontWeight: '700' },

  fechaFila: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  fechaText: { fontSize: 12, color: Colors.textSecondary },

  bloquearBtn: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    borderRadius: 10, paddingVertical: 9, marginTop: 12, borderWidth: 1.5,
  },
  bloquearBtnBloquear:    { borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  bloquearBtnDesbloquear: { borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' },
  bloquearBtnText:        { fontSize: 13, fontWeight: '700' },

  emptyWrap:  { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.text, marginTop: 16, marginBottom: 8 },
  emptyDesc:  { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  retryBtn:   { marginTop: 20, backgroundColor: '#102e50', borderRadius: 12, paddingHorizontal: 28, paddingVertical: 12 },
  retryText:  { color: Colors.white, fontWeight: '700', fontSize: 14 },

  successBox:  { position: 'absolute', top: 16, left: 16, right: 16, zIndex: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', borderRadius: 12, padding: 14, borderLeftWidth: 4, borderLeftColor: Colors.success, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
  successText: { flex: 1, color: '#065f46', fontSize: 13, lineHeight: 19 },
})
