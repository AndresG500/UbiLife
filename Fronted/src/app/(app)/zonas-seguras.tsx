import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Dimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import WebView from 'react-native-webview'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useFocusEffect } from 'expo-router'
import * as Location from 'expo-location'
import { Colors } from '@/constants/Colors'
import { zonaService, pacienteService, familiarService } from '@/services/api'
import { useAuth } from '@/context/AuthContext'
import { mensajeDeError } from '@/utils/errores'
import ConfirmModal from '@/components/ConfirmModal'
import AnimatedScreen from '@/components/AnimatedScreen'

const { height: SCREEN_H } = Dimensions.get('window')

const ZONA_MAP_HTML = `<!DOCTYPE html>
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
    var map = L.map('map', { zoomControl: false }).setView([11.2404, -74.2110], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: 'abc',
    }).addTo(map);

    var marcador = null;
    var circulo  = null;
    var radioActual = 150;

    var shieldIcon = L.divIcon({
      html: '<div style="background:#2563eb;width:32px;height:32px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.35)"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg></div>',
      className: '',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    var markerCuidador = null;
    var markerPaciente = null;

    var iconCuidador = L.divIcon({
      html: '<div style="background:#16a34a;width:30px;height:30px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3)"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="white"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div>',
      className: '', iconSize: [30, 30], iconAnchor: [15, 15],
    });
    var iconPaciente = L.divIcon({
      html: '<div style="background:#dc2626;width:30px;height:30px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3)"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="white"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div>',
      className: '', iconSize: [30, 30], iconAnchor: [15, 15],
    });

    function mostrarCuidador(lat, lng) {
      if (markerCuidador) markerCuidador.setLatLng([lat, lng]);
      else markerCuidador = L.marker([lat, lng], { icon: iconCuidador }).addTo(map);
    }
    function mostrarPaciente(lat, lng) {
      if (markerPaciente) markerPaciente.setLatLng([lat, lng]);
      else markerPaciente = L.marker([lat, lng], { icon: iconPaciente }).addTo(map);
      map.setView([lat, lng], 16);
    }

    map.on('click', function(e) {
      var lat = e.latlng.lat;
      var lng = e.latlng.lng;
      if (marcador) { marcador.setLatLng([lat, lng]); }
      else { marcador = L.marker([lat, lng], { icon: shieldIcon }).addTo(map); }
      if (circulo) { circulo.setLatLng([lat, lng]); }
      else {
        circulo = L.circle([lat, lng], {
          radius: radioActual,
          fillColor: '#2563eb',
          fillOpacity: 0.15,
          color: '#2563eb',
          weight: 2
        }).addTo(map);
      }
      window.ReactNativeWebView.postMessage(JSON.stringify({ lat: lat, lng: lng }));
    });

    function updateRadio(r) {
      radioActual = r;
      if (circulo) circulo.setRadius(r);
    }

    function setInitial(lat, lng, radio) {
      radioActual = radio;
      if (marcador) marcador.setLatLng([lat, lng]);
      else marcador = L.marker([lat, lng], { icon: shieldIcon }).addTo(map);
      if (circulo) { circulo.setLatLng([lat, lng]); circulo.setRadius(radio); }
      else {
        circulo = L.circle([lat, lng], {
          radius: radio,
          fillColor: '#2563eb',
          fillOpacity: 0.15,
          color: '#2563eb',
          weight: 2
        }).addTo(map);
      }
      map.setView([lat, lng], 16);
    }

    function limpiar() {
      if (marcador) { map.removeLayer(marcador); marcador = null; }
      if (circulo)  { map.removeLayer(circulo);  circulo  = null; }
    }

    var existingZones = {};
    function dibujarZonasExistentes(jsonStr) {
      Object.values(existingZones).forEach(function(c) { map.removeLayer(c); });
      existingZones = {};
      var lista = JSON.parse(jsonStr);
      lista.forEach(function(z) {
        if (!z.centro || z.centro.latitud == null) return;
        var color = z.activa ? '#2563eb' : '#64748b';
        var c = L.circle([z.centro.latitud, z.centro.longitud], {
          radius: z.radio_metros || 150,
          fillColor: color,
          fillOpacity: 0.08,
          color: color,
          weight: 1.5,
          dashArray: '6,4',
        }).addTo(map);
        c.bindTooltip(z.nombre, { permanent: false, direction: 'top' });
        existingZones[z.id] = c;
      });
    }
  </script>
</body>
</html>`

