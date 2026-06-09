import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, TextInput, Modal, ScrollView, RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import * as Location from 'expo-location'
import { useFocusEffect } from 'expo-router'
import { Colors } from '@/constants/Colors'
import { grupoService, pacienteService, familiarService } from '@/services/api'
import { useAuth } from '@/context/AuthContext'
import { enviarUbicacionFamiliar } from '@/services/ubicacion'
import { mensajeDeError } from '@/utils/errores'
import ConfirmModal from '@/components/ConfirmModal'
import AnimatedScreen from '@/components/AnimatedScreen'

interface Grupo {
  id:                    string
  nombre:                string
  cuidador_principal_id: string
  cuidador_ids:          string[]
  paciente_ids:          string[]
  familiar_ids:          string[]
  codigo:                string
  created_at:            string
}

interface MiembrosGrupo {
  pacientes:  any[]
  familiares: any[]
}

function formatCoord(ub: { latitud?: number; longitud?: number; lat?: number; lng?: number } | null | undefined): string | null {
  if (!ub) return null
  const lat = ub.latitud ?? ub.lat
  const lng = ub.longitud ?? ub.lng
  if (lat == null || lng == null) return null
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

function PacienteCard({ pac }: { pac: any }) {
  const coord = formatCoord(pac.ultima_ubicacion)
  return (
    <View style={styles.memberCard}>
      <View style={styles.memberIconPac}>
        <Ionicons name="person" size={18} color={Colors.primary} />
      </View>
      <View style={styles.memberInfo}>
        <Text style={styles.memberNombre}>{pac.nombre_paciente}</Text>
        {!!pac.enfermedad && (
          <Text style={styles.memberSub}>{pac.enfermedad}</Text>
        )}
        {coord ? (
          <View style={styles.coordRow}>
            <Ionicons name="location" size={11} color={Colors.textSecondary} />
            <Text style={styles.coordText}>{coord}</Text>
          </View>
        ) : (
          <Text style={styles.sinUbi}>Sin ubicación reciente</Text>
        )}
      </View>
    </View>
  )
}

function FamiliarCard({ fam, esMismo }: { fam: any; esMismo?: boolean }) {
  const coord = formatCoord(fam.ultima_ubicacion)
  return (
    <View style={styles.memberCard}>
      <View style={styles.memberIconFam}>
        <Ionicons name="person" size={18} color="#9333ea" />
      </View>
      <View style={styles.memberInfo}>
        <Text style={styles.memberNombre}>
          {fam.name || fam.email}
          {esMismo && <Text style={styles.tuTag}> (Tú)</Text>}
        </Text>
        {coord ? (
          <View style={styles.coordRow}>
            <Ionicons name="location" size={11} color={Colors.textSecondary} />
            <Text style={styles.coordText}>{coord}</Text>
          </View>
        ) : (
          <Text style={styles.sinUbi}>Sin ubicación reciente</Text>
        )}
      </View>
    </View>
  )
}

export default function GrupoFamiliarScreen() {
  const router = useRouter()
  const { tipoUsuario, cuidador } = useAuth()
  const esFamiliar = tipoUsuario === 'familiar'

  const [loading,       setLoading]       = useState(true)
  const [grupos,        setGrupos]        = useState<Grupo[]>([])
  const [pacientes,     setPacientes]     = useState<any[]>([])
  const [miembrosMap,   setMiembrosMap]   = useState<Record<string, MiembrosGrupo>>({})
  const [modalCrear,    setModalCrear]    = useState(false)
  const [nombreNuevo,   setNombreNuevo]   = useState('')
  const [pacSelIds,     setPacSelIds]     = useState<string[]>([])
  const [guardando,     setGuardando]     = useState(false)
  const [modalUnirse,   setModalUnirse]   = useState(false)
  const [codigoInput,   setCodigoInput]   = useState('')
  const [uniendose,     setUniendose]     = useState(false)
  const [refreshing,    setRefreshing]    = useState(false)
  const [exito,         setExito]         = useState('')
  const [grupoAEliminar, setGrupoAEliminar] = useState<string | null>(null)

  const mostrarExito = useCallback((msg: string) => {
    setExito(msg)
    setTimeout(() => setExito(''), 3000)
  }, [])

  const cargarDatos = useCallback(async () => {
    try {
      let gruposList: Grupo[] = []

      if (esFamiliar) {
        const res = await familiarService.misGrupos()
        gruposList = Array.isArray(res.data) ? res.data : []
        setGrupos(gruposList)

        // Enviar ubicación actual del familiar antes de cargar miembros
        if (gruposList.length > 0) {
          try {
            const { status } = await Location.requestForegroundPermissionsAsync()
            if (status === 'granted') {
              const loc = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
              })
              await Promise.all(
                gruposList
                  .filter((g) => !!g.id)
                  .map((g) => enviarUbicacionFamiliar(g.id, loc.coords.latitude, loc.coords.longitude))
              )
            }
          } catch {}
        }
      } else {
        const [resG, resP] = await Promise.all([
          grupoService.listar(),
          pacienteService.listar(),
        ])
        gruposList = Array.isArray(resG.data) ? resG.data : []
        setGrupos(gruposList)
        setPacientes(Array.isArray(resP.data) ? resP.data : [])
      }

      // Cargar miembros para cada grupo
      const mapa: Record<string, MiembrosGrupo> = {}
      await Promise.all(
        gruposList.map(async (g) => {
          try {
            const res = esFamiliar
              ? await grupoService.miembrosFamiliar(g.id)
              : await grupoService.miembros(g.id)
            mapa[g.id] = res.data ?? { pacientes: [], familiares: [] }
          } catch {
            mapa[g.id] = { pacientes: [], familiares: [] }
          }
        })
      )
      setMiembrosMap(mapa)
    } catch (err) {
      console.error('Error cargando grupos:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [esFamiliar])

  useEffect(() => { cargarDatos() }, [cargarDatos])

  useFocusEffect(
    useCallback(() => { cargarDatos() }, [cargarDatos])
  )

  const handleCrearGrupo = async () => {
    if (!nombreNuevo.trim()) { Alert.alert('Falta el nombre', 'Escribe un nombre para el grupo.'); return }
    setGuardando(true)
    try {
      await grupoService.crear({ nombre: nombreNuevo.trim(), paciente_ids: pacSelIds })
      setModalCrear(false); setNombreNuevo(''); setPacSelIds([])
      await cargarDatos()
      mostrarExito('Grupo familiar creado correctamente.')
    } catch (err: any) {
      Alert.alert('Error al crear', mensajeDeError(err, 'No se pudo crear el grupo. Inténtalo de nuevo.'))
    } finally { setGuardando(false) }
  }

  const eliminarGrupo = (grupoId: string) => {
    setGrupoAEliminar(grupoId)
  }

  const confirmarEliminarGrupo = async () => {
    if (!grupoAEliminar) return
    const id = grupoAEliminar
    setGrupoAEliminar(null)
    try {
      await grupoService.eliminar(id)
      setGrupos((prev) => prev.filter((g) => g.id !== id))
      mostrarExito('Grupo eliminado correctamente.')
    } catch (err: any) {
      Alert.alert('Error al eliminar', mensajeDeError(err, 'No se pudo eliminar el grupo. Inténtalo de nuevo.'))
    }
  }

  const handleUnirse = async () => {
    if (!codigoInput.trim()) { Alert.alert('Falta el código', 'Ingresa el código de invitación.'); return }
    setUniendose(true)
    try {
      await grupoService.unirseConCodigo(codigoInput.trim())
      setModalUnirse(false); setCodigoInput('')
      await cargarDatos()
      mostrarExito('Te has unido al grupo familiar.')
    } catch (err: any) {
      Alert.alert('Código no válido', mensajeDeError(err, 'El código no es válido o ya expiró. Verifica e intenta de nuevo.'))
    } finally { setUniendose(false) }
  }

  const copiarCodigo = async (codigo: string) => {
    await Clipboard.setStringAsync(codigo)
    Alert.alert('Copiado', 'Código de invitación copiado al portapapeles.')
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      </SafeAreaView>
    )
  }

  return (
    <AnimatedScreen>
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Grupo familiar</Text>
        <TouchableOpacity
          onPress={() => esFamiliar ? setModalUnirse(true) : setModalCrear(true)}
          style={styles.addBtn} activeOpacity={0.7}
        >
          <Ionicons name="add" size={26} color={Colors.white} />
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
        contentContainerStyle={{ padding: 16, gap: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); cargarDatos() }}
            colors={[Colors.primary]}
          />
        }
      >
        {grupos.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="people-outline" size={48} color={Colors.primaryLight} />
            </View>
            <Text style={styles.emptyTitle}>Sin grupo familiar</Text>
            {esFamiliar ? (
              <>
                <Text style={styles.emptyDesc}>Aún no perteneces a ningún grupo. Ingresa el código que te compartió el cuidador.</Text>
                <TouchableOpacity style={styles.createBtn} onPress={() => setModalUnirse(true)} activeOpacity={0.85}>
                  <Ionicons name="key-outline" size={20} color={Colors.white} />
                  <Text style={styles.createBtnText}>Unirse con código</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={styles.emptyDesc}>Crea un grupo para compartir el cuidado con tu familia.{'\n'}Toca el botón + para comenzar.</Text>
            )}
          </View>
        ) : (
          grupos.map((grupo) => {
            const miembros = miembrosMap[grupo.id] ?? { pacientes: [], familiares: [] }
            return (
              <View key={grupo.id} style={styles.grupoCard}>
                {/* Cabecera del grupo */}
                <View style={styles.grupoHeader}>
                  <View style={styles.grupoIcon}>
                    <Ionicons name="people" size={24} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.grupoNombre}>{grupo.nombre}</Text>
                    <Text style={styles.grupoMeta}>
                      {grupo.cuidador_ids?.length ?? 0} cuidador(es) · {miembros.pacientes.length} paciente(s) · {miembros.familiares.length} familiar(es)
                    </Text>
                  </View>
                  {!esFamiliar && (
                    <TouchableOpacity onPress={() => eliminarGrupo(grupo.id)} style={{ padding: 4 }}>
                      <Ionicons name="trash-outline" size={20} color={Colors.error} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Código — solo cuidadores */}
                {!esFamiliar && (
                  <View style={styles.codigoBox}>
                    <View style={styles.codigoHeader}>
                      <Ionicons name="key" size={13} color={Colors.primary} />
                      <Text style={styles.codigoLabel}>Código de invitación</Text>
                    </View>
                    <View style={styles.codigoRow}>
                      <Text style={styles.codigoText}>{grupo.codigo ?? '—'}</Text>
                      <TouchableOpacity onPress={() => copiarCodigo(grupo.codigo)} style={styles.copyBtn}>
                        <Ionicons name="copy-outline" size={18} color={Colors.primary} />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.codigoHint}>Comparte este código con familiares para que puedan unirse</Text>
                  </View>
                )}

                {/* Pacientes */}
                {miembros.pacientes.length > 0 && (
                  <View style={styles.seccion}>
                    <View style={styles.seccionHeader}>
                      <Ionicons name="person" size={13} color={Colors.primary} />
                      <Text style={styles.seccionLabel}>PACIENTES</Text>
                    </View>
                    {miembros.pacientes.map((p) => (
                      <PacienteCard key={p.id} pac={p} />
                    ))}
                  </View>
                )}

                {/* Familiares */}
                {miembros.familiares.length > 0 && (
                  <View style={styles.seccion}>
                    <View style={styles.seccionHeader}>
                      <Ionicons name="people" size={13} color="#9333ea" />
                      <Text style={[styles.seccionLabel, { color: '#9333ea' }]}>FAMILIARES</Text>
                    </View>
                    {miembros.familiares.map((f) => (
                      <FamiliarCard
                        key={f.id}
                        fam={f}
                        esMismo={f.id === cuidador?.id || f.email === cuidador?.email}
                      />
                    ))}
                  </View>
                )}
              </View>
            )
          })
        )}
        </ScrollView>
      </View>

      <ConfirmModal
        visible={!!grupoAEliminar}
        titulo="Eliminar grupo familiar"
        mensaje="¿Estás seguro de que quieres eliminar este grupo? Los miembros perderán el acceso."
        textoConfirm="Eliminar"
        onCancel={() => setGrupoAEliminar(null)}
        onConfirm={confirmarEliminarGrupo}
        destructivo
      />

      {/* Modal: unirse */}
      <Modal visible={modalUnirse} transparent animationType="slide" onRequestClose={() => setModalUnirse(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setModalUnirse(false)}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Unirse a un grupo</Text>
            <Text style={styles.fieldLabel}>Código de invitación</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="key-outline" size={20} color={Colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Ej: FAM-ABC123"
                placeholderTextColor={Colors.textSecondary}
                value={codigoInput}
                onChangeText={(t) => setCodigoInput(t.toUpperCase())}
                autoCapitalize="characters"
              />
            </View>
            <TouchableOpacity style={[styles.modalBtn, uniendose && { opacity: 0.65 }]} onPress={handleUnirse} disabled={uniendose} activeOpacity={0.85}>
              {uniendose ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.modalBtnText}>Unirse</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal: crear grupo */}
      <Modal visible={modalCrear} transparent animationType="slide" onRequestClose={() => setModalCrear(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setModalCrear(false)}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Nuevo grupo familiar</Text>
            <Text style={styles.fieldLabel}>Nombre del grupo</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="people-outline" size={20} color={Colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Ej: Familia García"
                placeholderTextColor={Colors.textSecondary}
                value={nombreNuevo}
                onChangeText={setNombreNuevo}
              />
            </View>
            {pacientes.length > 0 && (
              <>
                <Text style={[styles.fieldLabel, { marginTop: 4 }]}>Pacientes (opcional)</Text>
                <View style={styles.pacRow}>
                  {pacientes.map((p) => {
                    const id = p.id_paciente ?? p.id
                    const sel = pacSelIds.includes(id)
                    return (
                      <TouchableOpacity
                        key={id}
                        style={[styles.pacChip, sel && styles.pacChipActivo]}
                        onPress={() => setPacSelIds((prev) => sel ? prev.filter((x) => x !== id) : [...prev, id])}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.pacChipText, sel && styles.pacChipTextActivo]}>{p.nombre_paciente}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </>
            )}
            <TouchableOpacity style={[styles.modalBtn, guardando && { opacity: 0.65 }]} onPress={handleCrearGrupo} disabled={guardando} activeOpacity={0.85}>
              {guardando ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.modalBtnText}>Crear grupo</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
    </AnimatedScreen>
  )
}

const styles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#102e50' },
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, gap: 14, backgroundColor: '#102e50' },
  backBtn:     { padding: 4 },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '700', color: Colors.white },
  addBtn:      { padding: 4 },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content:     { flex: 1, backgroundColor: '#f7fbfc' },

  emptyState: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, padding: 32 },
  emptyIcon:  { width: 96, height: 96, borderRadius: 48, backgroundColor: Colors.primaryBg, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  emptyDesc:  { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  createBtn:  { flexDirection: 'row', alignItems: 'center', backgroundColor: '#102e50', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12, gap: 8 },
  createBtnText: { color: Colors.white, fontSize: 15, fontWeight: '700' },

  grupoCard:   { backgroundColor: Colors.white, borderRadius: 20, padding: 20, elevation: 2 },
  grupoHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 14 },
  grupoIcon:   { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.primaryBg, justifyContent: 'center', alignItems: 'center' },
  grupoNombre: { fontSize: 17, fontWeight: '700', color: Colors.text },
  grupoMeta:   { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  codigoBox:    { backgroundColor: Colors.primaryBg, borderRadius: 12, padding: 14, marginBottom: 16 },
  codigoHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  codigoLabel:  { fontSize: 12, fontWeight: '600', color: Colors.primary },
  codigoRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  codigoText:   { flex: 1, fontSize: 18, fontWeight: '800', color: Colors.primary, letterSpacing: 1 },
  codigoHint:   { fontSize: 11, color: Colors.textSecondary, lineHeight: 15 },
  copyBtn:      { padding: 4, marginLeft: 8 },

  seccion:       { marginTop: 4, marginBottom: 4 },
  seccionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  seccionLabel:  { fontSize: 11, fontWeight: '700', color: Colors.primary, letterSpacing: 0.8 },

  memberCard:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10, backgroundColor: Colors.background, borderRadius: 14, padding: 12 },
  memberIconPac:  { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.primaryBg, justifyContent: 'center', alignItems: 'center' },
  memberIconFam:  { width: 38, height: 38, borderRadius: 19, backgroundColor: '#f3e8ff', justifyContent: 'center', alignItems: 'center' },
  memberInfo:     { flex: 1 },
  memberNombre:   { fontSize: 14, fontWeight: '700', color: Colors.text },
  memberSub:      { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  tuTag:          { fontSize: 12, color: '#9333ea', fontWeight: '400' },
  coordRow:       { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  coordText:      { fontSize: 11, color: Colors.textSecondary, fontFamily: 'monospace' },
  sinUbi:         { fontSize: 11, color: Colors.textSecondary, marginTop: 4, fontStyle: 'italic' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalClose:   { alignSelf: 'flex-end', marginBottom: 12 },
  modalTitle:   { fontSize: 20, fontWeight: '700', color: Colors.text, marginBottom: 18 },
  fieldLabel:   { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 8 },
  inputWrap:    { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 14, marginBottom: 16 },
  inputIcon:    { marginRight: 10 },
  input:        { flex: 1, paddingVertical: 14, fontSize: 16, color: Colors.text },
  pacRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  pacChip:           { borderWidth: 1.5, borderColor: Colors.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  pacChipActivo:     { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },
  pacChipText:       { fontSize: 13, color: Colors.textSecondary },
  pacChipTextActivo: { color: Colors.primary, fontWeight: '700' },
  modalBtn:     { backgroundColor: '#102e50', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  modalBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },

  successBox:  { position: 'absolute', top: 16, left: 16, right: 16, zIndex: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', borderRadius: 12, padding: 14, borderLeftWidth: 4, borderLeftColor: Colors.success, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
  successText: { flex: 1, color: '#065f46', fontSize: 13, lineHeight: 19 },
})
