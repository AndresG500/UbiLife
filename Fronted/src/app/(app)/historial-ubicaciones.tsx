import { useEffect, useState, useCallback } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import WebView from 'react-native-webview'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { Colors } from '@/constants/Colors'
import { pacienteService, familiarService } from '@/services/api'
import { useAuth } from '@/context/AuthContext'
import AnimatedScreen from '@/components/AnimatedScreen'
import { reverseGeocode } from '@/utils/geocoding'

interface Ubicacion {
  id: string
  paciente_id: string
  coordenadas: { latitud: number; longitud: number }
  timestamp: string
}

function escaparJs(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/`/g, '\\`')
    .replace(/</g, '\\x3C')
    .replace(/>/g, '\\x3E')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
}

function buildHistorialHtml(puntos: { latitude: number; longitude: number }[], nombrePaciente: string = 'Paciente'): string {
  const centro = puntos.length > 0
    ? puntos[puntos.length - 1]
    : { latitude: 11.2404, longitude: -74.211 }
  const zoom = puntos.length > 0 ? 15 : 13
  const nombreJs = escaparJs(nombrePaciente)

  const coordsJs = (() => {
    if (puntos.length === 0) return ''
    const latlngsJson = JSON.stringify(puntos.map(p => [p.latitude, p.longitude]))
    const lines = [
      `var latlngs = ${latlngsJson};`,
      `L.polyline(latlngs, { color: '#2563eb', weight: 4, opacity: 0.85 }).addTo(map);`,
      `map.fitBounds(latlngs, { padding: [30, 30] });`,
    ]
    if (puntos.length > 1) {
      const first = puntos[0]
      lines.push(`L.circleMarker([${first.latitude}, ${first.longitude}], { radius: 7, color: '#16a34a', fillColor: '#16a34a', fillOpacity: 1 }).addTo(map);`)
    }
    const last = puntos[puntos.length - 1]
    lines.push(`L.marker([${last.latitude}, ${last.longitude}], { icon: crearIconoPaciente('${nombreJs}') }).addTo(map);`)
    return lines.join('\n    ')
  })()

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        integrity="sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H"
        crossorigin="anonymous"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
          integrity="sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH"
          crossorigin="anonymous"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; overflow: hidden; }
    #map { height: 100vh; width: 100%; }
    .leaflet-control-attribution { display: none !important; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: false }).setView([${centro.latitude}, ${centro.longitude}], ${zoom});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: 'abc',
    }).addTo(map);

    function crearIconoPaciente(nombre) {
      var html =
        '<div style="display:flex;flex-direction:column;align-items:center;">' +
          '<div style="width:36px;height:36px;border-radius:50%;background:#1d4ed8;border:3px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.4)">' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="white">' +
              '<path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>' +
            '</svg>' +
          '</div>' +
          '<div style="background:white;border-radius:6px;padding:2px 7px;font-size:10px;font-weight:700;color:#102e50;margin-top:3px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.18);">' + nombre + '</div>' +
        '</div>';
      return L.divIcon({ html: html, className: '', iconSize: [90, 58], iconAnchor: [45, 18] });
    }

    ${coordsJs}
  </script>
