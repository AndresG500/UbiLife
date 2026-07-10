import { useState, useEffect, useRef, useCallback } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, FlatList, Image, Alert,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'

const ENFERMEDADES = [
  'Alzheimer leve',
  'Alzheimer moderado',
  'Alzheimer severo',
  'Alzheimer precoz',
  'Demencia vascular',
  'Demencia por cuerpos de Lewy',
  'Demencia frontotemporal',
  'Demencia mixta',
  'Deterioro cognitivo leve',
  'Enfermedad de Parkinson con demencia',
  'Afasia progresiva primaria',
  'Demencia por Huntington',
]

const EPS_LIST = [
  'Nueva EPS',
  'Sura',
  'Sanitas',
  'Compensar',
  'Coomeva',
  'Cafam',
  'Famisanar',
  'Salud Total',
  'Coosalud',
  'Mutual Ser',
  'Comfenalco',
  'Aliansalud',
  'Medimás',
  'Cruz Blanca',
  'Colsanitas',
  'Emssanar',
  'Convida',
  'Comfama',
  'ASMET Salud',
  'Comfacor',
  'Pijaos Salud',
]

function tieneLetras(s: string): boolean {
  return /[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ]{2,}/.test(s)
}

function Sugerencias({ opciones, valor, onSelect }: {
  opciones: string[]
  valor: string
  onSelect: (v: string) => void
}) {
  const filtradas = valor.trim().length === 0
    ? opciones
    : opciones.filter(o => o.toLowerCase().includes(valor.toLowerCase()) && o.toLowerCase() !== valor.toLowerCase())
  if (filtradas.length === 0) return null
  return (
    <FlatList
      horizontal
      data={filtradas}
      keyExtractor={(item) => item}
      showsHorizontalScrollIndicator={false}
      style={styles.pillsRow}
      contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
      renderItem={({ item }) => (
        <TouchableOpacity style={styles.pill} onPress={() => onSelect(item)} activeOpacity={0.75}>
          <Text style={styles.pillText}>{item}</Text>
        </TouchableOpacity>
      )}
    />
  )
}
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter, useFocusEffect } from 'expo-router'
import LottieView from 'lottie-react-native'
import { Colors } from '@/constants/Colors'
import { pacienteService, dispositivoService } from '@/services/api'
import { useAuth } from '@/context/AuthContext'
import { mensajeDeError } from '@/utils/errores'
import AnimatedScreen from '@/components/AnimatedScreen'

type Dispositivo = { id_dispositivo: string; dispositivo_detectado: string }

