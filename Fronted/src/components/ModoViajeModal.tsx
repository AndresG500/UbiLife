import { useState, useEffect } from 'react'
import {
  View, Text, TouchableOpacity, Modal, StyleSheet,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '@/constants/Colors'
import { modoViajeService } from '@/services/api'
import { useAuth } from '@/context/AuthContext'
import { mensajeDeError } from '@/utils/errores'
import ConfirmModal from '@/components/ConfirmModal'

type Tipo = 'caminata' | 'vehiculo'

interface Paciente {
  id: string
  nombre: string
}

interface EstadoActivo {
  activo: boolean
  tipo?: string
  fin?: string | null
  nombre_paciente?: string
}

interface Props {
  visible: boolean
  onClose: () => void
  pacientes: Paciente[]
  estadoActivo: EstadoActivo | null
  onCambio: () => void
}

const DURACIONES = [
  { label: '1 hora',       horas: 1 },
  { label: '4 horas',      horas: 4 },
  { label: '8 horas',      horas: 8 },
  { label: 'Todo el día',  horas: 24 },
  { label: 'Indefinido',   horas: null },
]

export default function ModoViajeModal({ visible, onClose, pacientes, estadoActivo, onCambio }: Props) {
  const { tipoUsuario } = useAuth()
  const esFamiliar = tipoUsuario === 'familiar'

  const [paso,        setPaso]        = useState<'tipo' | 'duracion'>('tipo')
  const [tipoSel,     setTipoSel]     = useState<Tipo | null>(null)
  const [pacienteSel, setPacienteSel] = useState<string>(pacientes[0]?.id ?? '')
  const [cargando,         setCargando]         = useState(false)
  const [confirmDesactivar, setConfirmDesactivar] = useState(false)

  useEffect(() => {
    if (pacientes.length > 0 && !pacienteSel) {
      setPacienteSel(pacientes[0].id)
    }
  }, [pacientes])

  const resetear = () => {
    setPaso('tipo')
    setTipoSel(null)
    setPacienteSel(pacientes[0]?.id ?? '')
  }

  const handleClose = () => {
    resetear()
    onClose()
  }

  const handleSelTipo = (t: Tipo) => {
    setTipoSel(t)
    setPaso('duracion')
  }

  const handleActivar = async (duracionHoras: number | null) => {
    if (!pacienteSel) {
      Alert.alert('Selecciona un paciente')
      return
    }
    setCargando(true)
    try {
      const payload = {
        paciente_id:   pacienteSel,
        tipo:          tipoSel!,
        duracion_horas: duracionHoras,
      }
      if (esFamiliar) {
        await modoViajeService.activarFamiliar(payload)
      } else {
        await modoViajeService.activar(payload)
      }
      onCambio()
      handleClose()
    } catch (err: any) {
      Alert.alert('Error al activar', mensajeDeError(err, 'No se pudo activar el modo viaje. Inténtalo de nuevo.'))
    } finally {
      setCargando(false)
    }
  }

  const handleDesactivar = () => {
    if (!estadoActivo) return
    setConfirmDesactivar(true)
  }

  const ejecutarDesactivar = async () => {
    const pac = pacientes[0]?.id ?? ''
    if (!pac) return
    setConfirmDesactivar(false)
    setCargando(true)
    try {
      if (esFamiliar) {
        await modoViajeService.desactivarFamiliar(pac)
      } else {
        await modoViajeService.desactivar(pac)
      }
      onCambio()
      handleClose()
    } catch (err: any) {
      Alert.alert('Error al desactivar', mensajeDeError(err, 'No se pudo desactivar el modo viaje. Inténtalo de nuevo.'))
    } finally {
      setCargando(false)
    }
  }

  const tipoLabel = estadoActivo?.tipo === 'vehiculo' ? 'Vehículo' : 'Caminata'
  const finLabel  = estadoActivo?.fin
    ? new Date(estadoActivo.fin).toLocaleString('es-CO', {
        hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short',
      })
    : 'Indefinido'

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={handleClose} />

      <View style={styles.sheet}>
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.headerRow}>
          {paso === 'duracion' && !estadoActivo?.activo && (
            <TouchableOpacity onPress={() => setPaso('tipo')} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={20} color={Colors.text} />
            </TouchableOpacity>
          )}
          <Text style={styles.title}>Modo Viaje</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Estado activo */}
        {estadoActivo?.activo ? (
          <View style={styles.activoWrap}>
            <View style={styles.activoBadge}>
              <Ionicons
                name={estadoActivo.tipo === 'vehiculo' ? 'car' : 'walk'}
                size={22}
                color="#102e50"
              />
              <View>
                <Text style={styles.activoTipo}>Modo {tipoLabel} activo</Text>
                <Text style={styles.activoInfo}>
                  {estadoActivo.nombre_paciente} · Hasta: {finLabel}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.btnDesactivar, cargando && { opacity: 0.6 }]}
              onPress={handleDesactivar}
              disabled={cargando}
              activeOpacity={0.85}
            >
              {cargando
                ? <ActivityIndicator color={Colors.white} size="small" />
                : <Text style={styles.btnDesactivarText}>Desactivar modo viaje</Text>}
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>

            {/* Selector de paciente (si hay más de uno) */}
            {pacientes.length > 1 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>¿Con qué paciente?</Text>
                <View style={styles.pacRow}>
                  {pacientes.map((p) => {
                    const sel = pacienteSel === p.id
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={[styles.pacChip, sel && styles.pacChipSel]}
                        onPress={() => setPacienteSel(p.id)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.pacChipText, sel && styles.pacChipTextSel]}>
                          {p.nombre}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>
            )}

            {/* Paso 1: Elegir tipo */}
            {paso === 'tipo' && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>¿Cómo van a salir?</Text>
                <View style={styles.tipoRow}>
                  <TouchableOpacity
                    style={styles.tipoCard}
                    onPress={() => handleSelTipo('caminata')}
                    activeOpacity={0.85}
                  >
                    <View style={styles.tipoIconWrap}>
                      <Ionicons name="walk" size={38} color="#102e50" />
                    </View>
                    <Text style={styles.tipoCardLabel}>Caminar</Text>
                    <Text style={styles.tipoCardDesc}>Salida a pie con el paciente</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.tipoCard}
                    onPress={() => handleSelTipo('vehiculo')}
                    activeOpacity={0.85}
                  >
                    <View style={styles.tipoIconWrap}>
                      <Ionicons name="car" size={38} color="#102e50" />
                    </View>
                    <Text style={styles.tipoCardLabel}>Vehículo</Text>
                    <Text style={styles.tipoCardDesc}>Viaje en carro, bus u otro</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Paso 2: Elegir duración */}
            {paso === 'duracion' && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>
                  ¿Cuánto tiempo?
                </Text>
                <Text style={styles.sectionSub}>
                  {tipoSel === 'caminata' ? 'Caminata' : 'Viaje en vehículo'} con{' '}
                  {pacientes.find(p => p.id === pacienteSel)?.nombre ?? 'el paciente'}
                </Text>

                {DURACIONES.map((d) => (
                  <TouchableOpacity
                    key={d.label}
                    style={[styles.duracionBtn, cargando && { opacity: 0.6 }]}
                    onPress={() => handleActivar(d.horas)}
                    disabled={cargando}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name={d.horas === null ? 'infinite-outline' : 'time-outline'}
                      size={20}
                      color="#102e50"
                    />
                    <Text style={styles.duracionLabel}>{d.label}</Text>
                    {cargando && d.horas === undefined ? (
                      <ActivityIndicator size="small" color="#102e50" />
                    ) : (
                      <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

          </ScrollView>
        )}
      </View>

      <ConfirmModal
        visible={confirmDesactivar}
        titulo="Desactivar modo viaje"
        mensaje="¿Quieres desactivar el modo viaje? El monitoreo normal se reanudará."
        textoConfirm="Desactivar"
        onCancel={() => setConfirmDesactivar(false)}
        onConfirm={ejecutarDesactivar}
        destructivo
      />
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingBottom: 36,
    paddingTop: 12,
    maxHeight: '75%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 20,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  backBtn:  { padding: 4, marginRight: 8 },
  closeBtn: { padding: 4, marginLeft: 'auto' },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },

  section:      { marginBottom: 16 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  sectionSub:   { fontSize: 13, color: Colors.textSecondary, marginBottom: 16 },

  pacRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  pacChip:      { borderWidth: 1.5, borderColor: Colors.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  pacChipSel:   { borderColor: '#102e50', backgroundColor: '#f0f4f8' },
  pacChipText:  { fontSize: 13, color: Colors.textSecondary },
  pacChipTextSel: { color: '#102e50', fontWeight: '700' },

  tipoRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  tipoCard: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f7fbfc',
  },
  tipoIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#e8eef5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  tipoCardLabel: { fontSize: 15, fontWeight: '700', color: '#102e50' },
  tipoCardDesc:  { fontSize: 11, color: Colors.textSecondary, textAlign: 'center', lineHeight: 16 },

  duracionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 15,
    paddingHorizontal: 16,
    backgroundColor: '#f7fbfc',
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  duracionLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: '#102e50' },

  activoWrap: { gap: 16, paddingBottom: 8 },
  activoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#e8f4f0',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#b6ddd2',
  },
  activoTipo: { fontSize: 15, fontWeight: '700', color: '#102e50' },
  activoInfo: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  btnDesactivar: {
    backgroundColor: Colors.error,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  btnDesactivarText: { color: Colors.white, fontSize: 15, fontWeight: '700' },
})
