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

type Tab = 'cuidadores' | 'familiares'

type Cuidador = {
  id: string
  nombre: string
  email: string
  phone?: string
  activo: boolean
  fecha_creacion: string
  total_pacientes: number
}

type Familiar = {
  id: string
  nombre: string
  email: string
  telefono?: string
  activo: boolean
  fecha_creacion: string
  total_grupos: number
}

function CuidadorCard({
  item, onToggle, toggling,
}: {
  item: Cuidador
  onToggle: (item: Cuidador) => void
  toggling: string | null
}) {
  const inicial = item.nombre?.charAt(0)?.toUpperCase() ?? '?'

  return (
    <View style={[styles.card, !item.activo && styles.cardInactivo]}>
      <View style={styles.cardHead}>
        <View style={[styles.avatar, { backgroundColor: '#e8eef5' }, !item.activo && styles.avatarInactivo]}>
          <Text style={[styles.avatarText, { color: '#102e50' }, !item.activo && { color: Colors.textSecondary }]}>
            {inicial}
          </Text>
        </View>

        <View style={{ flex: 1 }}>
          <View style={styles.nombreRow}>
            <Text style={[styles.cardNombre, !item.activo && styles.textoInactivo]} numberOfLines={1}>
              {item.nombre}
            </Text>
            <View style={[styles.estadoBadge, item.activo ? styles.badgeActivo : styles.badgeInactivo]}>
              <View style={[styles.estadoDot, { backgroundColor: item.activo ? Colors.success : Colors.textSecondary }]} />
              <Text style={[styles.estadoText, { color: item.activo ? Colors.success : Colors.textSecondary }]}>
                {item.activo ? 'Activo' : 'Inactivo'}
              </Text>
            </View>
          </View>
          <Text style={styles.cardEmail} numberOfLines={1}>{item.email}</Text>
        </View>
      </View>

      <View style={styles.sep} />

      <View style={styles.infoFila}>
        <Ionicons name="people-circle-outline" size={14} color={Colors.textSecondary} />
        <Text style={styles.infoText}>{item.total_pacientes} paciente{item.total_pacientes !== 1 ? 's' : ''}</Text>
        {item.phone ? (
          <>
            <View style={styles.infoDivider} />
            <Ionicons name="call-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.infoText}>{item.phone}</Text>
          </>
        ) : null}
      </View>

      <TouchableOpacity
        style={[
          styles.toggleBtn,
          item.activo ? styles.toggleBtnDesactivar : styles.toggleBtnActivar,
          toggling === item.id && { opacity: 0.6 },
        ]}
        onPress={() => onToggle(item)}
        disabled={toggling === item.id}
        activeOpacity={0.85}
      >
        {toggling === item.id ? (
          <ActivityIndicator size="small" color={item.activo ? Colors.error : Colors.success} />
        ) : (
          <>
            <Ionicons
              name={item.activo ? 'close-circle-outline' : 'checkmark-circle-outline'}
              size={16}
              color={item.activo ? Colors.error : Colors.success}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.toggleBtnText, { color: item.activo ? Colors.error : Colors.success }]}>
              {item.activo ? 'Desactivar cuenta' : 'Activar cuenta'}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  )
}

function FamiliarCard({
  item, onToggle, toggling,
}: {
  item: Familiar
  onToggle: (item: Familiar) => void
  toggling: string | null
}) {
  const inicial = item.nombre?.charAt(0)?.toUpperCase() ?? '?'

  return (
    <View style={[styles.card, !item.activo && styles.cardInactivo]}>
      <View style={styles.cardHead}>
        <View style={[styles.avatar, { backgroundColor: '#f0fdf4' }, !item.activo && styles.avatarInactivo]}>
          <Text style={[styles.avatarText, { color: '#16a34a' }, !item.activo && { color: Colors.textSecondary }]}>
            {inicial}
          </Text>
        </View>

        <View style={{ flex: 1 }}>
          <View style={styles.nombreRow}>
            <Text style={[styles.cardNombre, !item.activo && styles.textoInactivo]} numberOfLines={1}>
              {item.nombre}
            </Text>
            <View style={[styles.estadoBadge, item.activo ? styles.badgeActivo : styles.badgeInactivo]}>
              <View style={[styles.estadoDot, { backgroundColor: item.activo ? Colors.success : Colors.textSecondary }]} />
              <Text style={[styles.estadoText, { color: item.activo ? Colors.success : Colors.textSecondary }]}>
                {item.activo ? 'Activo' : 'Inactivo'}
              </Text>
            </View>
          </View>
          <Text style={styles.cardEmail} numberOfLines={1}>{item.email}</Text>
        </View>
      </View>

      <View style={styles.sep} />

      <View style={styles.infoFila}>
        <Ionicons name="people-outline" size={14} color={Colors.textSecondary} />
        <Text style={styles.infoText}>{item.total_grupos} grupo{item.total_grupos !== 1 ? 's' : ''}</Text>
        {item.telefono ? (
          <>
            <View style={styles.infoDivider} />
            <Ionicons name="call-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.infoText}>{item.telefono}</Text>
          </>
        ) : null}
      </View>

      <TouchableOpacity
        style={[
          styles.toggleBtn,
          item.activo ? styles.toggleBtnDesactivar : styles.toggleBtnActivar,
          toggling === item.id && { opacity: 0.6 },
        ]}
        onPress={() => onToggle(item)}
        disabled={toggling === item.id}
        activeOpacity={0.85}
      >
        {toggling === item.id ? (
          <ActivityIndicator size="small" color={item.activo ? Colors.error : Colors.success} />
        ) : (
          <>
            <Ionicons
              name={item.activo ? 'close-circle-outline' : 'checkmark-circle-outline'}
              size={16}
              color={item.activo ? Colors.error : Colors.success}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.toggleBtnText, { color: item.activo ? Colors.error : Colors.success }]}>
              {item.activo ? 'Desactivar cuenta' : 'Activar cuenta'}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  )
}

