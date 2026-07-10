import { useEffect, useState, useCallback, useRef } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, TextInput, Modal, ScrollView, RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { CameraView, useCameraPermissions } from 'expo-camera'
import QRCode from 'react-native-qrcode-svg'
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
import { reverseGeocode } from '@/utils/geocoding'

interface Grupo {
  id:                    string
  nombre:                string
  cuidador_principal_id: string
  cuidador_ids:          string[]
  paciente_ids:          string[]
  familiar_ids:          string[]
  codigo?:               string
  created_at:            string
}

interface MiembrosGrupo {
  pacientes:  any[]
  familiares: any[]
}

interface Invitacion {
  id:         string
  token:      string
  expira_en:  string | null
  created_at: string | null
}

function UbicacionLabel({ ub }: { ub: { latitud?: number; longitud?: number; lat?: number; lng?: number } | null | undefined }) {
  const [texto, setTexto] = useState<string | null>(null)
  useEffect(() => {
    if (!ub) return
    const lat = ub.latitud ?? ub.lat
    const lng = ub.longitud ?? ub.lng
    if (lat == null || lng == null) return
    reverseGeocode(lat, lng).then(setTexto)
  }, [ub])
  if (!texto) return null
  return (
    <View style={styles.coordRow}>
      <Ionicons name="location" size={11} color={Colors.textSecondary} />
      <Text style={styles.coordText} numberOfLines={2}>{texto}</Text>
    </View>
  )
}

function PacienteCard({ pac }: { pac: any }) {
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
        {pac.ultima_ubicacion ? (
          <UbicacionLabel ub={pac.ultima_ubicacion} />
        ) : (
          <Text style={styles.sinUbi}>Sin ubicación reciente</Text>
        )}
      </View>
    </View>
  )
}

