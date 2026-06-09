import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { Colors } from '@/constants/Colors'
import { pacienteService, dispositivoService } from '@/services/api'
import { useAuth } from '@/context/AuthContext'
import { mensajeDeError } from '@/utils/errores'
import AnimatedScreen from '@/components/AnimatedScreen'

type Dispositivo = { id_dispositivo: string; dispositivo_detectado: string }

export default function RegistroPacienteScreen() {
  const router = useRouter()
  const { cuidador } = useAuth()

  const [nombre_paciente,   setNombrePaciente]   = useState('')
  const [edad_paciente,     setEdadPaciente]      = useState('')
  const [enfermedad,        setEnfermedad]        = useState('')
  const [cedula,            setCedula]            = useState('')
  const [eps,               setEps]               = useState('')
  const [familiar_nombre,   setFamiliarNombre]    = useState('')
  const [familiar_telefono, setFamiliarTelefono]  = useState('')
  const [loading,           setLoading]           = useState(false)
  const [error,             setError]             = useState('')

  // Paso 2 — vincular dispositivo
  const [paso,                  setPaso]                  = useState<1 | 2>(1)
  const [pacienteId,            setPacienteId]            = useState('')
  const [dispositivos,          setDispositivos]          = useState<Dispositivo[]>([])
  const [cargandoDispositivos,  setCargandoDispositivos]  = useState(false)
  const [dispositivoSeleccionado, setDispositivoSeleccionado] = useState<string | null>(null)
  const [vinculando,            setVinculando]            = useState(false)
  const [errorVinculo,          setErrorVinculo]          = useState('')

  useEffect(() => {
    if (paso === 2) cargarDispositivos()
  }, [paso])

  const cargarDispositivos = async () => {
    setCargandoDispositivos(true)
    try {
      const res = await dispositivoService.disponibles()
      setDispositivos(res.data ?? [])
    } catch {
      setDispositivos([])
    } finally {
      setCargandoDispositivos(false)
    }
  }

  const handleGuardar = async () => {
    if (nombre_paciente.trim().length < 2) {
      setError('El nombre debe tener al menos 2 caracteres.')
      return
    }
    const edadNum = parseInt(edad_paciente)
    if (!edad_paciente || isNaN(edadNum) || edadNum < 1 || edadNum > 120) {
      setError('Ingresa una edad válida.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await pacienteService.registrar({
        nombre_paciente:   nombre_paciente.trim(),
        edad_paciente:     edadNum,
        enfermedad:        enfermedad.trim() || undefined,
        cedula:            cedula.trim() || undefined,
        eps:               eps.trim() || undefined,
        familiar_nombre:   familiar_nombre.trim() || undefined,
        familiar_telefono: familiar_telefono.trim() || undefined,
        id_cuidador:       cuidador?.id ?? '',
      } as any)
      const id = res.data?.id_paciente
      if (id) {
        setPacienteId(id)
        setPaso(2)
      } else {
        router.replace('/(app)/pacientes')
      }
    } catch (err: any) {
      setError(mensajeDeError(err, 'No se pudo registrar el paciente. Inténtalo de nuevo.'))
    } finally {
      setLoading(false)
    }
  }

  const handleVincular = async () => {
    if (!dispositivoSeleccionado) return
    setVinculando(true)
    setErrorVinculo('')
    try {
      await dispositivoService.vincular({ id_dispositivo: dispositivoSeleccionado, paciente_id: pacienteId })
      router.replace('/(app)/pacientes')
    } catch (err: any) {
      setErrorVinculo(mensajeDeError(err, 'No se pudo vincular el dispositivo. Inténtalo de nuevo.'))
    } finally {
      setVinculando(false)
    }
  }

  if (paso === 2) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Ionicons name="hardware-chip-outline" size={22} color={Colors.white} />
          <Text style={styles.headerTitle}>Vincular dispositivo GPS</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Dispositivos disponibles</Text>
            <Text style={styles.sectionDesc}>
              Selecciona el GPS que usará este paciente. Puedes omitir este paso y vincularlo después.
            </Text>

            {errorVinculo ? (
              <View style={styles.errorBox}>
                <Ionicons name="warning-outline" size={15} color={Colors.error} style={{ marginRight: 6 }} />
                <Text style={styles.errorText}>{errorVinculo}</Text>
              </View>
            ) : null}

            {cargandoDispositivos ? (
              <ActivityIndicator color="#102e50" style={{ marginVertical: 24 }} />
            ) : dispositivos.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="wifi-outline" size={36} color={Colors.textSecondary} />
                <Text style={styles.emptyText}>No hay dispositivos detectados.{'\n'}Asegúrate de que el GPS esté encendido.</Text>
                <TouchableOpacity onPress={cargarDispositivos} style={styles.reloadBtn}>
                  <Ionicons name="refresh-outline" size={16} color="#102e50" />
                  <Text style={styles.reloadText}>Reintentar</Text>
                </TouchableOpacity>
              </View>
            ) : (
              dispositivos.map((d) => {
                const seleccionado = dispositivoSeleccionado === d.id_dispositivo
                return (
                  <TouchableOpacity
                    key={d.id_dispositivo}
                    style={[styles.deviceCard, seleccionado && styles.deviceCardSelected]}
                    onPress={() => setDispositivoSeleccionado(d.id_dispositivo)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.deviceIcon, seleccionado && styles.deviceIconSelected]}>
                      <Ionicons name="hardware-chip-outline" size={22} color={seleccionado ? Colors.white : '#102e50'} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.deviceId, seleccionado && { color: '#102e50' }]}>{d.id_dispositivo}</Text>
                      <Text style={styles.deviceFecha}>
                        Última señal: {new Date(d.dispositivo_detectado).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                      </Text>
                    </View>
                    {seleccionado && <Ionicons name="checkmark-circle" size={22} color="#102e50" />}
                  </TouchableOpacity>
                )
              })
            )}

            <TouchableOpacity
              style={[styles.btn, (!dispositivoSeleccionado || vinculando) && styles.btnDisabled]}
              onPress={handleVincular}
              disabled={!dispositivoSeleccionado || vinculando}
              activeOpacity={0.85}
            >
              {vinculando
                ? <ActivityIndicator color={Colors.white} />
                : (
                  <>
                    <Ionicons name="link-outline" size={20} color={Colors.white} style={{ marginRight: 8 }} />
                    <Text style={styles.btnText}>Vincular y continuar</Text>
                  </>
                )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.skipBtn}
              onPress={() => router.replace('/(app)/pacientes')}
              activeOpacity={0.7}
            >
              <Text style={styles.skipText}>Omitir por ahora</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    )
  }

  return (
    <AnimatedScreen>
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Registrar paciente</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="warning-outline" size={15} color={Colors.error} style={{ marginRight: 6 }} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* ── Información básica ───────────────────────────────── */}
          <Text style={styles.sectionLabel}>Información básica</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Nombre completo <Text style={styles.req}>*</Text></Text>
            <View style={styles.inputWrap}>
              <Ionicons name="person-outline" size={18} color={Colors.textSecondary} style={styles.icon} />
              <TextInput
                style={styles.input}
                placeholder="Ej: Carlos Gómez"
                placeholderTextColor={Colors.textSecondary}
                value={nombre_paciente}
                onChangeText={setNombrePaciente}
                autoCapitalize="words"
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={styles.label}>Edad <Text style={styles.req}>*</Text></Text>
              <View style={styles.inputWrap}>
                <Ionicons name="calendar-outline" size={18} color={Colors.textSecondary} style={styles.icon} />
                <TextInput
                  style={styles.input}
                  placeholder="72"
                  placeholderTextColor={Colors.textSecondary}
                  value={edad_paciente}
                  onChangeText={setEdadPaciente}
                  keyboardType="number-pad"
                />
              </View>
            </View>

            <View style={[styles.field, { flex: 2, marginLeft: 12 }]}>
              <Text style={styles.label}>Cédula <Text style={styles.opt}>(opcional)</Text></Text>
              <View style={styles.inputWrap}>
                <Ionicons name="card-outline" size={18} color={Colors.textSecondary} style={styles.icon} />
                <TextInput
                  style={styles.input}
                  placeholder="1234567890"
                  placeholderTextColor={Colors.textSecondary}
                  value={cedula}
                  onChangeText={setCedula}
                  keyboardType="number-pad"
                />
              </View>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Diagnóstico / Enfermedad <Text style={styles.opt}>(opcional)</Text></Text>
            <View style={styles.inputWrap}>
              <Ionicons name="medkit-outline" size={18} color={Colors.textSecondary} style={styles.icon} />
              <TextInput
                style={styles.input}
                placeholder="Ej: Alzheimer leve"
                placeholderTextColor={Colors.textSecondary}
                value={enfermedad}
                onChangeText={setEnfermedad}
                autoCapitalize="sentences"
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>EPS <Text style={styles.opt}>(opcional)</Text></Text>
            <View style={styles.inputWrap}>
              <Ionicons name="medical-outline" size={18} color={Colors.textSecondary} style={styles.icon} />
              <TextInput
                style={styles.input}
                placeholder="Ej: Sura, Nueva EPS..."
                placeholderTextColor={Colors.textSecondary}
                value={eps}
                onChangeText={setEps}
                autoCapitalize="words"
              />
            </View>
          </View>

          {/* ── Contacto de emergencia ──────────────────────────── */}
          <Text style={[styles.sectionLabel, { marginTop: 8 }]}>Contacto de emergencia</Text>
          <Text style={styles.sectionDesc}>
            Persona a quien contactar si el paciente sufre un accidente.
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>Nombre del familiar <Text style={styles.opt}></Text></Text>
            <View style={styles.inputWrap}>
              <Ionicons name="people-outline" size={18} color={Colors.textSecondary} style={styles.icon} />
              <TextInput
                style={styles.input}
                placeholder="Ej: María Gómez"
                placeholderTextColor={Colors.textSecondary}
                value={familiar_nombre}
                onChangeText={setFamiliarNombre}
                autoCapitalize="words"
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Teléfono del familiar <Text style={styles.opt}></Text></Text>
            <View style={styles.inputWrap}>
              <Ionicons name="call-outline" size={18} color={Colors.textSecondary} style={styles.icon} />
              <TextInput
                style={styles.input}
                placeholder="Ej: 3001234567"
                placeholderTextColor={Colors.textSecondary}
                value={familiar_telefono}
                onChangeText={setFamiliarTelefono}
                keyboardType="phone-pad"
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleGuardar}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color={Colors.white} />
              : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={20} color={Colors.white} style={{ marginRight: 8 }} />
                  <Text style={styles.btnText}>Guardar paciente</Text>
                </>
              )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
    </AnimatedScreen>
  )
}