export default function AdminUsuariosScreen() {
  const router                        = useRouter()
  const [tab,        setTab]          = useState<Tab>('cuidadores')
  const [cuidadores, setCuidadores]   = useState<Cuidador[]>([])
  const [familiares, setFamiliares]   = useState<Familiar[]>([])
  const [loading,    setLoading]      = useState(true)
  const [error,      setError]        = useState('')
  const [toggling,   setToggling]     = useState<string | null>(null)
  const [exito,      setExito]        = useState('')

  const mostrarExito = (msg: string) => {
    setExito(msg)
    setTimeout(() => setExito(''), 3000)
  }

  const cargar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [resCuidadores, resFamiliares] = await Promise.all([
        adminService.cuidadores(),
        adminService.familiares(),
      ])
      setCuidadores(Array.isArray(resCuidadores.data) ? resCuidadores.data : [])
      setFamiliares(Array.isArray(resFamiliares.data) ? resFamiliares.data : [])
    } catch {
      setError('No se pudieron cargar los usuarios.')
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  const handleToggleCuidador = (item: Cuidador) => {
    const accion  = item.activo ? 'desactivar' : 'activar'
    const mensaje = item.activo
      ? `¿Desactivar la cuenta de ${item.nombre}? No podrá iniciar sesión.`
      : `¿Activar la cuenta de ${item.nombre}?`

    Alert.alert(
      `${accion.charAt(0).toUpperCase() + accion.slice(1)} cuenta`,
      mensaje,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: item.activo ? 'Desactivar' : 'Activar',
          style: item.activo ? 'destructive' : 'default',
          onPress: async () => {
            setToggling(item.id)
            try {
              await adminService.cambiarEstadoCuidador(item.id, !item.activo)
              await cargar()
              mostrarExito(`Cuenta ${item.activo ? 'desactivada' : 'activada'} correctamente.`)
            } catch {
              Alert.alert('Error', 'No se pudo actualizar el estado de la cuenta.')
            } finally {
              setToggling(null)
            }
          },
        },
      ]
    )
  }

  const handleToggleFamiliar = (item: Familiar) => {
    const accion  = item.activo ? 'desactivar' : 'activar'
    const mensaje = item.activo
      ? `¿Desactivar la cuenta de ${item.nombre}? No podrá iniciar sesión.`
      : `¿Activar la cuenta de ${item.nombre}?`

    Alert.alert(
      `${accion.charAt(0).toUpperCase() + accion.slice(1)} cuenta`,
      mensaje,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: item.activo ? 'Desactivar' : 'Activar',
          style: item.activo ? 'destructive' : 'default',
          onPress: async () => {
            setToggling(item.id)
            try {
              await adminService.cambiarEstadoFamiliar(item.id, !item.activo)
              await cargar()
              mostrarExito(`Cuenta ${item.activo ? 'desactivada' : 'activada'} correctamente.`)
            } catch {
              Alert.alert('Error', 'No se pudo actualizar el estado de la cuenta.')
            } finally {
              setToggling(null)
            }
          },
        },
      ]
    )
  }

  const listaActiva = tab === 'cuidadores' ? cuidadores : familiares

  return (
    <AnimatedScreen>
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>

        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={22} color={Colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Usuarios</Text>
          <TouchableOpacity style={styles.reloadBtn} onPress={cargar} activeOpacity={0.8}>
            <Ionicons name="refresh-outline" size={22} color={Colors.white} />
          </TouchableOpacity>
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
            <View style={styles.tabRow}>
              <TouchableOpacity
                style={[styles.tabChip, tab === 'cuidadores' && styles.tabChipActiva]}
                onPress={() => setTab('cuidadores')}
                activeOpacity={0.85}
              >
                <Ionicons name="people-circle-outline" size={16} color={tab === 'cuidadores' ? Colors.primary : Colors.textSecondary} />
                <Text style={[styles.tabText, tab === 'cuidadores' && styles.tabTextActiva]}>Cuidadores</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabChip, tab === 'familiares' && styles.tabChipActiva]}
                onPress={() => setTab('familiares')}
                activeOpacity={0.85}
              >
                <Ionicons name="people-outline" size={16} color={tab === 'familiares' ? Colors.primary : Colors.textSecondary} />
                <Text style={[styles.tabText, tab === 'familiares' && styles.tabTextActiva]}>Familiares</Text>
              </TouchableOpacity>
            </View>

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
            ) : listaActiva.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="people-outline" size={52} color={Colors.border} />
                <Text style={styles.emptyTitle}>{tab === 'cuidadores' ? 'Sin cuidadores' : 'Sin familiares'}</Text>
                <Text style={styles.emptyDesc}>
                  {tab === 'cuidadores' ? 'No hay cuidadores registrados aún.' : 'No hay familiares registrados aún.'}
                </Text>
              </View>
            ) : tab === 'cuidadores' ? (
              cuidadores.map(item => (
                <CuidadorCard key={item.id} item={item} onToggle={handleToggleCuidador} toggling={toggling} />
              ))
            ) : (
              familiares.map(item => (
                <FamiliarCard key={item.id} item={item} onToggle={handleToggleFamiliar} toggling={toggling} />
              ))
            )}
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
  backBtn:    { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  headerTitle:{ flex: 1, fontSize: 20, fontWeight: '700', color: Colors.white },
  reloadBtn:  { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },

  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tabChip: {
    flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6,
    backgroundColor: Colors.white, borderRadius: 12, paddingVertical: 11,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  tabChipActiva: { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },
  tabText:       { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  tabTextActiva: { color: Colors.primary },

  card: {
    backgroundColor: Colors.white, borderRadius: 20, padding: 18, marginBottom: 14,
    elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)',
  },
  cardInactivo: { opacity: 0.75 },

  cardHead:   { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar:     { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center' },
  avatarInactivo: { backgroundColor: '#f1f5f9' },
  avatarText: { fontSize: 20, fontWeight: '700' },

  nombreRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  cardNombre: { fontSize: 15, fontWeight: '700', color: '#102e50', flexShrink: 1 },
  textoInactivo: { color: Colors.textSecondary },
  cardEmail:  { fontSize: 12, color: Colors.textSecondary, marginTop: 3 },

  estadoBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  badgeActivo:  { backgroundColor: '#f0fdf4' },
  badgeInactivo:{ backgroundColor: '#f1f5f9' },
  estadoDot:   { width: 6, height: 6, borderRadius: 3 },
  estadoText:  { fontSize: 10, fontWeight: '700' },

  sep: { height: 1, backgroundColor: '#f0f4f8', marginVertical: 14 },

  infoFila:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoText:    { fontSize: 12, color: Colors.textSecondary },
  infoDivider: { width: 1, height: 12, backgroundColor: Colors.border, marginHorizontal: 4 },

  toggleBtn: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    borderRadius: 12, paddingVertical: 11, marginTop: 14,
    borderWidth: 1.5,
  },
  toggleBtnDesactivar: { borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  toggleBtnActivar:    { borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' },
  toggleBtnText:       { fontSize: 13, fontWeight: '700' },

  emptyWrap:  { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.text, marginTop: 16, marginBottom: 8 },
  emptyDesc:  { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  retryBtn:   { marginTop: 20, backgroundColor: '#102e50', borderRadius: 12, paddingHorizontal: 28, paddingVertical: 12 },
  retryText:  { color: Colors.white, fontWeight: '700', fontSize: 14 },

  successBox:  { position: 'absolute', top: 16, left: 16, right: 16, zIndex: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', borderRadius: 12, padding: 14, borderLeftWidth: 4, borderLeftColor: Colors.success, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
  successText: { flex: 1, color: '#065f46', fontSize: 13, lineHeight: 19 },
})