function FamiliarCard({ fam, esMismo, onExpulsar }: { fam: any; esMismo?: boolean; onExpulsar?: () => void }) {
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
        {fam.ultima_ubicacion ? (
          <UbicacionLabel ub={fam.ultima_ubicacion} />
        ) : (
          <Text style={styles.sinUbi}>Sin ubicación reciente</Text>
        )}
      </View>
      {onExpulsar && (
        <TouchableOpacity onPress={onExpulsar} style={styles.expulsarBtn} activeOpacity={0.7}>
          <Ionicons name="person-remove-outline" size={18} color={Colors.error} />
        </TouchableOpacity>
      )}
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
  const [invitacionesMap, setInvitacionesMap] = useState<Record<string, Invitacion[]>>({})
  const [generando,     setGenerando]     = useState<string | null>(null)
  const [qrToken,       setQrToken]       = useState<string | null>(null)
  const [escaneando,    setEscaneando]    = useState(false)
  const [permisoCamara, solicitarPermisoCamara] = useCameraPermissions()
  const scanEnCurso = useRef(false)

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

      // Invitaciones activas (solo cuidadores)
      if (!esFamiliar) {
        const invMap: Record<string, Invitacion[]> = {}
        await Promise.all(
          gruposList.map(async (g) => {
            try {
              const res = await grupoService.listarInvitaciones(g.id)
              invMap[g.id] = Array.isArray(res.data) ? res.data : []
            } catch {
              invMap[g.id] = []
            }
          })
        )
        setInvitacionesMap(invMap)
      }
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

  const handleUnirse = async (codigoParam?: string) => {
    const codigo = (codigoParam ?? codigoInput).trim()
    if (!codigo) { Alert.alert('Falta el código', 'Ingresa el código de invitación.'); return }
    setUniendose(true)
    try {
      await grupoService.unirseConCodigo(codigo)
      setModalUnirse(false); setCodigoInput('')
      await cargarDatos()
      mostrarExito('Te has unido al grupo familiar.')
    } catch (err: any) {
      Alert.alert('Código no válido', mensajeDeError(err, 'El código no es válido o ya expiró. Verifica e intenta de nuevo.'))
    } finally { setUniendose(false) }
  }

  const abrirEscaner = async () => {
    if (!permisoCamara?.granted) {
      const res = await solicitarPermisoCamara()
      if (!res.granted) {
        Alert.alert('Permiso requerido', 'Se necesita acceso a la cámara para escanear el código QR.')
        return
      }
    }
    scanEnCurso.current = false
    setEscaneando(true)
  }

  const onCodigoEscaneado = ({ data }: { data: string }) => {
    if (scanEnCurso.current) return
    scanEnCurso.current = true
    const codigo = (data || '').trim().toUpperCase()
    setEscaneando(false)
    setCodigoInput(codigo)
    handleUnirse(codigo)
  }

  const copiarCodigo = async (codigo: string) => {
    await Clipboard.setStringAsync(codigo)
    Alert.alert('Copiado', 'Código de invitación copiado al portapapeles.')
  }

  const generarInvitacion = async (grupoId: string) => {
    setGenerando(grupoId)
    try {
      await grupoService.crearInvitacion(grupoId)
      const res = await grupoService.listarInvitaciones(grupoId)
      setInvitacionesMap((prev) => ({ ...prev, [grupoId]: Array.isArray(res.data) ? res.data : [] }))
      mostrarExito('Invitación generada. Compártela con un familiar.')
    } catch (err: any) {
      Alert.alert('Error', mensajeDeError(err, 'No se pudo generar la invitación. Inténtalo de nuevo.'))
    } finally { setGenerando(null) }
  }

  const handleRevocarInvitacion = async (grupoId: string, invId: string) => {
    try {
      await grupoService.revocarInvitacion(grupoId, invId)
      setInvitacionesMap((prev) => ({
        ...prev,
        [grupoId]: (prev[grupoId] ?? []).filter((i) => i.id !== invId),
      }))
    } catch (err: any) {
      Alert.alert('Error', mensajeDeError(err, 'No se pudo revocar la invitación.'))
    }
  }

  const handleExpulsarFamiliar = (grupoId: string, familiarId: string, nombre: string) => {
    Alert.alert(
      'Quitar del grupo',
      `¿Seguro que quieres quitar a ${nombre}? Dejará de ver la ubicación de los pacientes.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Quitar', style: 'destructive',
          onPress: async () => {
            try {
              await grupoService.expulsarFamiliar(grupoId, familiarId)
              await cargarDatos()
              mostrarExito('Familiar eliminado del grupo.')
            } catch (err: any) {
              Alert.alert('Error', mensajeDeError(err, 'No se pudo quitar al familiar.'))
            }
          },
        },
      ]
    )
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

                {/* Invitaciones — solo cuidadores */}
                {!esFamiliar && (
                  <View style={styles.codigoBox}>
                    <View style={styles.codigoHeader}>
                      <Ionicons name="key" size={13} color={Colors.primary} />
                      <Text style={styles.codigoLabel}>Invitaciones</Text>
                    </View>

                    {(invitacionesMap[grupo.id] ?? []).length === 0 ? (
                      <Text style={styles.invVacio}>No hay invitaciones activas. Genera una para sumar a un familiar.</Text>
                    ) : (
                      (invitacionesMap[grupo.id] ?? []).map((inv) => (
                        <View key={inv.id} style={styles.invRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.codigoText}>{inv.token}</Text>
                          </View>
                          <TouchableOpacity onPress={() => setQrToken(inv.token)} style={styles.copyBtn}>
                            <Ionicons name="qr-code-outline" size={18} color={Colors.primary} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => copiarCodigo(inv.token)} style={styles.copyBtn}>
                            <Ionicons name="copy-outline" size={18} color={Colors.primary} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleRevocarInvitacion(grupo.id, inv.id)} style={styles.copyBtn}>
                            <Ionicons name="trash-outline" size={18} color={Colors.error} />
                          </TouchableOpacity>
                        </View>
                      ))
                    )}

                    <TouchableOpacity
                      style={styles.invGenBtn}
                      onPress={() => generarInvitacion(grupo.id)}
                      disabled={generando === grupo.id}
                      activeOpacity={0.85}
                    >
                      {generando === grupo.id ? (
                        <ActivityIndicator color={Colors.primary} size="small" />
                      ) : (
                        <>
                          <Ionicons name="add" size={18} color={Colors.primary} />
                          <Text style={styles.invGenText}>Generar invitación</Text>
                        </>
                      )}
                    </TouchableOpacity>
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
                        onExpulsar={!esFamiliar ? () => handleExpulsarFamiliar(grupo.id, f.id, f.name || f.email) : undefined}
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
            <TouchableOpacity style={styles.scanBtn} onPress={abrirEscaner} disabled={uniendose} activeOpacity={0.8}>
              <Ionicons name="qr-code-outline" size={20} color={Colors.primary} />
              <Text style={styles.scanBtnText}>Escanear QR</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.modalBtn, uniendose && { opacity: 0.65 }]} onPress={() => handleUnirse()} disabled={uniendose} activeOpacity={0.85}>
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

      {/* Modal: QR de invitación (cuidador) */}
      <Modal visible={!!qrToken} transparent animationType="fade" onRequestClose={() => setQrToken(null)}>
        <View style={styles.qrOverlay}>
          <View style={styles.qrModal}>
            <View style={styles.qrHeader}>
              <Text style={styles.qrTitle}>Invitación</Text>
              <TouchableOpacity onPress={() => setQrToken(null)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.qrDesc}>Pide al familiar que escanee este código para unirse al grupo.</Text>
            <View style={styles.qrWrap}>
              {qrToken ? <QRCode value={qrToken} size={220} color={Colors.primary} backgroundColor={Colors.white} /> : null}
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: escáner QR (familiar) */}
      <Modal visible={escaneando} animationType="slide" onRequestClose={() => setEscaneando(false)}>
        <View style={styles.scanRoot}>
          <CameraView
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={onCodigoEscaneado}
          />
          <View style={styles.scanOverlay}>
            <View style={styles.scanMarco} />
            <Text style={styles.scanTexto}>Apunta al código QR de la invitación</Text>
          </View>
          <TouchableOpacity style={styles.scanCancelar} onPress={() => setEscaneando(false)} activeOpacity={0.85}>
            <Text style={styles.scanCancelarText}>Cancelar</Text>
          </TouchableOpacity>
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

  invVacio:  { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginBottom: 10 },
  invRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  invGenBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: Colors.primary, borderStyle: 'dashed', borderRadius: 10, paddingVertical: 10, marginBottom: 8 },
  invGenText:{ fontSize: 13, fontWeight: '700', color: Colors.primary },
  expulsarBtn: { padding: 6, marginLeft: 4 },

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

  scanBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: Colors.primary, borderRadius: 12, paddingVertical: 14, marginBottom: 12 },
  scanBtnText:  { color: Colors.primary, fontSize: 15, fontWeight: '700' },

  qrOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  qrModal:  { backgroundColor: Colors.white, borderRadius: 24, padding: 24, alignItems: 'center', width: '100%', maxWidth: 360 },
  qrHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 12 },
  qrTitle:  { fontSize: 20, fontWeight: '700', color: Colors.text },
  qrDesc:   { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginBottom: 20, lineHeight: 19 },
  qrWrap:   { backgroundColor: Colors.white, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: Colors.border },

  scanRoot:        { flex: 1, backgroundColor: '#000' },
  scanOverlay:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 },
  scanMarco:       { width: 240, height: 240, borderRadius: 24, borderWidth: 3, borderColor: Colors.white, backgroundColor: 'transparent' },
  scanTexto:       { color: Colors.white, fontSize: 15, fontWeight: '600', textAlign: 'center', paddingHorizontal: 32 },
  scanCancelar:    { position: 'absolute', bottom: 48, alignSelf: 'center', backgroundColor: Colors.white, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 40 },
  scanCancelarText:{ color: Colors.text, fontSize: 16, fontWeight: '700' },

  successBox:  { position: 'absolute', top: 16, left: 16, right: 16, zIndex: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', borderRadius: 12, padding: 14, borderLeftWidth: 4, borderLeftColor: Colors.success, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
  successText: { flex: 1, color: '#065f46', fontSize: 13, lineHeight: 19 },
})