const styles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#102e50' },
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20, gap: 14 },
  backBtn:     { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.white },

  scroll:  { padding: 20, paddingTop: 0, paddingBottom: 40 },
  card:    { backgroundColor: Colors.white, borderRadius: 24, padding: 24, elevation: 10 },

  errorBox:  { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FEF2F2', borderRadius: 12, padding: 14, marginBottom: 18, borderLeftWidth: 4, borderLeftColor: Colors.error },
  errorText: { flex: 1, color: Colors.error, fontSize: 13 },

  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#102e50', marginBottom: 4, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionDesc:  { fontSize: 12, color: Colors.textSecondary, marginBottom: 14 },

  row:      { flexDirection: 'row' },
  field:    { marginBottom: 16 },
  label:    { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 7 },
  req:      { color: Colors.error },
  opt:      { color: Colors.textSecondary, fontWeight: '400' },
  inputWrap:{ flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12, backgroundColor: Colors.background, paddingHorizontal: 14 },
  icon:     { marginRight: 10 },
  input:    { flex: 1, paddingVertical: 13, fontSize: 15, color: Colors.text },

  btn:         { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: '#102e50', borderRadius: 12, paddingVertical: 16, marginTop: 8, elevation: 4 },
  btnDisabled: { opacity: 0.65 },
  btnText:     { color: Colors.white, fontSize: 15, fontWeight: '700' },

  // Paso 2
  emptyBox:    { alignItems: 'center', paddingVertical: 28, gap: 10 },
  emptyText:   { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  reloadBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: '#102e50', marginTop: 4 },
  reloadText:  { fontSize: 13, fontWeight: '600', color: '#102e50' },

  deviceCard:         { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 14, padding: 14, marginBottom: 10, backgroundColor: Colors.background },
  deviceCardSelected: { borderColor: '#102e50', backgroundColor: '#e8f0fb' },
  deviceIcon:         { width: 42, height: 42, borderRadius: 12, backgroundColor: '#e8f0fb', justifyContent: 'center', alignItems: 'center' },
  deviceIconSelected: { backgroundColor: '#102e50' },
  deviceId:           { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  deviceFecha:        { fontSize: 12, color: Colors.textSecondary },

  skipBtn:  { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  skipText: { fontSize: 14, color: Colors.textSecondary, textDecorationLine: 'underline' },
})
