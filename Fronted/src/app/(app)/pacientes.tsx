import { useCallback, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Modal,
  TextInput, KeyboardAvoidingView, Platform, Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useFocusEffect } from 'expo-router'
import { useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { Colors } from '@/constants/Colors'
import { pacienteService, familiarService } from '@/services/api'
import { useAuth } from '@/context/AuthContext'
import { mensajeDeError } from '@/utils/errores'
import ConfirmModal from '@/components/ConfirmModal'
import AnimatedScreen from '@/components/AnimatedScreen'

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

function InfoFila({ icon, label, value }: { icon: IoniconsName; label: string; value: string }) {
  return (
    <View style={styles.infoFila}>
      <Ionicons name={icon} size={14} color={Colors.textSecondary} style={{ marginRight: 7 }} />
      <Text style={styles.infoLabel}>{label}: </Text>
      <Text style={styles.infoValor} numberOfLines={1}>{value}</Text>
    </View>
  )
}

function PacienteCard({
  pac,
  esCuidador,
  onEditar,
  onEliminar,
}: {
  pac: any
  esCuidador: boolean
  onEditar: (pac: any) => void
  onEliminar: (pac: any) => void
}) {
  const nombre        = pac.nombre_paciente ?? 'Paciente'
  const inicial       = nombre.charAt(0).toUpperCase()
  const tieneContacto = pac.familiar_nombre || pac.familiar_telefono

  const abrirMenu = () => {
    Alert.alert(nombre, 'Selecciona una acción', [
      { text: 'Editar',    onPress: () => onEditar(pac) },
      { text: 'Eliminar',  onPress: () => onEliminar(pac), style: 'destructive' },
      { text: 'Cancelar',  style: 'cancel' },
    ])
  }

  return (
    <View style={[styles.card, !pac.activo && styles.cardInactivo]}>
      <View style={styles.cardHead}>
        {pac.foto ? (
          <Image source={{ uri: pac.foto }} style={styles.avatarFoto} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{inicial}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={styles.cardNombre}>{nombre}</Text>
            {!pac.activo && (
              <View style={styles.inactivoBadge}>
                <Text style={styles.inactivoBadgeText}>Inactivo</Text>
              </View>
            )}
          </View>
          {pac.enfermedad ? (
            <Text style={styles.cardEnfermedad}>{pac.enfermedad}</Text>
          ) : null}
        </View>
        {pac.modo_viaje_activo && (
          <View style={styles.viajeChip}>
            <Ionicons name="airplane" size={11} color="#16a34a" />
            <Text style={styles.viajeChipText}>
              {pac.modo_viaje_tipo === 'vehiculo' ? 'Vehículo' : 'Modo viaje'}
            </Text>
          </View>
        )}
        {esCuidador && (
          <TouchableOpacity onPress={abrirMenu} hitSlop={12} style={styles.menuDotBtn}>
            <Ionicons name="ellipsis-vertical" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {pac.modo_viaje_activo && pac.modo_viaje_activado_por && (
        <View style={styles.viajeActivadoPor}>
          <Ionicons name="person-circle-outline" size={13} color="#16a34a" />
          <Text style={styles.viajeActivadoPorText}>
            Activado por: {pac.modo_viaje_activado_por}
          </Text>
        </View>
      )}

      <View style={styles.sep} />

      <View style={styles.infoBloque}>
        <InfoFila icon="calendar-outline" label="Edad"   value={pac.edad_paciente ? `${pac.edad_paciente} años` : '—'} />
        <InfoFila icon="card-outline"     label="Cédula" value={pac.cedula ?? '—'} />
        <InfoFila icon="medical-outline"  label="EPS"    value={pac.eps    ?? '—'} />
      </View>

      {tieneContacto && (
        <>
          <View style={styles.sep} />
          <View style={styles.contactoHead}>
            <Ionicons name="alert-circle-outline" size={14} color="#b45309" />
            <Text style={styles.contactoTitle}>Contacto de emergencia</Text>
          </View>
          <View style={styles.infoBloque}>
            {pac.familiar_nombre   && <InfoFila icon="person-outline" label="Nombre"   value={pac.familiar_nombre} />}
            {pac.familiar_telefono && <InfoFila icon="call-outline"   label="Teléfono" value={pac.familiar_telefono} />}
          </View>
        </>
      )}
    </View>
  )
}

// ── Modal de edición ──────────────────────────────────────────────────────────

function EditarModal({
  visible,
  pac,
  onCerrar,
  onGuardado,
}: {
  visible: boolean
  pac: any
  onCerrar: () => void
  onGuardado: () => void
}) {
  const [nombre,   setNombre]   = useState(pac?.nombre_paciente  ?? '')
  const [edad,     setEdad]     = useState(pac?.edad_paciente ? String(pac.edad_paciente) : '')
  const [enf,      setEnf]      = useState(pac?.enfermedad        ?? '')
  const [cedula,   setCedula]   = useState(pac?.cedula            ?? '')
  const [eps,      setEps]      = useState(pac?.eps               ?? '')
  const [famNom,   setFamNom]   = useState(pac?.familiar_nombre   ?? '')
  const [famTel,   setFamTel]   = useState(pac?.familiar_telefono ?? '')
  const [foto,     setFoto]     = useState<string | null>(pac?.foto ?? null)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  // Sincronizar cuando cambia el paciente seleccionado
  const resetear = (p: any) => {
    setNombre(p?.nombre_paciente  ?? '')
    setEdad(p?.edad_paciente ? String(p.edad_paciente) : '')
    setEnf(p?.enfermedad        ?? '')
    setCedula(p?.cedula          ?? '')
    setEps(p?.eps                ?? '')
    setFamNom(p?.familiar_nombre ?? '')
    setFamTel(p?.familiar_telefono ?? '')
    setFoto(p?.foto ?? null)
    setError('')
  }

  const seleccionarFoto = () => {
    Alert.alert('Foto del paciente', 'Elige una opción', [
      {
        text: 'Galería',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
          if (status !== 'granted') {
            Alert.alert('Permiso requerido', 'Se necesita acceso a la galería para seleccionar una foto.')
            return
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true,
          })
          if (!result.canceled && result.assets[0].base64) {
            setFoto(`data:image/jpeg;base64,${result.assets[0].base64}`)
          }
        },
      },
      {
        text: 'Cámara',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync()
          if (status !== 'granted') {
            Alert.alert('Permiso requerido', 'Se necesita acceso a la cámara para tomar una foto.')
            return
          }
          const result = await ImagePicker.launchCameraAsync({
            allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true,
          })
          if (!result.canceled && result.assets[0].base64) {
            setFoto(`data:image/jpeg;base64,${result.assets[0].base64}`)
          }
        },
      },
      ...(foto ? [{ text: 'Quitar foto', style: 'destructive' as const, onPress: () => setFoto(null) }] : []),
      { text: 'Cancelar', style: 'cancel' as const },
    ])
  }

  const guardar = async () => {
    if (nombre.trim().length < 2) { setError('El nombre debe tener al menos 2 caracteres.'); return }
    const edadNum = parseInt(edad)
    if (!edad || isNaN(edadNum) || edadNum < 1 || edadNum > 120) { setError('Ingresa una edad válida.'); return }
    setSaving(true)
    setError('')
    try {
      await pacienteService.actualizar(pac.id_paciente, {
        nombre_paciente:   nombre.trim(),
        edad_paciente:     edadNum,
        enfermedad:        enf.trim()    || null,
        cedula:            cedula.trim() || null,
        eps:               eps.trim()    || null,
        familiar_nombre:   famNom.trim() || null,
        familiar_telefono: famTel.trim() || null,
        foto:              foto ?? '',
      })
      onGuardado()
    } catch (e: any) {
      setError(mensajeDeError(e, 'No se pudo guardar los cambios. Inténtalo de nuevo.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onShow={() => resetear(pac)}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalSheet}>
          {/* Barra superior */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Editar paciente</Text>
            <TouchableOpacity onPress={onCerrar} hitSlop={10}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="warning-outline" size={14} color={Colors.error} style={{ marginRight: 6 }} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.editFotoContainer}>
              <TouchableOpacity style={styles.editFotoBtn} onPress={seleccionarFoto} activeOpacity={0.8}>
                {foto ? (
                  <Image source={{ uri: foto }} style={styles.editFotoImg} />
                ) : (
                  <View style={styles.editFotoPlaceholder}>
                    <Ionicons name="camera-outline" size={24} color={Colors.textSecondary} />
                  </View>
                )}
                <View style={styles.editFotoBadge}>
                  <Ionicons name="pencil" size={11} color={Colors.white} />
                </View>
              </TouchableOpacity>
              <Text style={styles.editFotoLabel}>Foto del paciente</Text>
            </View>

            <Text style={styles.mSectionLabel}>Información básica</Text>

            <Text style={styles.mLabel}>Nombre completo *</Text>
            <View style={styles.mInputWrap}>
              <Ionicons name="person-outline" size={17} color={Colors.textSecondary} style={styles.mIcon} />
              <TextInput style={styles.mInput} value={nombre} onChangeText={setNombre} autoCapitalize="words" />
            </View>

            <View style={styles.mRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.mLabel}>Edad *</Text>
                <View style={styles.mInputWrap}>
                  <Ionicons name="calendar-outline" size={17} color={Colors.textSecondary} style={styles.mIcon} />
                  <TextInput style={styles.mInput} value={edad} onChangeText={setEdad} keyboardType="number-pad" />
                </View>
              </View>
              <View style={{ flex: 2, marginLeft: 10 }}>
                <Text style={styles.mLabel}>Cédula</Text>
                <View style={styles.mInputWrap}>
                  <Ionicons name="card-outline" size={17} color={Colors.textSecondary} style={styles.mIcon} />
                  <TextInput style={styles.mInput} value={cedula} onChangeText={setCedula} keyboardType="number-pad" />
                </View>
              </View>
            </View>

            <Text style={styles.mLabel}>Diagnóstico</Text>
            <View style={styles.mInputWrap}>
              <Ionicons name="medkit-outline" size={17} color={Colors.textSecondary} style={styles.mIcon} />
              <TextInput style={styles.mInput} value={enf} onChangeText={setEnf} autoCapitalize="sentences" />
            </View>

            <Text style={styles.mLabel}>EPS</Text>
            <View style={styles.mInputWrap}>
              <Ionicons name="medical-outline" size={17} color={Colors.textSecondary} style={styles.mIcon} />
              <TextInput style={styles.mInput} value={eps} onChangeText={setEps} autoCapitalize="words" />
            </View>

            <Text style={[styles.mSectionLabel, { marginTop: 8 }]}>Contacto de emergencia</Text>

            <Text style={styles.mLabel}>Nombre del familiar</Text>
            <View style={styles.mInputWrap}>
              <Ionicons name="people-outline" size={17} color={Colors.textSecondary} style={styles.mIcon} />
              <TextInput style={styles.mInput} value={famNom} onChangeText={setFamNom} autoCapitalize="words" />
            </View>

            <Text style={styles.mLabel}>Teléfono del familiar</Text>
            <View style={styles.mInputWrap}>
              <Ionicons name="call-outline" size={17} color={Colors.textSecondary} style={styles.mIcon} />
              <TextInput style={styles.mInput} value={famTel} onChangeText={setFamTel} keyboardType="phone-pad" />
            </View>

            <TouchableOpacity
              style={[styles.mBtn, saving && styles.mBtnDisabled]}
              onPress={guardar}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color={Colors.white} />
                : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={19} color={Colors.white} style={{ marginRight: 8 }} />
                    <Text style={styles.mBtnText}>Guardar cambios</Text>
                  </>
                )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ── Pantalla principal ────────────────────────────────────────────────────────

export default function PacientesScreen() {
  const navigation      = useNavigation()
  const router          = useRouter()
  const { tipoUsuario } = useAuth()
  const esFamiliar      = tipoUsuario === 'familiar'
  const esCuidador      = !esFamiliar

  const [pacientes, setPacientes]         = useState<any[]>([])
  const [loading,   setLoading]           = useState(true)
  const [error,     setError]             = useState('')
  const [editando,      setEditando]      = useState<any | null>(null)
  const [exito,         setExito]         = useState('')
  const [pacAEliminar,  setPacAEliminar]  = useState<any | null>(null)

  const mostrarExito = useCallback((msg: string) => {
    setExito(msg)
    setTimeout(() => setExito(''), 3000)
  }, [])

  const cargar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = esFamiliar
        ? await familiarService.misPacientes()
        : await pacienteService.listar()
      setPacientes(Array.isArray(res.data) ? res.data.filter((p: any) => !!p.id_paciente) : [])
    } catch {
      setError('No se pudieron cargar los pacientes.')
    } finally {
      setLoading(false)
    }
  }, [esFamiliar])

  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  const confirmarEliminar = (pac: any) => {
    setPacAEliminar(pac)
  }

  const ejecutarEliminar = async () => {
    if (!pacAEliminar) return
    const pac = pacAEliminar
    setPacAEliminar(null)
    try {
      await pacienteService.eliminar(pac.id_paciente)
      cargar()
    } catch {
      Alert.alert('Error', 'No se pudo eliminar el paciente.')
    }
  }

  return (
    <AnimatedScreen>
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.menuBtn}
          onPress={() => (navigation as any).openDrawer()}
          activeOpacity={0.8}
        >
          <Ionicons name="menu" size={24} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pacientes</Text>
        {esCuidador && (
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => router.push('/(app)/registro-paciente')}
            activeOpacity={0.8}
          >
            <Ionicons name="person-add-outline" size={22} color={Colors.white} />
          </TouchableOpacity>
        )}
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
        ) : pacientes.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="person-outline" size={52} color={Colors.border} />
            <Text style={styles.emptyTitle}>Sin pacientes</Text>
            <Text style={styles.emptyDesc}>
              {esFamiliar
                ? 'Aún no hay pacientes asociados a tu grupo familiar.'
                : 'Toca el ícono ⁺ en la esquina superior derecha para registrar tu primer paciente.'}
            </Text>
          </View>
        ) : (
          pacientes.map((pac) => (
            <PacienteCard
              key={pac.id_paciente}
              pac={pac}
              esCuidador={esCuidador}
              onEditar={setEditando}
              onEliminar={confirmarEliminar}
            />
          ))
        )}
        </ScrollView>
      </View>

      <ConfirmModal
        visible={!!pacAEliminar}
        titulo="Eliminar paciente"
        mensaje={`¿Seguro que deseas eliminar a ${pacAEliminar?.nombre_paciente ?? 'este paciente'}? Esta acción no se puede deshacer.`}
        textoConfirm="Eliminar"
        onCancel={() => setPacAEliminar(null)}
        onConfirm={ejecutarEliminar}
        destructivo
      />

      {editando && (
        <EditarModal
          visible={!!editando}
          pac={editando}
          onCerrar={() => setEditando(null)}
          onGuardado={() => { setEditando(null); cargar(); mostrarExito('Cambios guardados correctamente.') }}
        />
      )}
    </SafeAreaView>
    </AnimatedScreen>
  )
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#102e50' },
  header:  {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 18, gap: 12,
  },
  menuBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '700', color: Colors.white },
  addBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },

  content:       { flex: 1, backgroundColor: '#f7fbfc' },
  scrollContent: { padding: 16, paddingBottom: 32 },

  card: {
    backgroundColor: Colors.white,
    borderRadius: 20, padding: 18, marginBottom: 14,
    elevation: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)',
  },
  cardHead:      { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar:        { width: 46, height: 46, borderRadius: 23, backgroundColor: '#e8eef5', justifyContent: 'center', alignItems: 'center' },
  avatarFoto:    { width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: '#102e50' },
  avatarText:    { fontSize: 20, fontWeight: '700', color: '#102e50' },
  cardNombre:    { fontSize: 16, fontWeight: '700', color: '#102e50' },
  cardEnfermedad:{ fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  menuDotBtn:    { padding: 4 },

  viajeChip:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f0fdf4', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#bbf7d0' },
  viajeChipText: { fontSize: 11, fontWeight: '600', color: '#16a34a' },

  viajeActivadoPor:     { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: -6, marginBottom: 4, paddingHorizontal: 2 },
  viajeActivadoPorText: { fontSize: 11, color: '#16a34a', fontWeight: '500' },

  cardInactivo:      { opacity: 0.6 },
  inactivoBadge:     { backgroundColor: '#f1f5f9', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: '#e2e8f0' },
  inactivoBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.textSecondary },

  sep:           { height: 1, backgroundColor: '#f0f4f8', marginVertical: 14 },
  infoBloque:    { gap: 8 },
  infoFila:      { flexDirection: 'row', alignItems: 'center' },
  infoLabel:     { fontSize: 13, color: Colors.textSecondary },
  infoValor:     { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.text },

  contactoHead:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  contactoTitle: { fontSize: 12, fontWeight: '700', color: '#b45309', textTransform: 'uppercase', letterSpacing: 0.4 },

  emptyWrap:  { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.text, marginTop: 16, marginBottom: 8 },
  emptyDesc:  { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  retryBtn:   { marginTop: 20, backgroundColor: '#102e50', borderRadius: 12, paddingHorizontal: 28, paddingVertical: 12 },
  retryText:  { color: Colors.white, fontWeight: '700', fontSize: 14 },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet:   { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '90%' },
  modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle:   { fontSize: 18, fontWeight: '700', color: '#102e50' },

  errorBox:  { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginBottom: 14, borderLeftWidth: 3, borderLeftColor: Colors.error },
  errorText: { flex: 1, color: Colors.error, fontSize: 13 },

  editFotoContainer: { alignItems: 'center', marginBottom: 18 },
  editFotoBtn:       { width: 82, height: 82, borderRadius: 41 },
  editFotoImg:       { width: 82, height: 82, borderRadius: 41, borderWidth: 2, borderColor: '#102e50' },
  editFotoPlaceholder: {
    width: 82, height: 82, borderRadius: 41,
    backgroundColor: Colors.background,
    borderWidth: 1.5, borderColor: Colors.border, borderStyle: 'dashed',
    justifyContent: 'center', alignItems: 'center',
  },
  editFotoBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#102e50',
    borderWidth: 2, borderColor: Colors.white,
    justifyContent: 'center', alignItems: 'center',
  },
  editFotoLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600', marginTop: 8 },

  mSectionLabel: { fontSize: 12, fontWeight: '700', color: '#102e50', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12, marginTop: 4 },
  mRow:          { flexDirection: 'row', marginBottom: 14 },
  mLabel:        { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  mInputWrap:    { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: Colors.border, borderRadius: 11, backgroundColor: Colors.background, paddingHorizontal: 12, marginBottom: 14 },
  mIcon:         { marginRight: 8 },
  mInput:        { flex: 1, paddingVertical: 11, fontSize: 14, color: Colors.text },
  mBtn:          { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: '#102e50', borderRadius: 12, paddingVertical: 15, marginTop: 4, marginBottom: 8, elevation: 3 },
  mBtnDisabled:  { opacity: 0.6 },
  mBtnText:      { color: Colors.white, fontSize: 15, fontWeight: '700' },

  successBox:  { position: 'absolute', top: 16, left: 16, right: 16, zIndex: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', borderRadius: 12, padding: 14, borderLeftWidth: 4, borderLeftColor: Colors.success, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
  successText: { flex: 1, color: '#065f46', fontSize: 13, lineHeight: 19 },
})