type Coord = { latitud: number; longitud: number }

export default function ZonasSeguras() {
  const router  = useRouter()
  const mapRef  = useRef<WebView>(null)
  const { tipoUsuario } = useAuth()
  const esFamiliar = tipoUsuario === 'familiar'

  const [zonas,     setZonas]     = useState<any[]>([])
  const [pacientes, setPacientes] = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)

  // Creación
  const [creando,   setCreando]   = useState(false)
  const [nombre,    setNombre]    = useState('')
  const [radio,     setRadio]     = useState('150')
  const [pacSelId,  setPacSelId]  = useState('')
  const [centro,    setCentro]    = useState<Coord | null>(null)
  const [guardando, setGuardando] = useState(false)

  const [exito,            setExito]            = useState('')
  const [modalSinPac,      setModalSinPac]      = useState(false)
  const [zonaAEliminar,    setZonaAEliminar]    = useState<string | null>(null)
  const [editandoZona,     setEditandoZona]     = useState<any | null>(null)

  const mostrarExito = useCallback((msg: string) => {
    setExito(msg)
    setTimeout(() => setExito(''), 3000)
  }, [])
  const [editNombre,       setEditNombre]       = useState('')
  const [editRadio,        setEditRadio]        = useState('150')
  const [editCentro,       setEditCentro]       = useState<Coord | null>(null)
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)
  const editMapListoRef = useRef(false)

  const mapaListoRef    = useRef(false)
  const pendingUbicRef  = useRef<{ c?: [number, number]; p?: [number, number] }>({})

  const inyectarUbicaciones = useCallback(() => {
    if (!mapaListoRef.current) return
    const { c, p } = pendingUbicRef.current
    if (p) mapRef.current?.injectJavaScript(`mostrarPaciente(${p[0]}, ${p[1]}); true;`)
    if (c) mapRef.current?.injectJavaScript(`mostrarCuidador(${c[0]}, ${c[1]}); true;`)
  }, [])

  const inyectarZonasEnMapa = useCallback((excludeId?: string) => {
    if (!mapaListoRef.current) return
    const filtradas = zonas.filter((z) => z.paciente_id === pacSelId && z.id !== excludeId)
    const jsonStr = JSON.stringify(filtradas)
    mapRef.current?.injectJavaScript(`dibujarZonasExistentes(${JSON.stringify(jsonStr)}); true;`)
  }, [zonas, pacSelId])

  useEffect(() => {
    if (!creando) {
      mapaListoRef.current   = false
      pendingUbicRef.current = {}
      return
    }

    const cargarUbicIniciales = async () => {
      // Ubicación actual del cuidador
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status === 'granted') {
          const pos = (await Location.getLastKnownPositionAsync()) ??
            (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }))
          if (pos) {
            pendingUbicRef.current.c = [pos.coords.latitude, pos.coords.longitude]
            inyectarUbicaciones()
          }
        }
      } catch {}

      // Última ubicación del paciente (solo cuidador)
      if (pacSelId && !esFamiliar) {
        try {
          const res   = await pacienteService.ultimaUbicacion(pacSelId)
          const coord = res.data?.coordenadas
          if (coord?.latitud != null && coord?.longitud != null) {
            pendingUbicRef.current.p = [coord.latitud, coord.longitud]
            inyectarUbicaciones()
          }
        } catch {}
      }
    }

    cargarUbicIniciales()
    inyectarZonasEnMapa()
  }, [creando, pacSelId, inyectarUbicaciones, inyectarZonasEnMapa])

  const cargar = async () => {
    try {
      if (esFamiliar) {
        const [resPac, resZonas] = await Promise.all([
          familiarService.misPacientes(),
          zonaService.listarFamiliar(),
        ])
        const pacs: any[] = Array.isArray(resPac.data) ? resPac.data : []
        setPacientes(pacs)
        if (pacs.length > 0) setPacSelId(pacs[0].id_paciente ?? pacs[0].id)
        const validas = (Array.isArray(resZonas.data) ? resZonas.data : []).filter((z: any) => !!z.id)
        setZonas(validas)
      } else {
        const resPac = await pacienteService.listar()
        const pacs: any[] = Array.isArray(resPac.data) ? resPac.data : []
        setPacientes(pacs)
        if (pacs.length > 0) setPacSelId(pacs[0].id_paciente ?? pacs[0].id)

        const resultados = await Promise.all(
          pacs.map((p) =>
            zonaService.listarPorPaciente(p.id_paciente ?? p.id).catch(() => ({ data: [] }))
          )
        )
        const todas = resultados.flatMap((rz) =>
          (Array.isArray(rz.data) ? rz.data : []).filter((z: any) => !!z.id)
        )
        setZonas(todas)
      }
    } catch {
      setZonas([])
    } finally { setLoading(false) }
  }

  useFocusEffect(useCallback(() => { cargar() }, [esFamiliar]))

  useEffect(() => {
    if (!creando) return
    const radioNum = parseInt(radio) || 150
    mapRef.current?.injectJavaScript(`updateRadio(${radioNum}); true;`)
  }, [radio, creando])

  useEffect(() => {
    if (!editandoZona || !editMapListoRef.current) return
    const radioNum = parseInt(editRadio) || 150
    mapRef.current?.injectJavaScript(`updateRadio(${radioNum}); true;`)
  }, [editRadio, editandoZona])

  const handleCrear = async () => {
    if (!nombre.trim()) { Alert.alert('Falta el nombre', 'Escribe un nombre para la zona.'); return }
    if (!centro)        { Alert.alert('Falta el centro', 'Toca el mapa para elegir el centro de la zona.'); return }
    const radioNum = parseInt(radio)
    if (isNaN(radioNum) || radioNum < 10 || radioNum > 500) {
      Alert.alert('Radio inválido', 'El radio debe estar entre 10 y 500 metros.'); return
    }
    setGuardando(true)
    try {
      const payload = { nombre: nombre.trim(), paciente_id: pacSelId, centro, radio_metros: radioNum }
      await (esFamiliar ? zonaService.crearFamiliar(payload) : zonaService.crear(payload))
      setCreando(false); setNombre(''); setRadio('150'); setCentro(null)
      await cargar()
      mostrarExito('Zona segura guardada correctamente.')
    } catch (err: any) {
      Alert.alert('Error al guardar', mensajeDeError(err, 'No se pudo guardar la zona segura. Inténtalo de nuevo.'))
    } finally { setGuardando(false) }
  }

  const handleEliminar = (id: string) => {
    setZonaAEliminar(id)
  }

  const confirmarEliminar = async () => {
    if (!zonaAEliminar) return
    const id = zonaAEliminar
    setZonaAEliminar(null)
    try {
      await zonaService.eliminar(id)
      await cargar()
      mostrarExito('Zona segura eliminada.')
    } catch (err: any) {
      Alert.alert('Error al eliminar', mensajeDeError(err, 'No se pudo eliminar la zona segura. Inténtalo de nuevo.'))
    }
  }

  const handleEditar = (zona: any) => {
    setEditandoZona(zona)
    setEditNombre(zona.nombre)
    setEditRadio(String(Math.round(zona.radio_metros)))
    setEditCentro(zona.centro)
    editMapListoRef.current = false
  }

  const handleGuardarEdicion = async () => {
    if (!editNombre.trim()) { Alert.alert('Falta el nombre', 'Escribe un nombre para la zona.'); return }
    const radioNum = parseInt(editRadio)
    if (isNaN(radioNum) || radioNum < 10 || radioNum > 500) {
      Alert.alert('Radio inválido', 'El radio debe estar entre 10 y 500 metros.'); return
    }
    setGuardandoEdicion(true)
    try {
      await zonaService.actualizar(editandoZona.id, {
        nombre: editNombre.trim(),
        radio_metros: radioNum,
        centro: editCentro ?? editandoZona.centro,
      })
      setEditandoZona(null)
      await cargar()
      mostrarExito('Zona segura actualizada correctamente.')
    } catch (err: any) {
      Alert.alert('Error al actualizar', mensajeDeError(err, 'No se pudo actualizar la zona segura. Inténtalo de nuevo.'))
    } finally {
      setGuardandoEdicion(false)
    }
  }

  // ── Vista de creación con mapa ─────────────────────────────────────────
  if (creando) {
    return (
      <View style={{ flex: 1 }}>
        <WebView
          ref={mapRef}
          style={styles.mapCrear}
          source={{ html: ZONA_MAP_HTML }}
          javaScriptEnabled
          originWhitelist={['*']}
          onLoadEnd={() => {
            mapaListoRef.current = true
            inyectarUbicaciones()
            inyectarZonasEnMapa()
          }}
          onMessage={(e) => {
            try {
              const { lat, lng } = JSON.parse(e.nativeEvent.data)
              setCentro({ latitud: lat, longitud: lng })
            } catch {}
          }}
        />

        {!centro && (
          <View style={styles.hint}>
            <Ionicons name="finger-print-outline" size={18} color={Colors.white} />
            <Text style={styles.hintText}>Toca el mapa para elegir el centro de la zona</Text>
          </View>
        )}

        <SafeAreaView style={styles.panel} edges={['bottom']}>
          <View style={styles.panelHandle} />

          <Text style={styles.panelTitle}>Nueva zona segura</Text>

          <View style={styles.row}>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={styles.label}>Nombre</Text>
              <TextInput style={styles.input} placeholder="Ej: Casa, Parque"
                placeholderTextColor={Colors.textSecondary}
                value={nombre} onChangeText={setNombre} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Radio (m)</Text>
              <TextInput style={[styles.input, { width: 80, textAlign: 'center' }]}
                keyboardType="number-pad" placeholder="150"
                placeholderTextColor={Colors.textSecondary}
                value={radio} onChangeText={setRadio} />
            </View>
          </View>

          {pacientes.length > 1 && (
            <View style={styles.field}>
              <Text style={styles.label}>Paciente</Text>
              <View style={styles.pacRow}>
                {pacientes.map((p) => {
                  const pid = p.id_paciente ?? p.id
                  return (
                  <TouchableOpacity key={pid}
                    style={[styles.pacChip, pacSelId === pid && styles.pacChipActivo]}
                    onPress={() => setPacSelId(pid)} activeOpacity={0.8}>
                    <Text style={[styles.pacChipText, pacSelId === pid && styles.pacChipTextActivo]}
                      numberOfLines={1}>{p.nombre_paciente}</Text>
                  </TouchableOpacity>
                )})}
              </View>
            </View>
          )}

          {centro && (
            <View style={styles.coordBox}>
              <Ionicons name="location" size={14} color={Colors.primary} />
              <Text style={styles.coordText}>
                {centro.latitud.toFixed(5)}, {centro.longitud.toFixed(5)}
              </Text>
              <TouchableOpacity
                onPress={() => { setCentro(null); mapRef.current?.injectJavaScript('limpiar(); true;') }}
                style={{ marginLeft: 8 }}>
                <Ionicons name="close-circle" size={16} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.panelBtns}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => { setCreando(false); setCentro(null) }} activeOpacity={0.8}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.crearBtn, (!centro || guardando) && styles.crearBtnDisabled]}
              onPress={handleCrear} disabled={!centro || guardando} activeOpacity={0.85}>
              {guardando
                ? <ActivityIndicator size="small" color={Colors.white} />
                : <Text style={styles.crearText}>Guardar zona</Text>}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    )
  }

  // ── Vista de edición con mapa ─────────────────────────────────────────
  if (editandoZona) {
    return (
      <View style={{ flex: 1 }}>
        <WebView
          ref={mapRef}
          style={styles.mapCrear}
          source={{ html: ZONA_MAP_HTML }}
          javaScriptEnabled
          originWhitelist={['*']}
          onLoadEnd={() => {
            editMapListoRef.current = true
            if (editCentro) {
              const radioNum = parseInt(editRadio) || 150
              mapRef.current?.injectJavaScript(`setInitial(${editCentro.latitud}, ${editCentro.longitud}, ${radioNum}); true;`)
            }
            const otrasZonas = zonas.filter((z) =>
              z.paciente_id === editandoZona.paciente_id && z.id !== editandoZona.id
            )
            const jsonStr = JSON.stringify(otrasZonas)
            mapRef.current?.injectJavaScript(`dibujarZonasExistentes(${JSON.stringify(jsonStr)}); true;`)
          }}
          onMessage={(e) => {
            try {
              const { lat, lng } = JSON.parse(e.nativeEvent.data)
              setEditCentro({ latitud: lat, longitud: lng })
            } catch {}
          }}
        />

        <SafeAreaView style={styles.panel} edges={['bottom']}>
          <View style={styles.panelHandle} />
          <Text style={styles.panelTitle}>Editar zona segura</Text>

          <View style={styles.row}>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={styles.label}>Nombre</Text>
              <TextInput style={styles.input} placeholder="Ej: Casa, Parque"
                placeholderTextColor={Colors.textSecondary}
                value={editNombre} onChangeText={setEditNombre} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Radio (m)</Text>
              <TextInput style={[styles.input, { width: 80, textAlign: 'center' }]}
                keyboardType="number-pad" placeholder="150"
                placeholderTextColor={Colors.textSecondary}
                value={editRadio} onChangeText={setEditRadio} />
            </View>
          </View>

          {editCentro && (
            <View style={styles.coordBox}>
              <Ionicons name="location" size={14} color={Colors.primary} />
              <Text style={styles.coordText}>
                {editCentro.latitud.toFixed(5)}, {editCentro.longitud.toFixed(5)}
              </Text>
              <Text style={[styles.coordText, { color: Colors.textSecondary, fontSize: 10 }]}>
                Toca el mapa para mover
              </Text>
            </View>
          )}

          <View style={styles.panelBtns}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditandoZona(null)} activeOpacity={0.8}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.crearBtn, guardandoEdicion && styles.crearBtnDisabled]}
              onPress={handleGuardarEdicion} disabled={guardandoEdicion} activeOpacity={0.85}>
              {guardandoEdicion
                ? <ActivityIndicator size="small" color={Colors.white} />
                : <Text style={styles.crearText}>Guardar cambios</Text>}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    )
  }

  // ── Vista de lista ─────────────────────────────────────────────────────
  return (
    <AnimatedScreen>
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Zonas seguras</Text>
        <TouchableOpacity
          onPress={() => {
            if (pacientes.length === 0) { setModalSinPac(true); return }
            setCreando(true)
          }}
          style={styles.addBtn}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={26} color={Colors.white} />
        </TouchableOpacity>
      </View>

      <ConfirmModal
        visible={modalSinPac}
        titulo="Aún no tienes pacientes"
        mensaje="Para crear una zona segura primero necesitas registrar un paciente. ¿Quieres hacerlo ahora?"
        textoCancel="Ahora no"
        textoConfirm="Registrar paciente"
        onCancel={() => setModalSinPac(false)}
        onConfirm={() => { setModalSinPac(false); router.push('/(app)/registro-paciente') }}
      />

      <ConfirmModal
        visible={!!zonaAEliminar}
        titulo="Eliminar zona segura"
        mensaje="¿Seguro que quieres eliminar esta zona? Esta acción no se puede deshacer."
        textoConfirm="Eliminar"
        onCancel={() => setZonaAEliminar(null)}
        onConfirm={confirmarEliminar}
        destructivo
      />

      <View style={{ flex: 1 }}>
        {exito ? (
          <View style={styles.successBox}>
            <Ionicons name="checkmark-circle-outline" size={15} color={Colors.success} style={{ marginRight: 6 }} />
            <Text style={styles.successText}>{exito}</Text>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={Colors.primaryLight} /></View>
        ) : (
        <ScrollView style={{ flex: 1, backgroundColor: '#f7fbfc' }} contentContainerStyle={styles.list}>
          {zonas.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="shield-outline" size={56} color={Colors.primaryLight} />
              <Text style={styles.emptyText}>No hay zonas seguras{'\n'}Toca + para crear una</Text>
            </View>
          ) : zonas.map((item) => {
            const pac = pacientes.find((p) => (p.id_paciente ?? p.id) === item.paciente_id)
            return (
              <View key={item.id} style={styles.card}>
                <View style={styles.cardLeft}>
                  <View style={[styles.zonaIcon, !item.activa && styles.zonaIconOff]}>
                    <Ionicons name="shield-checkmark" size={22}
                      color={item.activa ? Colors.primary : Colors.textSecondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.zonaNombre}>{item.nombre}</Text>
                    <Text style={styles.zonaMeta}>{pac?.nombre_paciente ?? '—'} · {item.radio_metros}m</Text>
                  </View>
                </View>
                <View style={styles.cardActions}>
                  <View style={[styles.estadoBadge, item.activa ? styles.estadoActiva : styles.estadoPendiente]}>
                    <Text style={[styles.estadoText, item.activa ? styles.estadoActivaText : styles.estadoPendienteText]}>
                      {item.activa ? 'Activa' : 'Pendiente'}
                    </Text>
                  </View>
                  {!esFamiliar && (
                    <>
                      <TouchableOpacity onPress={() => handleEditar(item)} activeOpacity={0.7} style={styles.actionBtn}>
                        <Ionicons name="pencil-outline" size={20} color={Colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleEliminar(item.id)} activeOpacity={0.7} style={styles.actionBtn}>
                        <Ionicons name="trash-outline" size={20} color={Colors.error} />
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            )
          })}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
    </AnimatedScreen>
  )
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#102e50' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20, gap: 14, backgroundColor: '#102e50' },
  backBtn:     { padding: 4 },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '700', color: Colors.white },
  addBtn:      { padding: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  emptyText: { fontSize: 15, color: Colors.primaryLight, textAlign: 'center', lineHeight: 22 },
  list:   { padding: 16, gap: 12, flexGrow: 1 },
  card:   { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderRadius: 18, padding: 16, gap: 12, elevation: 3 },
  cardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionBtn:   { padding: 6 },
  estadoBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginRight: 4 },
  estadoActiva: { backgroundColor: '#dbeafe' },
  estadoPendiente: { backgroundColor: '#fff7ed' },
  estadoText: { fontSize: 11, fontWeight: '700' },
  estadoActivaText: { color: '#1d4ed8' },
  estadoPendienteText: { color: '#c2410c' },
  zonaIcon:    { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.primaryBg, justifyContent: 'center', alignItems: 'center' },
  zonaIconOff: { backgroundColor: Colors.surface },
  zonaNombre:  { fontSize: 15, fontWeight: '700', color: Colors.text },
  zonaMeta:    { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  // Creación con mapa
  mapCrear: { flex: 1, height: SCREEN_H * 0.52 },
  hint:     { position: 'absolute', top: 52, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  hintText: { color: Colors.white, fontSize: 13, fontWeight: '500' },

  panel: { backgroundColor: Colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingTop: 12, elevation: 16 },
  panelHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 16 },
  panelTitle:  { fontSize: 18, fontWeight: '700', color: Colors.text, marginBottom: 16 },
  row:    { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  field:  { marginBottom: 14 },
  label:  { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  input:  { borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: Colors.text, backgroundColor: Colors.background },
  pacRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pacChip:       { borderWidth: 1.5, borderColor: Colors.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  pacChipActivo: { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },
  pacChipText:       { fontSize: 13, color: Colors.textSecondary },
  pacChipTextActivo: { color: Colors.primary, fontWeight: '700' },
  coordBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primaryBg, borderRadius: 10, padding: 10, marginBottom: 14, gap: 6 },
  coordText:{ flex: 1, fontSize: 12, color: Colors.primary, fontWeight: '600' },
  panelBtns:  { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn:  { flex: 1, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  cancelText: { fontSize: 15, color: Colors.textSecondary, fontWeight: '600' },
  crearBtn:   { flex: 1, backgroundColor: '#102e50', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  crearBtnDisabled: { opacity: 0.45 },
  crearText:  { color: Colors.white, fontWeight: '700', fontSize: 15 },

  successBox:  { position: 'absolute', top: 16, left: 16, right: 16, zIndex: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', borderRadius: 12, padding: 14, borderLeftWidth: 4, borderLeftColor: Colors.success, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
  successText: { flex: 1, color: '#065f46', fontSize: 13, lineHeight: 19 },
})