export default function RegistroPacienteScreen() {
  const router = useRouter()
  const { cuidador } = useAuth()
  const animRef = useRef<LottieView>(null)

  const [nombre_paciente,   setNombrePaciente]   = useState('')
  const [edad_paciente,     setEdadPaciente]      = useState('')
  const [enfermedad,        setEnfermedad]        = useState('')
  const [cedula,            setCedula]            = useState('')
  const [eps,               setEps]               = useState('')
  const [familiar_nombre,   setFamiliarNombre]    = useState('')
  const [familiar_telefono, setFamiliarTelefono]  = useState('')
  const [foto,              setFoto]              = useState<string | null>(null)
  const [error,             setError]             = useState('')

  const [paso,                    setPaso]                    = useState<1 | 'buscando' | 2>(1)
  const [editando,                setEditando]                = useState(false)
  const [pacienteId,              setPacienteId]              = useState('')
  const [dispositivos,            setDispositivos]            = useState<Dispositivo[]>([])
  const [dispositivoSeleccionado, setDispositivoSeleccionado] = useState<string | null>(null)
  const [vinculando,              setVinculando]              = useState(false)
  const [errorVinculo,            setErrorVinculo]            = useState('')

  useEffect(() => {
    if (paso === 'buscando') {
      animRef.current?.play()
      iniciarBusqueda()
    }
  }, [paso])

  // Deja el formulario y el flujo en blanco. Se llama al enfocar la pantalla
  // (registrar a alguien nuevo) y tras un registro+vinculación exitoso.
  const resetFormulario = () => {
    setNombrePaciente('')
    setEdadPaciente('')
    setEnfermedad('')
    setCedula('')
    setEps('')
    setFamiliarNombre('')
    setFamiliarTelefono('')
    setFoto(null)
    setError('')
    setPaso(1)
    setEditando(false)
    setPacienteId('')
    setDispositivos([])
    setDispositivoSeleccionado(null)
    setErrorVinculo('')
  }

  // Al volver a enfocar la pantalla (navegar y regresar) se empieza limpio.
  // "Volver al formulario" es un cambio interno de `paso`, no re-enfoca la
  // pantalla, así que no borra lo que estás editando en ese momento.
  useFocusEffect(
    useCallback(() => {
      resetFormulario()
    }, [])
  )

  const iniciarBusqueda = async () => {
    try {
      const [res] = await Promise.all([
        dispositivoService.disponibles(),
        new Promise(resolve => setTimeout(resolve, 5000)),
      ])
      setDispositivos(res.data ?? [])
    } catch {
      setDispositivos([])
    } finally {
      animRef.current?.pause()
      setPaso(2)
    }
  }

  const handleSeleccionarFoto = () => {
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
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.6,
            base64: true,
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
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.6,
            base64: true,
          })
          if (!result.canceled && result.assets[0].base64) {
            setFoto(`data:image/jpeg;base64,${result.assets[0].base64}`)
          }
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ])
  }

  const handleReintentar = () => {
    setDispositivos([])
    setDispositivoSeleccionado(null)
    setErrorVinculo('')
    setPaso('buscando')
  }

  // "Guardar paciente" NO escribe en la BD: solo valida y avanza a la búsqueda
  // de dispositivos. El paciente se crea recién al vincular un GPS (handleVincular),
  // para que no queden pacientes registrados sin dispositivo.
  const handleGuardar = () => {
    if (nombre_paciente.trim().length < 2) {
      setError('El nombre debe tener al menos 2 caracteres.')
      return
    }
    const edadNum = parseInt(edad_paciente)
    if (!edad_paciente || isNaN(edadNum) || edadNum < 1 || edadNum > 120) {
      setError('Ingresa una edad válida.')
      return
    }
    if (!cedula.trim() || cedula.trim().length < 6 || cedula.trim().length > 12) {
      setError('La cédula debe tener entre 6 y 12 dígitos.')
      return
    }
    if (!enfermedad.trim() || !tieneLetras(enfermedad)) {
      setError('Ingresa un diagnóstico válido (solo texto, sin números ni símbolos).')
      return
    }
    if (!eps.trim() || !tieneLetras(eps)) {
      setError('Ingresa una EPS válida (solo texto, sin números ni símbolos).')
      return
    }
    if (!familiar_nombre.trim() || !tieneLetras(familiar_nombre)) {
      setError('Ingresa el nombre del contacto de emergencia (solo texto).')
      return
    }
    if (!familiar_telefono.trim() || familiar_telefono.trim().length < 7) {
      setError('Ingresa el teléfono del contacto de emergencia (mínimo 7 dígitos).')
      return
    }
    setError('')

    // Si veníamos del paso 2 ("Volver al formulario"), regresamos a la lista de
    // dispositivos ya buscada. Si es la primera vez, iniciamos la búsqueda.
    if (editando) {
      setEditando(false)
      setPaso(2)
    } else {
      setPaso('buscando')
    }
  }

  const handleVincular = async () => {
    if (!dispositivoSeleccionado) return
    setVinculando(true)
    setErrorVinculo('')
    try {
      // El paciente se crea aquí, la primera vez. Si el vínculo falla después,
      // conservamos `pacienteId` para reintentar solo la vinculación sin volver
      // a registrar ni perder los datos.
      let id = pacienteId
      if (!id) {
        const res = await pacienteService.registrar({
          nombre_paciente:   nombre_paciente.trim(),
          edad_paciente:     parseInt(edad_paciente),
          enfermedad:        enfermedad.trim(),
          cedula:            cedula.trim(),
          eps:               eps.trim(),
          familiar_nombre:   familiar_nombre.trim(),
          familiar_telefono: familiar_telefono.trim(),
          id_cuidador:       cuidador?.id ?? '',
          ...(foto ? { foto } : {}),
        } as any)
        id = res.data?.id_paciente
        if (!id) throw new Error('No se pudo registrar el paciente.')
        setPacienteId(id)
      }

      await dispositivoService.vincular({ id_dispositivo: dispositivoSeleccionado, paciente_id: id })
      resetFormulario()
      router.replace('/(app)/pacientes')
    } catch (err: any) {
      setErrorVinculo(mensajeDeError(err, 'No se pudo registrar o vincular. Inténtalo de nuevo.'))
    } finally {
      setVinculando(false)
    }
  }

  if (paso === 'buscando' || paso === 2) {
    const buscando  = paso === 'buscando'
    const encontro  = dispositivos.length > 0

    return (
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Ionicons name="hardware-chip-outline" size={22} color={Colors.white} />
          <Text style={styles.headerTitle}>Vincular dispositivo GPS</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.card}>

            <View style={styles.lottieContainer}>
              <LottieView
                ref={animRef}
                source={require('../../../animations/planet.json')}
                autoPlay={false}
                loop
                style={styles.lottie}
              />
            </View>

            {buscando ? (
              <Text style={styles.buscandoTitle}>Buscando dispositivos...</Text>
            ) : (
              <>
                {encontro ? (
                  <>
                    <Text style={styles.resultTitle}>Dispositivos encontrados</Text>

                    {errorVinculo ? (
                      <View style={styles.errorBox}>
                        <Ionicons name="warning-outline" size={15} color={Colors.error} style={{ marginRight: 6 }} />
                        <Text style={styles.errorText}>{errorVinculo}</Text>
                      </View>
                    ) : null}

                    {dispositivos.map((d) => {
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
                    })}

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
                  </>
                ) : (
                  <>
                    <Text style={styles.noEncontradoTitle}>No se encontró ningún dispositivo</Text>
                    <Text style={styles.noEncontradoDesc}>
                      Asegúrate de que el GPS esté encendido y dentro del rango. Puedes reintentar la búsqueda o vincularlo después.
                    </Text>
                    <TouchableOpacity style={styles.reloadBtn} onPress={handleReintentar} activeOpacity={0.7}>
                      <Ionicons name="refresh-outline" size={16} color="#102e50" />
                      <Text style={styles.reloadText}>Reintentar búsqueda</Text>
                    </TouchableOpacity>
                  </>
                )}

                <TouchableOpacity
                  style={styles.volverFormBtn}
                  onPress={() => { setEditando(true); setPaso(1) }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="arrow-back" size={16} color="#102e50" />
                  <Text style={styles.volverFormText}>Volver al formulario</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.salirBtn}
                  onPress={() => router.replace('/(app)')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.salirText}>Salir</Text>
                </TouchableOpacity>
              </>
            )}
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
        <Text style={styles.headerTitle}>{editando ? 'Editar paciente' : 'Registrar paciente'}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="warning-outline" size={15} color={Colors.error} style={{ marginRight: 6 }} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* ── Foto del paciente ────────────────────────────────── */}
          <View style={styles.fotoContainer}>
            <TouchableOpacity style={styles.fotoBtn} onPress={handleSeleccionarFoto} activeOpacity={0.8}>
              {foto ? (
                <Image source={{ uri: foto }} style={styles.fotoImagen} />
              ) : (
                <View style={styles.fotoPlaceholder}>
                  <Ionicons name="camera-outline" size={28} color={Colors.textSecondary} />
                </View>
              )}
              <View style={styles.fotoBadge}>
                <Ionicons name="pencil" size={12} color={Colors.white} />
              </View>
            </TouchableOpacity>
            <Text style={styles.fotoLabel}>Foto del paciente{'\n'}<Text style={styles.opt}>Opcional</Text></Text>
          </View>

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
              <Text style={styles.label}>Cédula <Text style={styles.req}>*</Text></Text>
              <View style={styles.inputWrap}>
                <Ionicons name="card-outline" size={18} color={Colors.textSecondary} style={styles.icon} />
                <TextInput
                  style={styles.input}
                  placeholder="1234567890"
                  placeholderTextColor={Colors.textSecondary}
                  value={cedula}
                  onChangeText={(t) => setCedula(t.replace(/\D/g, '').slice(0, 12))}
                  keyboardType="number-pad"
                  maxLength={12}
                />
              </View>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Diagnóstico / Enfermedad <Text style={styles.req}>*</Text></Text>
            <View style={styles.inputWrap}>
              <Ionicons name="medkit-outline" size={18} color={Colors.textSecondary} style={styles.icon} />
              <TextInput
                style={styles.input}
                placeholder="Selecciona o escribe..."
                placeholderTextColor={Colors.textSecondary}
                value={enfermedad}
                onChangeText={(t) => { if (/^[^0-9]*$/.test(t)) setEnfermedad(t) }}
                autoCapitalize="sentences"
              />
            </View>
            <Sugerencias opciones={ENFERMEDADES} valor={enfermedad} onSelect={setEnfermedad} />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>EPS <Text style={styles.req}>*</Text></Text>
            <View style={styles.inputWrap}>
              <Ionicons name="medical-outline" size={18} color={Colors.textSecondary} style={styles.icon} />
              <TextInput
                style={styles.input}
                placeholder="Selecciona o escribe..."
                placeholderTextColor={Colors.textSecondary}
                value={eps}
                onChangeText={(t) => { if (/^[^0-9]*$/.test(t)) setEps(t) }}
                autoCapitalize="words"
              />
            </View>
            <Sugerencias opciones={EPS_LIST} valor={eps} onSelect={setEps} />
          </View>

          {/* ── Contacto de emergencia ──────────────────────────── */}
          <Text style={[styles.sectionLabel, { marginTop: 8 }]}>Contacto de emergencia</Text>
          <Text style={styles.sectionDesc}>
            Persona a quien contactar si el paciente sufre un accidente.
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>Nombre del familiar <Text style={styles.req}>*</Text></Text>
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
            <Text style={styles.label}>Teléfono del familiar <Text style={styles.req}>*</Text></Text>
            <View style={styles.inputWrap}>
              <Ionicons name="call-outline" size={18} color={Colors.textSecondary} style={styles.icon} />
              <TextInput
                style={styles.input}
                placeholder="Ej: 3001234567"
                placeholderTextColor={Colors.textSecondary}
                value={familiar_telefono}
                onChangeText={(t) => setFamiliarTelefono(t.replace(/\D/g, '').slice(0, 10))}
                keyboardType="phone-pad"
                maxLength={10}
              />
            </View>
          </View>

          <TouchableOpacity
            style={styles.btn}
            onPress={handleGuardar}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark-circle-outline" size={20} color={Colors.white} style={{ marginRight: 8 }} />
            <Text style={styles.btnText}>{editando ? 'Guardar cambios' : 'Guardar paciente'}</Text>
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

  pillsRow: { marginTop: 8, marginBottom: 4 },
  pill: {
    backgroundColor: '#e8f0fb', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7,
    borderWidth: 1, borderColor: '#c7d9f5',
  },
  pillText: { fontSize: 13, color: '#102e50', fontWeight: '500' },

  btn:         { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: '#102e50', borderRadius: 12, paddingVertical: 16, marginTop: 8, elevation: 4 },
  btnDisabled: { opacity: 0.65 },
  btnText:     { color: Colors.white, fontSize: 15, fontWeight: '700' },

  // Animación + búsqueda
  lottieContainer: { alignItems: 'center', marginBottom: 8 },
  lottie:          { width: 200, height: 200 },
  buscandoTitle:   { fontSize: 16, fontWeight: '700', color: '#102e50', textAlign: 'center', marginBottom: 8 },
  resultTitle:     { fontSize: 15, fontWeight: '700', color: '#2e7d32', textAlign: 'center', marginBottom: 16 },
  noEncontradoTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, textAlign: 'center', marginBottom: 8 },
  noEncontradoDesc:  { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  reloadBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#102e50', marginBottom: 4 },
  reloadText:  { fontSize: 13, fontWeight: '600', color: '#102e50' },

  deviceCard:         { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 14, padding: 14, marginBottom: 10, backgroundColor: Colors.background },
  deviceCardSelected: { borderColor: '#102e50', backgroundColor: '#e8f0fb' },
  deviceIcon:         { width: 42, height: 42, borderRadius: 12, backgroundColor: '#e8f0fb', justifyContent: 'center', alignItems: 'center' },
  deviceIconSelected: { backgroundColor: '#102e50' },
  deviceId:           { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  deviceFecha:        { fontSize: 12, color: Colors.textSecondary },

  skipBtn:  { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  skipText: { fontSize: 14, color: Colors.textSecondary, textDecorationLine: 'underline' },
  volverFormBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: '#102e50', marginTop: 12 },
  volverFormText: { fontSize: 14, fontWeight: '600', color: '#102e50' },
  salirBtn:       { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  salirText:      { fontSize: 14, color: Colors.textSecondary, textDecorationLine: 'underline' },

  fotoContainer:   { alignItems: 'center', marginBottom: 20, marginTop: 4 },
  fotoBtn:         { position: 'relative', marginBottom: 8 },
  fotoImagen:      { width: 88, height: 88, borderRadius: 44, borderWidth: 2, borderColor: '#102e50' },
  fotoPlaceholder: { width: 88, height: 88, borderRadius: 44, backgroundColor: Colors.background, borderWidth: 2, borderColor: Colors.border, justifyContent: 'center', alignItems: 'center' },
  fotoBadge:       { position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: '#102e50', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: Colors.white },
  fotoLabel:       { fontSize: 13, fontWeight: '600', color: Colors.text, textAlign: 'center', lineHeight: 18 },
})
