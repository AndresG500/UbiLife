import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, Alert, Modal, KeyboardAvoidingView, Platform, Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { Colors } from '@/constants/Colors'
import { useAuth } from '@/context/AuthContext'
import AnimatedScreen from '@/components/AnimatedScreen'
import { cuidadorService, familiarService, pacienteService, reporteService } from '@/services/api'

type PacienteConDispositivo = { id_paciente: string; nombre_paciente: string; id_dispositivo: string }

export default function PerfilScreen() {
  const navigation = useNavigation()
  const { cuidador, logout, tipoUsuario, actualizarUsuario } = useAuth()

  const [nombre,   setNombre]   = useState(cuidador?.name  ?? '')
  const [telefono, setTelefono] = useState(cuidador?.phone ?? '')
  const [loading,  setLoading]  = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [error,    setError]    = useState('')
  const [subiendoFoto, setSubiendoFoto] = useState(false)

  // ── Reportar un problema ──
  const [reporteVisible,    setReporteVisible]    = useState(false)
  const [tipoProblema,      setTipoProblema]      = useState<'app' | 'dispositivo'>('app')
  const [pacientes,         setPacientes]         = useState<PacienteConDispositivo[]>([])
  const [cargandoPacientes, setCargandoPacientes]  = useState(false)
  const [pacienteId,        setPacienteId]        = useState<string | null>(null)
  const [descripcionReporte,setDescripcionReporte] = useState('')
  const [enviandoReporte,   setEnviandoReporte]    = useState(false)
  const [errorReporte,      setErrorReporte]       = useState('')
  const [reporteEnviado,    setReporteEnviado]     = useState(false)

  const inicial = cuidador?.name?.charAt(0)?.toUpperCase() ?? '?'
  const rolLabel = tipoUsuario === 'familiar' ? 'Familiar' : 'Cuidador'
  const rolIcon: React.ComponentProps<typeof Ionicons>['name'] =
    tipoUsuario === 'familiar' ? 'heart' : 'shield-checkmark'

  const guardarFoto = async (foto: string | null) => {
    setSubiendoFoto(true)
    try {
      if (tipoUsuario === 'familiar') {
        await familiarService.actualizar({ foto: foto ?? '' })
      } else {
        await cuidadorService.actualizar({ foto: foto ?? '' })
      }
      await actualizarUsuario({ foto })
    } catch {
      Alert.alert('Error', 'No se pudo actualizar la foto. Inténtalo de nuevo.')
    } finally {
      setSubiendoFoto(false)
    }
  }

  const elegirFoto = async (origen: 'galeria' | 'camara') => {
    const permiso = origen === 'camara'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (permiso.status !== 'granted') {
      Alert.alert('Permiso requerido', `Se necesita acceso a la ${origen === 'camara' ? 'cámara' : 'galería'} para cambiar tu foto.`)
      return
    }
    const result = origen === 'camara'
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true })
    if (!result.canceled && result.assets[0].base64) {
      guardarFoto(`data:image/jpeg;base64,${result.assets[0].base64}`)
    }
  }

  const handleCambiarFoto = () => {
    if (subiendoFoto) return
    Alert.alert('Foto de perfil', 'Elige una opción', [
      { text: 'Galería', onPress: () => elegirFoto('galeria') },
      { text: 'Cámara',  onPress: () => elegirFoto('camara') },
      ...(cuidador?.foto
        ? [{ text: 'Quitar foto', style: 'destructive' as const, onPress: () => guardarFoto(null) }]
        : []),
      { text: 'Cancelar', style: 'cancel' as const },
    ])
  }

  const handleGuardar = async () => {
    if (nombre.trim().length < 2) {
      setError('El nombre debe tener al menos 2 caracteres.')
      return
    }
    setLoading(true)
    setError('')
    try {
      if (tipoUsuario === 'familiar') {
        await familiarService.actualizar({ name: nombre.trim(), phone: telefono.trim() || undefined })
      } else {
        await cuidadorService.actualizar({ name: nombre.trim(), phone: telefono.trim() || undefined })
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setError('No se pudieron guardar los cambios.')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    Alert.alert('Cerrar sesión', '¿Estás seguro de que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión', style: 'destructive',
        onPress: async () => {
          if (tipoUsuario === 'familiar') {
            await familiarService.logout()
          } else {
            await cuidadorService.logout()
          }
          await logout()
        },
      },
    ])
  }

  const abrirReporte = () => {
    setTipoProblema('app')
    setPacienteId(null)
    setDescripcionReporte('')
    setErrorReporte('')
    setReporteVisible(true)
  }

  const seleccionarTipoDispositivo = async () => {
    setTipoProblema('dispositivo')
    if (pacientes.length > 0) return
    setCargandoPacientes(true)
    try {
      const res = tipoUsuario === 'familiar'
        ? await familiarService.misPacientes()
        : await pacienteService.listar()
      const conDispositivo = (res.data as any[]).filter(p => !!p.id_dispositivo)
      setPacientes(conDispositivo)
    } catch {
      setErrorReporte('No se pudieron cargar tus pacientes.')
    } finally {
      setCargandoPacientes(false)
    }
  }

  const handleEnviarReporte = async () => {
    if (descripcionReporte.trim().length < 10) {
      setErrorReporte('Describe el problema con al menos 10 caracteres.')
      return
    }
    if (tipoProblema === 'dispositivo' && !pacienteId) {
      setErrorReporte('Selecciona a qué paciente pertenece el dispositivo.')
      return
    }
    setEnviandoReporte(true)
    setErrorReporte('')
    try {
      await reporteService.crear({
        descripcion: descripcionReporte.trim(),
        relacionado_dispositivo: tipoProblema === 'dispositivo',
        paciente_id: tipoProblema === 'dispositivo' ? pacienteId! : undefined,
      })
      setReporteVisible(false)
      setReporteEnviado(true)
      setTimeout(() => setReporteEnviado(false), 3000)
    } catch (e: any) {
      setErrorReporte(e?.response?.data?.detail ?? 'No se pudo enviar el reporte.')
    } finally {
      setEnviandoReporte(false)
    }
  }

  return (
    <AnimatedScreen>
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {/* ── Header navy ──────────────────────────────────────── */}
      <View style={styles.hero}>
        <TouchableOpacity
          style={styles.menuBtn}
          onPress={() => (navigation as any).openDrawer()}
          activeOpacity={0.8}
        >
          <Ionicons name="menu" size={24} color={Colors.white} />
        </TouchableOpacity>

        {/* Avatar (tocable para cambiar la foto) */}
        <TouchableOpacity
          style={styles.avatarRing}
          onPress={handleCambiarFoto}
          activeOpacity={0.85}
          disabled={subiendoFoto}
        >
          <View style={styles.avatar}>
            {cuidador?.foto ? (
              <Image source={{ uri: cuidador.foto }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarText}>{inicial}</Text>
            )}
          </View>
          <View style={styles.avatarEditBadge}>
            {subiendoFoto
              ? <ActivityIndicator size="small" color={Colors.white} />
              : <Ionicons name="camera" size={14} color={Colors.white} />}
          </View>
        </TouchableOpacity>

        <Text style={styles.heroName}>{cuidador?.name ?? 'Usuario'}</Text>
        <Text style={styles.heroEmail}>{cuidador?.email ?? ''}</Text>

        <View style={styles.rolBadge}>
          <Ionicons name={rolIcon} size={13} color="#e0f2fe" />
          <Text style={styles.rolText}>{rolLabel}</Text>
        </View>
      </View>

      {/* ── Contenido ────────────────────────────────────────── */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Card: editar datos */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="create-outline" size={18} color="#102e50" />
            <Text style={styles.cardTitle}>Datos personales</Text>
          </View>

          {saved && (
            <View style={styles.savedBox}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.success} style={{ marginRight: 6 }} />
              <Text style={styles.savedText}>Cambios guardados correctamente</Text>
            </View>
          )}
          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="warning-outline" size={15} color={Colors.error} style={{ marginRight: 6 }} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.field}>
            <Text style={styles.label}>Nombre</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="person-outline" size={17} color={Colors.textSecondary} style={styles.icon} />
              <TextInput
                style={styles.input}
                value={nombre}
                onChangeText={setNombre}
                autoCapitalize="words"
                placeholderTextColor={Colors.textSecondary}
                editable
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Teléfono <Text style={styles.opt}>(opcional)</Text></Text>
            <View style={styles.inputWrap}>
              <Ionicons name="call-outline" size={17} color={Colors.textSecondary} style={styles.icon} />
              <TextInput
                style={styles.input}
                value={telefono}
                onChangeText={(t) => setTelefono(t.replace(/\D/g, '').slice(0, 10))}
                keyboardType="phone-pad"
                maxLength={10}
                placeholder="Ej: 3001234567"
                placeholderTextColor={Colors.textSecondary}
                editable
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, loading && { opacity: 0.65 }]}
            onPress={handleGuardar}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color={Colors.white} size="small" />
              : (
                <>
                  <Ionicons name="save-outline" size={18} color={Colors.white} style={{ marginRight: 8 }} />
                  <Text style={styles.saveBtnText}>Guardar cambios</Text>
                </>
              )}
          </TouchableOpacity>
        </View>

        {/* Card: información de cuenta (solo lectura) */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="information-circle-outline" size={18} color="#102e50" />
            <Text style={styles.cardTitle}>Información de cuenta</Text>
          </View>

          <View style={styles.infoFila}>
            <View style={styles.infoIconWrap}>
              <Ionicons name="mail-outline" size={16} color={Colors.textSecondary} />
            </View>
            <View>
              <Text style={styles.infoSubLabel}>Correo electrónico</Text>
              <Text style={styles.infoValor}>{cuidador?.email ?? '—'}</Text>
            </View>
          </View>

          <View style={[styles.infoFila, { marginBottom: 0 }]}>
            <View style={styles.infoIconWrap}>
              <Ionicons name={rolIcon} size={16} color={Colors.textSecondary} />
            </View>
            <View>
              <Text style={styles.infoSubLabel}>Tipo de usuario</Text>
              <Text style={styles.infoValor}>{rolLabel}</Text>
            </View>
          </View>
        </View>

        {/* Card: soporte */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="help-buoy-outline" size={18} color="#102e50" />
            <Text style={styles.cardTitle}>Soporte</Text>
          </View>

          {reporteEnviado && (
            <View style={styles.savedBox}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.success} style={{ marginRight: 6 }} />
              <Text style={styles.savedText}>Reporte enviado. El administrador lo revisará pronto.</Text>
            </View>
          )}

          <TouchableOpacity style={styles.reportBtn} onPress={abrirReporte} activeOpacity={0.85}>
            <Ionicons name="flag-outline" size={18} color="#102e50" style={{ marginRight: 8 }} />
            <Text style={styles.reportBtnText}>Reportar un problema</Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutCard} onPress={handleLogout} activeOpacity={0.85}>
          <View style={styles.logoutIconWrap}>
            <Ionicons name="log-out-outline" size={20} color={Colors.error} />
          </View>
          <Text style={styles.logoutText}>Cerrar sesión</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.error} style={{ opacity: 0.6 }} />
        </TouchableOpacity>
      </ScrollView>

      {/* ── Modal reportar problema ── */}
      <Modal visible={reporteVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reportar un problema</Text>
              <TouchableOpacity onPress={() => setReporteVisible(false)} hitSlop={10}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {errorReporte ? (
                <View style={styles.errorBox}>
                  <Ionicons name="warning-outline" size={14} color={Colors.error} style={{ marginRight: 6 }} />
                  <Text style={styles.errorText}>{errorReporte}</Text>
                </View>
              ) : null}

              <Text style={styles.mLabel}>Tipo de problema</Text>
              <View style={styles.tipoRow}>
                <TouchableOpacity
                  style={[styles.tipoOpcion, tipoProblema === 'app' && styles.tipoOpcionActiva]}
                  onPress={() => setTipoProblema('app')}
                  activeOpacity={0.85}
                >
                  <Ionicons name="phone-portrait-outline" size={18} color={tipoProblema === 'app' ? Colors.primary : Colors.textSecondary} />
                  <Text style={[styles.tipoOpcionText, tipoProblema === 'app' && styles.tipoOpcionTextActiva]}>Problema de la app</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tipoOpcion, tipoProblema === 'dispositivo' && styles.tipoOpcionActiva]}
                  onPress={seleccionarTipoDispositivo}
                  activeOpacity={0.85}
                >
                  <Ionicons name="hardware-chip-outline" size={18} color={tipoProblema === 'dispositivo' ? Colors.primary : Colors.textSecondary} />
                  <Text style={[styles.tipoOpcionText, tipoProblema === 'dispositivo' && styles.tipoOpcionTextActiva]}>Dispositivo GPS</Text>
                </TouchableOpacity>
              </View>

              {tipoProblema === 'dispositivo' && (
                <>
                  <Text style={styles.mLabel}>¿A qué paciente pertenece?</Text>
                  {cargandoPacientes ? (
                    <ActivityIndicator style={{ marginVertical: 12 }} color={Colors.primary} />
                  ) : pacientes.length === 0 ? (
                    <Text style={styles.sinPacientesText}>No tienes pacientes con un dispositivo vinculado.</Text>
                  ) : (
                    <View style={{ marginBottom: 20 }}>
                      {pacientes.map(p => (
                        <TouchableOpacity
                          key={p.id_paciente}
                          style={[styles.pacienteFila, pacienteId === p.id_paciente && styles.pacienteFilaActiva]}
                          onPress={() => setPacienteId(p.id_paciente)}
                          activeOpacity={0.85}
                        >
                          <Ionicons
                            name={pacienteId === p.id_paciente ? 'radio-button-on' : 'radio-button-off'}
                            size={18}
                            color={pacienteId === p.id_paciente ? Colors.primary : Colors.textSecondary}
                          />
                          <Text style={styles.pacienteFilaText}>{p.nombre_paciente}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </>
              )}

              <Text style={styles.mLabel}>Descripción</Text>
              <View style={styles.mTextareaWrap}>
                <TextInput
                  style={styles.mTextarea}
                  value={descripcionReporte}
                  onChangeText={setDescripcionReporte}
                  placeholder="Describe qué está pasando..."
                  placeholderTextColor={Colors.textSecondary}
                  multiline
                  numberOfLines={4}
                  maxLength={500}
                />
              </View>

              <TouchableOpacity
                style={[styles.mBtn, enviandoReporte && { opacity: 0.6 }]}
                onPress={handleEnviarReporte}
                disabled={enviandoReporte}
                activeOpacity={0.85}
              >
                {enviandoReporte
                  ? <ActivityIndicator color={Colors.white} />
                  : (
                    <>
                      <Ionicons name="send-outline" size={18} color={Colors.white} style={{ marginRight: 8 }} />
                      <Text style={styles.mBtnText}>Enviar reporte</Text>
                    </>
                  )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
    </AnimatedScreen>
  )
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#102e50' },
  content: { flex: 1, backgroundColor: '#f7fbfc' },

  /* ── Hero ── */
  hero: {
    alignItems: 'center',
    paddingBottom: 32,
    paddingTop: 12,
  },
  menuBtn: {
    position: 'absolute', top: 12, left: 16,
    width: 40, height: 40, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarRing: {
    width: 96, height: 96, borderRadius: 48,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.35)',
    justifyContent: 'center', alignItems: 'center',
    marginTop: 16, marginBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  avatar: {
    width: 82, height: 82, borderRadius: 41,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImg:   { width: 82, height: 82, borderRadius: 41 },
  avatarText:  { fontSize: 34, fontWeight: '700', color: Colors.white },
  avatarEditBadge: {
    position: 'absolute', bottom: 10, right: 4,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#2563eb',
    borderWidth: 2, borderColor: '#102e50',
    justifyContent: 'center', alignItems: 'center',
  },
  heroName:    { fontSize: 20, fontWeight: '700', color: Colors.white, marginBottom: 4 },
  heroEmail:   { fontSize: 13, color: 'rgba(255,255,255,0.65)', marginBottom: 12 },
  rolBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  rolText: { fontSize: 13, color: '#e0f2fe', fontWeight: '600' },

  /* ── Scroll ── */
  scrollContent: { padding: 16, paddingBottom: 40 },

  /* ── Cards ── */
  card: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 20,
    marginBottom: 14,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: 18,
    paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#f0f4f8',
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#102e50' },

  /* Feedback */
  savedBox:  { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', borderRadius: 10, padding: 12, marginBottom: 16 },
  savedText: { color: Colors.success, fontWeight: '600', fontSize: 13 },
  errorBox:  { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: Colors.error },
  errorText: { flex: 1, color: Colors.error, fontSize: 13 },

  /* Fields */
  field:     { marginBottom: 14 },
  label:     { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 7 },
  opt:       { color: Colors.textSecondary, fontWeight: '400' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12, backgroundColor: Colors.background, paddingHorizontal: 14 },
  icon:      { marginRight: 10 },
  input:     { flex: 1, paddingVertical: 13, fontSize: 15, color: Colors.text },

  saveBtn: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#102e50', borderRadius: 12,
    paddingVertical: 14, marginTop: 6, elevation: 3,
  },
  saveBtnText: { color: Colors.white, fontSize: 15, fontWeight: '700' },

  /* Info rows (read-only) */
  infoFila: {
    flexDirection: 'row', alignItems: 'center',
    gap: 14, marginBottom: 16,
  },
  infoIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#f0f4f8',
    justifyContent: 'center', alignItems: 'center',
  },
  infoSubLabel: { fontSize: 11, color: Colors.textSecondary, marginBottom: 2 },
  infoValor:    { fontSize: 14, fontWeight: '600', color: Colors.text },

  /* Logout */
  logoutCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFF5F5',
    borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#FECACA',
    gap: 12,
    marginTop: 4,
  },
  logoutIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center', alignItems: 'center',
  },
  logoutText: { flex: 1, color: Colors.error, fontSize: 15, fontWeight: '700' },

  /* Soporte */
  reportBtn: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12,
    paddingVertical: 13, paddingHorizontal: 14,
  },
  reportBtnText: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.text },

  /* Modal reportar problema */
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet:   { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '85%' },
  modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle:   { fontSize: 18, fontWeight: '700', color: '#102e50' },

  mLabel: { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 8 },

  tipoRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  tipoOpcion: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12,
    paddingVertical: 12, backgroundColor: Colors.white,
  },
  tipoOpcionActiva:     { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },
  tipoOpcionText:       { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, textAlign: 'center' },
  tipoOpcionTextActiva: { color: Colors.primary },

  sinPacientesText: { fontSize: 13, color: Colors.textSecondary, marginBottom: 20 },
  pacienteFila: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 11, paddingHorizontal: 14, borderRadius: 10,
    borderWidth: 1.5, borderColor: Colors.border, marginBottom: 8,
  },
  pacienteFilaActiva: { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },
  pacienteFilaText:   { fontSize: 14, color: Colors.text, fontWeight: '500' },

  mTextareaWrap: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12, backgroundColor: Colors.background, marginBottom: 20 },
  mTextarea:     { padding: 14, fontSize: 14, color: Colors.text, minHeight: 100, textAlignVertical: 'top' },

  mBtn:      { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: '#102e50', borderRadius: 12, paddingVertical: 15, elevation: 3, marginBottom: 8 },
  mBtnText:  { color: Colors.white, fontSize: 15, fontWeight: '700' },
})
