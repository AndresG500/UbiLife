import { useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import LottieView from 'lottie-react-native'
import { Colors } from '@/constants/Colors'
import { dispositivoService, pacienteService } from '@/services/api'
import { mensajeDeError } from '@/utils/errores'
import AnimatedScreen from '@/components/AnimatedScreen'

export default function VincularDispositivoScreen() {
  const router   = useRouter()
  const animRef  = useRef<LottieView>(null)
  const [buscando,     setBuscando]     = useState(true)
  const [dispositivos, setDispositivos] = useState<any[]>([])
  const [pacientes,    setPacientes]    = useState<any[]>([])
  const [pacSelId,     setPacSelId]     = useState<string>('')
  const [vinculando,   setVinculando]   = useState<string | null>(null)
  const [vinculado,    setVinculado]    = useState(false)

  const iniciarBusqueda = async () => {
    setBuscando(true)
    setDispositivos([])
    animRef.current?.play()
    try {
      const [resDev] = await Promise.all([
        dispositivoService.disponibles(),
        new Promise(resolve => setTimeout(resolve, 5000)),
      ])
      setDispositivos(Array.isArray(resDev.data) ? resDev.data : [])
    } catch {
      Alert.alert('Error', 'No se pudo conectar al servidor.')
      setDispositivos([])
    } finally {
      animRef.current?.pause()
      setBuscando(false)
    }
  }

  useEffect(() => {
    pacienteService.listar().then(res => {
      const pacs = Array.isArray(res.data) ? res.data : []
      setPacientes(pacs)
      if (pacs.length > 0) setPacSelId(pacs[0].id_paciente ?? pacs[0].id)
    }).catch(() => {})
    iniciarBusqueda()
  }, [])

  const handleVincular = async (id_dispositivo: string) => {
    if (!pacSelId) {
      Alert.alert('Sin paciente', 'Primero registra un paciente.')
      return
    }
    setVinculando(id_dispositivo)
    try {
      await dispositivoService.vincular({ id_dispositivo, paciente_id: pacSelId })
      setVinculado(true)
    } catch (err: any) {
      Alert.alert('Error al vincular', mensajeDeError(err, 'No se pudo vincular el dispositivo. Inténtalo de nuevo.'))
    } finally {
      setVinculando(null)
    }
  }

  if (vinculado) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={52} color={Colors.white} />
          </View>
          <Text style={styles.successTitle}>¡Dispositivo vinculado!</Text>
          <Text style={styles.successSub}>El dispositivo GPS quedó asociado al paciente correctamente.</Text>
          <TouchableOpacity style={styles.btn} onPress={() => router.replace('/(app)')} activeOpacity={0.85}>
            <Text style={styles.btnText}>Ir al mapa</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <AnimatedScreen>
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Vincular dispositivo</Text>
      </View>

      <View style={styles.body}>
        {/* Selector de paciente */}
        {pacientes.length > 1 && (
          <View style={styles.pacSection}>
            <Text style={styles.sectionLabel}>Vincular al paciente:</Text>
            <FlatList
              horizontal
              data={pacientes}
              keyExtractor={(p) => p.id_paciente ?? p.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
              renderItem={({ item }) => {
                const id       = item.id_paciente ?? item.id
                const selected = pacSelId === id
                return (
                  <TouchableOpacity
                    style={[styles.pacChip, selected && styles.pacChipActivo]}
                    onPress={() => setPacSelId(id)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.pacChipText, selected && styles.pacChipTextActivo]}>
                      {item.nombre_paciente}
                    </Text>
                  </TouchableOpacity>
                )
              }}
            />
          </View>
        )}

        {buscando ? (
          <View style={styles.center}>
            <LottieView
              ref={animRef}
              source={require('../../../animations/planet.json')}
              autoPlay={false}
              loop
              style={styles.lottie}
            />
            <Text style={styles.buscandoText}>Buscando dispositivos...</Text>
            <Text style={styles.buscandoSub}>Asegúrate de que el ESP32 esté encendido y cerca.</Text>
          </View>
        ) : dispositivos.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="wifi-outline" size={64} color={Colors.primaryLight} />
            <Text style={styles.buscandoText}>No se encontraron dispositivos</Text>
            <TouchableOpacity style={styles.btn} onPress={iniciarBusqueda} activeOpacity={0.85}>
              <Text style={styles.btnText}>Buscar de nuevo</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.listTitle}>Dispositivos disponibles ({dispositivos.length})</Text>
            <FlatList
              data={dispositivos}
              keyExtractor={(d) => d.id_dispositivo}
              contentContainerStyle={{ gap: 12 }}
              renderItem={({ item }) => (
                <View style={styles.dispCard}>
                  <View style={styles.dispIcon}>
                    <Ionicons name="hardware-chip-outline" size={24} color={Colors.primary} />
                  </View>
                  <View style={styles.dispInfo}>
                    <Text style={styles.dispNombre}>{item.id_dispositivo}</Text>
                    {item.dispositivo_detectado && (
                      <Text style={styles.dispFecha}>
                        Detectado: {new Date(item.dispositivo_detectado).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={[styles.vincBtn, vinculando === item.id_dispositivo && styles.vincBtnLoading]}
                    onPress={() => handleVincular(item.id_dispositivo)}
                    disabled={!!vinculando}
                    activeOpacity={0.85}
                  >
                    {vinculando === item.id_dispositivo
                      ? <ActivityIndicator size="small" color={Colors.white} />
                      : <Text style={styles.vincBtnText}>Vincular</Text>}
                  </TouchableOpacity>
                </View>
              )}
            />
          </>
        )}
      </View>

      <TouchableOpacity style={styles.skipBtn} onPress={() => router.replace('/(app)')} activeOpacity={0.7}>
        <Text style={styles.skipText}>Omitir por ahora</Text>
      </TouchableOpacity>
    </SafeAreaView>
    </AnimatedScreen>
  )
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: Colors.primary },
  header:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20, gap: 14 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.white },
  body:    { flex: 1, backgroundColor: Colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24 },
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  pacSection:   { marginBottom: 20 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 10 },
  pacChip:       { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.border },
  pacChipActivo: { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },
  pacChipText:       { fontSize: 13, color: Colors.textSecondary },
  pacChipTextActivo: { color: Colors.primary, fontWeight: '700' },
  lottie:       { width: 200, height: 200 },
  buscandoText: { fontSize: 18, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  buscandoSub:  { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
  listTitle:    { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  dispCard:  { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderRadius: 16, padding: 16, gap: 12, elevation: 3 },
  dispIcon:  { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.primaryBg, justifyContent: 'center', alignItems: 'center' },
  dispInfo:  { flex: 1 },
  dispNombre:{ fontSize: 14, fontWeight: '700', color: Colors.text },
  dispFecha: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  vincBtn:        { backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16 },
  vincBtnLoading: { opacity: 0.7 },
  vincBtnText:    { color: Colors.white, fontWeight: '700', fontSize: 13 },
  btn:       { backgroundColor: Colors.white, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32 },
  btnText:   { color: Colors.primary, fontWeight: '700', fontSize: 15 },
  skipBtn:   { alignItems: 'center', paddingVertical: 20 },
  skipText:  { color: 'rgba(255,255,255,0.65)', fontSize: 14 },
  successIcon:  { width: 96, height: 96, borderRadius: 48, backgroundColor: Colors.success, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  successTitle: { fontSize: 26, fontWeight: '800', color: Colors.white },
  successSub:   { fontSize: 14, color: 'rgba(255,255,255,0.75)', textAlign: 'center', lineHeight: 21 },
})