</body>
</html>`
}

export default function HistorialUbicacionesScreen() {
  const router = useRouter()
  const { tipoUsuario } = useAuth()
  const [loading,           setLoading]           = useState(true)
  const [pacientes,         setPacientes]         = useState<any[]>([])
  const [ubicaciones,       setUbicaciones]       = useState<Ubicacion[]>([])
  const [selectedPaciente,  setSelectedPaciente]  = useState<string | null>(null)
  const [direccion,         setDireccion]         = useState<string | null>(null)

  const cargarRuta = useCallback(async (pacienteId: string) => {
    try {
      const res  = tipoUsuario === 'familiar'
        ? await pacienteService.rutaFamiliar(pacienteId)
        : await pacienteService.ruta(pacienteId)
      const hist = Array.isArray(res.data) ? res.data : []
      setUbicaciones(hist)
    } catch {
      setUbicaciones([])
    }
  }, [tipoUsuario])

  const cargarDatos = useCallback(async () => {
    try {
      const resPac = tipoUsuario === 'familiar'
        ? await familiarService.misPacientes()
        : await pacienteService.listar()
      const pacs: any[] = Array.isArray(resPac.data) ? resPac.data : []
      setPacientes(pacs)

      if (pacs.length > 0) {
        const id = pacs[0].id_paciente ?? pacs[0].id
        setSelectedPaciente(id)
      }
    } catch {
      // silencioso
    } finally {
      setLoading(false)
    }
  }, [cargarRuta, tipoUsuario])

  useEffect(() => { cargarDatos() }, [cargarDatos])

  useEffect(() => {
    if (selectedPaciente) cargarRuta(selectedPaciente)
  }, [selectedPaciente, cargarRuta])

  const pacSeleccionado  = pacientes.find(p => (p.id_paciente ?? p.id) === selectedPaciente)
  const ultimas100       = ubicaciones.slice(-100)
  const routeCoordinates = ultimas100.map(u => ({ latitude: u.coordenadas.latitud, longitude: u.coordenadas.longitud }))

  useEffect(() => {
    if (ubicaciones.length === 0) { setDireccion(null); return }
    const ultimo = ubicaciones[ubicaciones.length - 1]
    reverseGeocode(ultimo.coordenadas.latitud, ultimo.coordenadas.longitud).then(setDireccion)
  }, [ubicaciones])

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
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
        <Text style={styles.headerTitle}>Historial de ubicaciones</Text>
      </View>

      {pacientes.length > 1 && (
        <View style={styles.pacientesRow}>
          <FlatList
            horizontal
            data={pacientes}
            keyExtractor={(p) => p.id_paciente ?? p.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
            renderItem={({ item }) => {
              const id      = item.id_paciente ?? item.id
              const nombre  = item.nombre_paciente
              const selected = selectedPaciente === id
              return (
                <TouchableOpacity
                  style={[styles.pacChip, selected && styles.pacChipSelected]}
                  onPress={() => setSelectedPaciente(id)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.pacChipText, selected && styles.pacChipTextSelected]}>
                    {nombre}
                  </Text>
                </TouchableOpacity>
              )
            }}
          />
        </View>
      )}

      <View style={styles.mapContainer}>
        <WebView
          source={{ html: buildHistorialHtml(routeCoordinates, pacSeleccionado?.nombre_paciente ?? 'Paciente') }}
          style={styles.map}
          javaScriptEnabled
          originWhitelist={['*']}
          key={selectedPaciente ?? 'empty'}
        />

        {ubicaciones.length > 0 && (() => {
          const pac     = pacientes.find(p => (p.id_paciente ?? p.id) === selectedPaciente)
          const ultimo  = ubicaciones[ubicaciones.length - 1]
          const lat     = ultimo?.coordenadas?.latitud
          const lng     = ultimo?.coordenadas?.longitud
          const ts      = ultimo?.timestamp ? new Date(ultimo.timestamp) : null
          const tsStr   = ts
            ? ts.toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
            : null
          return (
            <View style={styles.infoOverlay}>
              <View style={styles.infoRow}>
                <Ionicons name="person-circle" size={18} color={Colors.primary} />
                <Text style={styles.infoNombre} numberOfLines={1}>
                  {pac?.nombre_paciente ?? '—'}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="location" size={14} color={Colors.textSecondary} />
                <Text style={styles.infoCoordenadas} numberOfLines={2}>
                  {direccion ?? `${lat?.toFixed(5) ?? '—'}, ${lng?.toFixed(5) ?? '—'}`}
                </Text>
              </View>
              {tsStr && (
                <View style={styles.infoRow}>
                  <Ionicons name="time-outline" size={13} color={Colors.textSecondary} />
                  <Text style={styles.infoTs}>{tsStr}</Text>
                </View>
              )}
              <Text style={styles.infoPuntos}>
                {ubicaciones.length > 100
                  ? `Mostrando los últimos 100 de ${ubicaciones.length} puntos · últimos 7 días`
                  : `${ubicaciones.length} puntos · últimos 7 días`}
              </Text>
            </View>
          )
        })()}
      </View>

      {ubicaciones.length === 0 && (
        <View style={styles.emptyContainer}>
          <Ionicons name="location-outline" size={64} color={Colors.primaryLight} />
          <Text style={styles.emptyTitle}>Sin historial</Text>
          <Text style={styles.emptyDesc}>
            Las ubicaciones aparecerán aquí cuando el dispositivo GPS envíe datos.
          </Text>
        </View>
      )}
    </SafeAreaView>
    </AnimatedScreen>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#102e50' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, gap: 14,
    backgroundColor: '#102e50',
  },
  backBtn:     { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pacientesRow: { backgroundColor: Colors.background, paddingVertical: 12 },
  pacChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
  },
  pacChipSelected:     { backgroundColor: Colors.primary, borderColor: Colors.primary },
  pacChipText:         { fontSize: 13, color: Colors.text, fontWeight: '500' },
  pacChipTextSelected: { color: Colors.white },
  mapContainer: { flex: 1 },
  map:          { flex: 1 },
  infoOverlay: {
    position: 'absolute', bottom: 20, left: 16, right: 16,
    backgroundColor: Colors.white,
    borderRadius: 18, paddingHorizontal: 18, paddingVertical: 14,
    elevation: 10, gap: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  infoRow:        { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoNombre:     { fontSize: 15, fontWeight: '700', color: Colors.text, flex: 1 },
  infoCoordenadas:{ fontSize: 12, color: Colors.textSecondary, fontFamily: 'monospace' },
  infoTs:         { fontSize: 12, color: Colors.textSecondary },
  infoPuntos:     { fontSize: 11, color: Colors.primaryLight, marginTop: 2 },
  emptyContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: 32, backgroundColor: Colors.background,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.text, marginTop: 16, marginBottom: 8 },
  emptyDesc:  { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
})
