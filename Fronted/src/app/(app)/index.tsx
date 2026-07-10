import { useEffect, useRef, useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, Image, ScrollView } from 'react-native'
import WebView from 'react-native-webview'
import { useNavigation, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { Colors } from '@/constants/Colors'
import { pacienteService, zonaService, familiarService, grupoService, alertaService, modoViajeService } from '@/services/api'
import ModoViajeModal from '@/components/ModoViajeModal'
import { useSSEUbicacion } from '@/hooks/useSSEUbicacion'
import { useAuth } from '@/context/AuthContext'
import * as Location from 'expo-location'
import {
  iniciarSeguimiento,
  enviarUbicacionCuidador, obtenerUbicacionesGrupo,
  enviarUbicacionFamiliar, obtenerUbicacionesGrupoFamiliar,
  type UbicacionCuidador, type UbicacionFamiliar,
} from '@/services/ubicacion'
import AnimatedScreen from '@/components/AnimatedScreen'
import { eventosMapa } from '@/utils/eventosMapa'

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

// Debe coincidir con GPS_TIMEOUT_MS de useSSEUbicacion.ts (umbral de "sin señal")
const GPS_TIMEOUT_MS = 60_000

function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function estaDentroDeZonaSegura(lat: number, lng: number, pacienteId: string, zonas: any[]): boolean {
  return zonas.some((z) => {
    if (z.paciente_id !== pacienteId || !z.activa || !z.centro) return false
    const d = distanciaMetros(lat, lng, z.centro.latitud, z.centro.longitud)
    return d <= (z.radio_metros ?? 150)
  })
}

function buildMapHTML(pacientes: any[], zonas: any[], cuidadores: UbicacionCuidador[] = [], familiares: UbicacionFamiliar[] = [], fallbackLat = 11.2404, fallbackLng = -74.211): string {
  const zonesJs = zonas.map((zona) => {
    const lat   = zona.centro?.latitud  ?? 0
    const lng   = zona.centro?.longitud ?? 0
    const radio = zona.radio_metros     ?? 150
    const color = zona.activa ? '#2563eb' : '#888888'
    const id    = zona.id ?? ''
    return `
      (function() {
        var circle = L.circle([${lat}, ${lng}], {
          radius: ${radio},
          fillColor: '${color}',
          fillOpacity: 0.15,
          color: '${color}',
          weight: 2
        }).addTo(map);
        ${id ? `zoneCircles['${id}'] = circle;` : ''}
      })();`
  }).join('\n')

  const markersJs = pacientes.map((pac) => {
    const id     = pac.id_paciente ?? pac.id
    const nombre = escaparJs(pac.nombre_paciente ?? '')
    const ub     = pac.ultima_ubicacion
    if (!ub) return ''
    const lat = ub.latitud  ?? ub.lat  ?? 0
    const lng = ub.longitud ?? ub.lng  ?? 0
    const tsMs = ub.timestamp ? new Date(ub.timestamp).getTime() : 0
    const esObsoleta   = !tsMs || (Date.now() - tsMs) > GPS_TIMEOUT_MS
    const dentroDeZona = estaDentroDeZonaSegura(lat, lng, id, zonas)
    const offline      = esObsoleta && !dentroDeZona
    const iconFn = offline ? 'crearIconoPacienteOffline' : 'crearIconoPaciente'
    return `
      (function() {
        pacienteNames['${id}'] = '${nombre}';
        var m = L.marker([${lat}, ${lng}], { icon: ${iconFn}('${nombre}') }).addTo(map);
        ${offline ? `showSignalLostCircle(${lat}, ${lng});` : ''}
        m.on('click', function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({tipo:'select_paciente',id:'${id}'}));
        });
        markers['${id}'] = m;
      })();`
  }).join('\n')

  const cuidadorMarkersJs = cuidadores
    .filter((c) => c.latitud && c.longitud)
    .map((c) => {
      const datos = JSON.stringify({ nombre: c.nombre ?? 'Cuidador', telefono: c.telefono ?? '', foto: c.foto ?? '', tipo: 'cuidador' })
      return `
      (function() {
        personaData['${c.cuidador_id}'] = ${datos};
        var m = L.marker([${c.latitud}, ${c.longitud}], { icon: cuidadorIcon }).addTo(map);
        bindPersonaClick(m, '${c.cuidador_id}');
        cuidadorMarkers['${c.cuidador_id}'] = m;
      })();`
    })
    .join('\n')

  const familiarMarkersJs = familiares
    .filter((f) => f.latitud && f.longitud)
    .map((f) => {
      const datos = JSON.stringify({ nombre: f.nombre ?? 'Familiar', telefono: f.telefono ?? '', foto: f.foto ?? '', tipo: 'familiar' })
      return `
      (function() {
        personaData['${f.familiar_id}'] = ${datos};
        var m = L.marker([${f.latitud}, ${f.longitud}], { icon: familiarIcon }).addTo(map);
        bindPersonaClick(m, '${f.familiar_id}');
        familiarMarkers['${f.familiar_id}'] = m;
      })();`
    })
    .join('\n')

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
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: false, attributionControl: false }).setView([11.2404, -74.2110], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: 'abc',
    }).addTo(map);

    var markers = {};
    var cuidadorMarkers = {};
    var familiarMarkers = {};
    var zoneCircles = {};
    var pacienteNames = {};
    var personaData = {};

    function bindPersonaClick(m, id) {
      m.on('click', function() {
        var d = personaData[id] || {};
        window.ReactNativeWebView.postMessage(JSON.stringify({ tipo: 'select_persona', id: id, datos: d }));
      });
    }

    function htmlEncode(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function crearIconoPaciente(nombre) {
      var html =
        '<div style="display:flex;flex-direction:column;align-items:center;">' +
          '<div style="width:36px;height:36px;border-radius:50%;background:#1d4ed8;border:3px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.4)">' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="white">' +
              '<path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>' +
            '</svg>' +
          '</div>' +
          '<div style="background:white;border-radius:6px;padding:2px 7px;font-size:10px;font-weight:700;color:#102e50;margin-top:3px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.18);">' + htmlEncode(nombre) + '</div>' +
        '</div>';
      return L.divIcon({ html: html, className: '', iconSize: [90, 58], iconAnchor: [45, 18] });
    }

    function crearIconoPacienteOffline(nombre) {
      var html =
        '<div style="display:flex;flex-direction:column;align-items:center;opacity:0.75;">' +
          '<div style="width:36px;height:36px;border-radius:50%;background:#6b7280;border:3px solid #f97316;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3)">' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="white">' +
              '<path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>' +
            '</svg>' +
          '</div>' +
          '<div style="background:#f97316;border-radius:6px;padding:2px 7px;font-size:9px;font-weight:700;color:white;margin-top:3px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.18);">Última señal</div>' +
          '<div style="background:white;border-radius:6px;padding:2px 7px;font-size:10px;font-weight:700;color:#6b7280;margin-top:2px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.18);">' + htmlEncode(nombre) + '</div>' +
        '</div>';
      return L.divIcon({ html: html, className: '', iconSize: [90, 72], iconAnchor: [45, 18] });
    }

    function setMarkerOffline(id) {
      if (!markers[id]) return;
      var nombre = pacienteNames[id] || 'Paciente';
      markers[id].setIcon(crearIconoPacienteOffline(nombre));
    }

    function setMarkerOnline(id) {
      if (!markers[id]) return;
      var nombre = pacienteNames[id] || 'Paciente';
      markers[id].setIcon(crearIconoPaciente(nombre));
    }

    var cuidadorIcon = L.divIcon({
      html: '<div style="width:30px;height:30px;border-radius:50%;background:#16a34a;border:3px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.35)"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg></div>',
      className: '',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });

    var familiarIcon = L.divIcon({
      html: '<div style="width:30px;height:30px;border-radius:50%;background:#9333ea;border:3px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.35)"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></div>',
      className: '',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });

    ${zonesJs}
    ${markersJs}
    ${cuidadorMarkersJs}
    ${familiarMarkersJs}

    // Auto-zoom al cargar para mostrar todos los marcadores; si no hay ninguno, centra en el usuario
    setTimeout(function() { fitAll(); }, 200);

    function updateMarker(id, lat, lng) {
      if (markers[id]) {
        markers[id].setLatLng([lat, lng]);
      } else {
        var nombre = pacienteNames[id] || 'Paciente';
        var m = L.marker([lat, lng], { icon: crearIconoPaciente(nombre) }).addTo(map);
        m.on('click', function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({tipo:'select_paciente',id:id}));
        });
        markers[id] = m;
      }
    }

    function updateCuidador(id, lat, lng, datos) {
      if (datos) personaData[id] = datos;
      if (cuidadorMarkers[id]) {
        cuidadorMarkers[id].setLatLng([lat, lng]);
      } else {
        var m = L.marker([lat, lng], { icon: cuidadorIcon }).addTo(map);
        bindPersonaClick(m, id);
        cuidadorMarkers[id] = m;
      }
    }

    function updateFamiliar(id, lat, lng, datos) {
      if (datos) personaData[id] = datos;
      if (familiarMarkers[id]) {
        familiarMarkers[id].setLatLng([lat, lng]);
      } else {
        var m = L.marker([lat, lng], { icon: familiarIcon }).addTo(map);
        bindPersonaClick(m, id);
        familiarMarkers[id] = m;
      }
    }

    function flyTo(lat, lng) {
      map.flyTo([lat, lng], 16, { duration: 0.8 });
    }

    function fitAll() {
      var positions = [];
      Object.values(markers).forEach(function(m) { positions.push(m.getLatLng()); });
      Object.values(cuidadorMarkers).forEach(function(m) { positions.push(m.getLatLng()); });
      Object.values(familiarMarkers).forEach(function(m) { positions.push(m.getLatLng()); });
      if (positions.length === 0) { map.setView([${fallbackLat}, ${fallbackLng}], 15); return; }
      if (positions.length === 1) { map.setView(positions[0], 16); return; }
      map.fitBounds(L.latLngBounds(positions), { padding: [70, 70], maxZoom: 17 });
    }

    function addOrUpdateZone(id, lat, lng, radio, activa) {
      var color = activa ? '#2563eb' : '#888888';
      var opts = { radius: radio, fillColor: color, fillOpacity: 0.15, color: color, weight: 2 };
      if (zoneCircles[id]) {
        zoneCircles[id].setLatLng([lat, lng]);
        zoneCircles[id].setRadius(radio);
        zoneCircles[id].setStyle({ fillColor: color, color: color });
      } else {
        zoneCircles[id] = L.circle([lat, lng], opts).addTo(map);
      }
    }

    var signalLostCircle = null;
    function showSignalLostCircle(lat, lng) {
      if (signalLostCircle) signalLostCircle.remove();
      signalLostCircle = L.circle([lat, lng], {
        radius: 75,
        fillColor: '#f97316',
        fillOpacity: 0.18,
        color: '#f97316',
        weight: 2,
        dashArray: '6,4',
      }).addTo(map);
    }
    function hideSignalLostCircle() {
      if (signalLostCircle) { signalLostCircle.remove(); signalLostCircle = null; }
    }

    var _routeLayer = null;
    var _userMarker = null;

    async function showRoute(fromLat, fromLng, toLat, toLng) {
      clearRoute();
      _userMarker = L.circleMarker([fromLat, fromLng], {
        radius: 10, fillColor: '#3b82f6', fillOpacity: 1, color: 'white', weight: 3,
      }).addTo(map).bindPopup('Mi ubicación');
      try {
        var url = 'https://router.project-osrm.org/route/v1/driving/' + fromLng + ',' + fromLat + ';' + toLng + ',' + toLat + '?overview=full&geometries=geojson';
        var resp = await fetch(url);
        var data = await resp.json();
        if (data.routes && data.routes.length > 0) {
          _routeLayer = L.geoJSON(data.routes[0].geometry, {
            style: { color: '#102e50', weight: 5, opacity: 0.8 }
          }).addTo(map);
        }
      } catch(e) {}
      var bounds = L.latLngBounds([[fromLat, fromLng], [toLat, toLng]]);
      map.fitBounds(bounds, { padding: [60, 60] });
    }

    function clearRoute() {
      if (_routeLayer) { _routeLayer.remove(); _routeLayer = null; }
      if (_userMarker) { _userMarker.remove(); _userMarker = null; }
    }
  </script>
</body>
</html>`
}

export default function MapScreen() {
  const navigation  = useNavigation()
  const router      = useRouter()
  const { tipoUsuario, cuidador, token, loading: authLoading } = useAuth()
  const webViewRef  = useRef<WebView>(null)
  const [pacientes,          setPacientes]          = useState<any[]>([])
  const [alertasPendientes,  setAlertasPendientes]  = useState(0)
  const [estadoViaje,        setEstadoViaje]        = useState<any>(null)
  const [showModoViaje,      setShowModoViaje]      = useState(false)
  const [online,     setOnline]     = useState(true)
  const [loading,    setLoading]    = useState(true)
  const [mapHtml,    setMapHtml]    = useState('')
  const [selPacId,   setSelPacId]   = useState<string | null>(null)
  const gruposRef         = useRef<any[]>([])
  const gruposFamiliarRef = useRef<any[]>([])
  const zonasRef          = useRef<any[]>([])
  const mapaListo         = useRef(false)
  const [rutaVisible,   setRutaVisible]   = useState(false)
  const [modalPaciente, setModalPaciente] = useState<any | null>(null)
  const [modalPersona,  setModalPersona]  = useState<any | null>(null)
  const [sinGrupo,      setSinGrupo]      = useState(false)

  const { ubicacion, gpsActivo } = useSSEUbicacion(selPacId)

  const cargarDatos = useCallback(async () => {
    if (!token) return
    try {
      const resPac = tipoUsuario === 'familiar'
        ? await familiarService.misPacientes()
        : await pacienteService.listar()
      const pacs: any[] = Array.isArray(resPac.data) ? resPac.data : []
      setPacientes(pacs)

      if (pacs.length > 0) {
        const idExiste = pacs.some((p: any) => (p.id_paciente ?? p.id) === selPacId)
        if (!selPacId || !idExiste) {
          setSelPacId(pacs[0].id_paciente ?? pacs[0].id)
        }
      }

      try {
        const resAlertas = tipoUsuario === 'familiar'
          ? await alertaService.listarFamiliar()
          : await alertaService.listar()
        const alertas: any[] = Array.isArray(resAlertas.data) ? resAlertas.data : []
        setAlertasPendientes(alertas.filter((a: any) => a.estado === 'pendiente').length)
      } catch {}

      if (pacs.length > 0) {
        const primerId = pacs[0].id_paciente ?? pacs[0].id
        try {
          const resModo = tipoUsuario === 'familiar'
            ? await modoViajeService.estadoFamiliar(primerId)
            : await modoViajeService.estado(primerId)
          setEstadoViaje(resModo.data ?? null)
        } catch {
          setEstadoViaje(null)
        }
      }

      const todasZonas: any[] = []
      if (tipoUsuario === 'familiar') {
        try {
          const rz = await zonaService.listarFamiliar()
          todasZonas.push(...(Array.isArray(rz.data) ? rz.data : []))
        } catch {}
      } else {
        for (const p of pacs) {
          try {
            const rz = await zonaService.listarPorPaciente(p.id_paciente ?? p.id)
            todasZonas.push(...(Array.isArray(rz.data) ? rz.data : []))
          } catch {}
        }
      }

      const todasUbicaciones: UbicacionCuidador[] = []
      const todasFamiliares:  UbicacionFamiliar[]  = []

      if (tipoUsuario !== 'familiar') {
        try {
          const resGrupos = await grupoService.listar()
          const gruposList: any[] = Array.isArray(resGrupos.data) ? resGrupos.data : []
          gruposRef.current = gruposList
          for (const g of gruposList) {
            const ubs = await obtenerUbicacionesGrupo(g.id)
            todasUbicaciones.push(...ubs.cuidadores)
            todasFamiliares.push(...(ubs.familiares ?? []))
          }
        } catch {}
      } else {
        try {
          const resGrupos = await familiarService.misGrupos()
          const gruposList: any[] = Array.isArray(resGrupos.data) ? resGrupos.data : []
          gruposFamiliarRef.current = gruposList
          setSinGrupo(gruposList.length === 0)
          for (const g of gruposList) {
            const gId = g.id ?? g.grupo_id ?? g._id
            if (!gId) continue
            const ubs = await obtenerUbicacionesGrupoFamiliar(gId)
            todasUbicaciones.push(...ubs.cuidadores)
            todasFamiliares.push(...ubs.familiares)
          }
        } catch {}
      }

      zonasRef.current = todasZonas
      setOnline(true)

      if (!mapaListo.current) {
        // Obtener ubicación del usuario como fallback si no hay marcadores de pacientes
        let fallbackLat = 11.2404
        let fallbackLng = -74.211
        const hayMarcadores = pacs.some((p: any) => p.ultima_ubicacion) || todasUbicaciones.length > 0 || todasFamiliares.length > 0
        if (!hayMarcadores) {
          try {
            const { status } = await Location.requestForegroundPermissionsAsync()
            if (status === 'granted') {
              const pos = await Location.getLastKnownPositionAsync()
              if (pos) {
                fallbackLat = pos.coords.latitude
                fallbackLng = pos.coords.longitude
              }
            }
          } catch {}
        }
        setMapHtml(buildMapHTML(pacs, todasZonas, todasUbicaciones, todasFamiliares, fallbackLat, fallbackLng))
        mapaListo.current = true
      } else {
        for (const z of todasZonas) {
          const lat = z.centro?.latitud
          const lng = z.centro?.longitud
          if (!z.id || lat == null || lng == null) continue
          const radio  = z.radio_metros ?? 150
          const activa = !!z.activa
          const js = `addOrUpdateZone('${z.id}', ${lat}, ${lng}, ${radio}, ${activa}); true;`
          webViewRef.current?.injectJavaScript(js)
        }
        for (const c of todasUbicaciones) {
          const datos = JSON.stringify({ nombre: c.nombre ?? 'Cuidador', telefono: c.telefono ?? '', foto: c.foto ?? '', tipo: 'cuidador' })
          const js = `updateCuidador('${c.cuidador_id}', ${c.latitud}, ${c.longitud}, ${datos}); true;`
          webViewRef.current?.injectJavaScript(js)
        }
        for (const f of todasFamiliares) {
          const datos = JSON.stringify({ nombre: f.nombre ?? 'Familiar', telefono: f.telefono ?? '', foto: f.foto ?? '', tipo: 'familiar' })
          const js = `updateFamiliar('${f.familiar_id}', ${f.latitud}, ${f.longitud}, ${datos}); true;`
          webViewRef.current?.injectJavaScript(js)
        }
        if (tipoUsuario === 'familiar') {
          for (const p of pacs) {
            const ub = p.ultima_ubicacion
            if (!ub) continue
            const id  = p.id_paciente ?? p.id
            const lat = ub.latitud ?? ub.lat
            const lng = ub.longitud ?? ub.lng
            if (lat != null && lng != null) {
              const js = `updateMarker('${id}', ${lat}, ${lng}); true;`
              webViewRef.current?.injectJavaScript(js)
            }
          }
        }
      }
    } catch {
      setOnline(false)
    } finally {
      setLoading(false)
    }
  }, [tipoUsuario, token]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    cargarDatos()
    const intervalo = setInterval(cargarDatos, 60_000)
    return () => clearInterval(intervalo)
  }, [cargarDatos])

  useEffect(() => {
    if (!ubicacion || !selPacId) return
    const js = `updateMarker('${selPacId}', ${ubicacion.latitude}, ${ubicacion.longitude}); true;`
    webViewRef.current?.injectJavaScript(js)
  }, [ubicacion, selPacId])

  useEffect(() => {
    if (!mapaListo.current || !selPacId) return
    const sinSenal = !gpsActivo && !!ubicacion
    const dentroDeZona = sinSenal
      ? estaDentroDeZonaSegura(ubicacion!.latitude, ubicacion!.longitude, selPacId, zonasRef.current)
      : false
    if (sinSenal && !dentroDeZona) {
      const js = `showSignalLostCircle(${ubicacion!.latitude}, ${ubicacion!.longitude}); setMarkerOffline('${selPacId}'); true;`
      webViewRef.current?.injectJavaScript(js)
    } else {
      webViewRef.current?.injectJavaScript(`hideSignalLostCircle(); setMarkerOnline('${selPacId}'); true;`)
    }
  }, [gpsActivo, ubicacion, selPacId])

  useEffect(() => {
    // Al cambiar de cuenta/rol, reiniciar por completo el mapa para no arrastrar
    // marcadores de la sesión anterior (p. ej. familiares que quedaban pegados
    // tras pasar de una cuenta familiar a una de cuidador).
    mapaListo.current = false
    gruposRef.current = []
    gruposFamiliarRef.current = []
    zonasRef.current = []
    setMapHtml('')
    setSelPacId(null)
    setPacientes([])
  }, [tipoUsuario, cuidador?.id])

  useEffect(() => {
    if (authLoading || !token || tipoUsuario === 'familiar') return
    let suscripcion: Location.LocationSubscription | null = null
    let cancelado = false

    iniciarSeguimiento(({ latitude, longitude }) => {
      if (cancelado) return
      const gs = gruposRef.current
      for (const g of gs) {
        enviarUbicacionCuidador(g.id, latitude, longitude)
      }
      // Marcador propio: usar SIEMPRE el id real (mismo que usa el backend) para que
      // el marcador local se fusione con el eco del grupo y no aparezca duplicado.
      // Si no hay id disponible, no se dibuja local: el backend igual lo refleja.
      const miId = cuidador?.id
      if (miId) {
        const datos = JSON.stringify({ nombre: cuidador?.name ?? 'Tú', telefono: cuidador?.phone ?? '', foto: cuidador?.foto ?? '', tipo: 'cuidador' })
        const js = `updateCuidador('${miId}', ${latitude}, ${longitude}, ${datos}); true;`
        webViewRef.current?.injectJavaScript(js)
      }
    })
      .then((sub) => {
        if (cancelado) sub.remove()
        else suscripcion = sub
      })
      .catch(() => {})

    return () => {
      cancelado = true
      suscripcion?.remove()
    }
  }, [tipoUsuario, cuidador, authLoading, token])

  useEffect(() => {
    if (authLoading || !token || tipoUsuario !== 'familiar') return
    let suscripcion: Location.LocationSubscription | null = null
    let cancelado = false

    iniciarSeguimiento(({ latitude, longitude }) => {
      if (cancelado) return
      const gs = gruposFamiliarRef.current
      for (const g of gs) {
        const gId = g.id ?? g.grupo_id ?? g._id
        if (gId) enviarUbicacionFamiliar(gId, latitude, longitude)
      }
      // Marcador propio: usar SIEMPRE el id real (mismo que usa el backend) para que
      // el marcador local se fusione con el eco del grupo y no aparezca duplicado.
      // Si no hay id disponible, no se dibuja local: el backend igual lo refleja.
      const miId = cuidador?.id
      if (miId) {
        const datos = JSON.stringify({ nombre: cuidador?.name ?? 'Tú', telefono: cuidador?.phone ?? '', foto: cuidador?.foto ?? '', tipo: 'familiar' })
        const js = `updateFamiliar('${miId}', ${latitude}, ${longitude}, ${datos}); true;`
        webViewRef.current?.injectJavaScript(js)
      }
    })
      .then((sub) => {
        if (cancelado) sub.remove()
        else suscripcion = sub
      })
      .catch(() => {})

    return () => {
      cancelado = true
      suscripcion?.remove()
    }
  }, [tipoUsuario, cuidador, authLoading, token])

  useFocusEffect(
    useCallback(() => {
      if (mapaListo.current) cargarDatos()
    }, [cargarDatos])
  )

  useEffect(() => {
    eventosMapa.onMostrarRuta((fromLat, fromLng, toLat, toLng) => {
      webViewRef.current?.injectJavaScript(`showRoute(${fromLat}, ${fromLng}, ${toLat}, ${toLng}); true;`)
      setRutaVisible(true)
    })
    return () => eventosMapa.limpiarHandler()
  }, [])

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data)
      if (data.tipo === 'select_persona') {
        setModalPersona(data.datos ?? {})
        return
      }
      if (data.tipo === 'select_paciente') {
        const id = data.id
        setSelPacId(id)
        const pac = pacientes.find((p: any) => (p.id_paciente ?? p.id) === id)
        if (pac) {
          setModalPaciente(pac)
          if (pac.ultima_ubicacion) {
            const lat = pac.ultima_ubicacion.latitud ?? pac.ultima_ubicacion.lat
            const lng = pac.ultima_ubicacion.longitud ?? pac.ultima_ubicacion.lng
            if (lat != null && lng != null) {
              webViewRef.current?.injectJavaScript(`flyTo(${lat}, ${lng}); true;`)
            }
          }
        }
      }
    } catch {}
  }

  return (
    <AnimatedScreen>
    <View style={styles.container}>
      {mapHtml ? (
        <WebView
          ref={webViewRef}
          style={styles.map}
          source={{ html: mapHtml }}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          onMessage={handleMessage}
          renderLoading={() => (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          )}
        />
      ) : (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      )}

      <TouchableOpacity
        style={styles.menuBtn}
        onPress={() => (navigation as any).openDrawer()}
        activeOpacity={0.85}
      >
        <Ionicons name="menu" size={24} color={'#102e50'} />
      </TouchableOpacity>

      <View style={[styles.statusBadge, !online && styles.statusBadgeOffline]}>
        {loading
          ? <ActivityIndicator size="small" color={online ? Colors.success : Colors.warning} />
          : <View style={[styles.statusDot, !online && styles.statusDotOffline]} />}
        <Text style={[styles.statusText, !online && styles.statusTextOffline]}>
          {loading ? 'Cargando...' : online ? (gpsActivo ? 'GPS en línea' : 'Sin GPS') : 'Sin conexión'}
        </Text>
      </View>

      <TouchableOpacity
        style={styles.bellBtn}
        onPress={() => router.push('/(app)/alertas' as any)}
        activeOpacity={0.85}
      >
        <Ionicons name="notifications" size={22} color={'#102e50'} />
        {alertasPendientes > 0 && (
          <View style={styles.bellBadge}>
            <Text style={styles.bellBadgeText}>
              {alertasPendientes > 9 ? '9+' : String(alertasPendientes)}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {tipoUsuario === 'familiar' && sinGrupo && !loading && (
        <TouchableOpacity
          style={styles.sinGrupoBanner}
          onPress={() => router.push('/(app)/grupo-familiar' as any)}
          activeOpacity={0.9}
        >
          <Ionicons name="people-outline" size={22} color={Colors.white} />
          <View style={{ flex: 1 }}>
            <Text style={styles.sinGrupoTitulo}>Aún no perteneces a un grupo</Text>
            <Text style={styles.sinGrupoSub}>Únete con el código que te dio el cuidador</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.white} />
        </TouchableOpacity>
      )}

      <Modal
        visible={!!modalPaciente}
        transparent
        animationType="slide"
        onRequestClose={() => setModalPaciente(null)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setModalPaciente(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalFotoRow}>
                {modalPaciente?.foto ? (
                  <Image source={{ uri: modalPaciente.foto }} style={styles.modalFoto} />
                ) : (
                  <View style={styles.modalFotoPlaceholder}>
                    <Ionicons name="person" size={36} color="#6b7280" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalNombre}>{modalPaciente?.nombre_paciente}</Text>
                  {modalPaciente?.edad_paciente && (
                    <Text style={styles.modalEdad}>{modalPaciente.edad_paciente} años</Text>
                  )}
                </View>
              </View>

              {[
                { icon: 'medkit-outline',  label: 'Diagnóstico',  val: modalPaciente?.enfermedad },
                { icon: 'card-outline',    label: 'Cédula',       val: modalPaciente?.cedula },
                { icon: 'medical-outline', label: 'EPS',          val: modalPaciente?.eps },
                { icon: 'people-outline',  label: 'Contacto',     val: modalPaciente?.familiar_nombre },
                { icon: 'call-outline',    label: 'Teléfono',     val: modalPaciente?.familiar_telefono },
              ].filter(r => r.val).map(row => (
                <View key={row.label} style={styles.modalRow}>
                  <Ionicons name={row.icon as any} size={16} color="#102e50" style={{ marginRight: 10, marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalRowLabel}>{row.label}</Text>
                    <Text style={styles.modalRowVal}>{row.val}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.modalClose} onPress={() => setModalPaciente(null)} activeOpacity={0.8}>
              <Text style={styles.modalCloseText}>Cerrar</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={!!modalPersona}
        transparent
        animationType="slide"
        onRequestClose={() => setModalPersona(null)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setModalPersona(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalFotoRow}>
              {modalPersona?.foto ? (
                <Image source={{ uri: modalPersona.foto }} style={styles.modalFoto} />
              ) : (
                <View style={styles.modalFotoPlaceholder}>
                  <Ionicons name={modalPersona?.tipo === 'familiar' ? 'heart' : 'shield-checkmark'} size={34} color="#6b7280" />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.modalNombre}>{modalPersona?.nombre || (modalPersona?.tipo === 'familiar' ? 'Familiar' : 'Cuidador')}</Text>
                <View style={[styles.personaBadge, modalPersona?.tipo === 'familiar' ? styles.personaBadgeFam : styles.personaBadgeCui]}>
                  <Ionicons
                    name={modalPersona?.tipo === 'familiar' ? 'heart' : 'shield-checkmark'}
                    size={12}
                    color={modalPersona?.tipo === 'familiar' ? '#9333ea' : '#16a34a'}
                  />
                  <Text style={[styles.personaBadgeText, { color: modalPersona?.tipo === 'familiar' ? '#9333ea' : '#16a34a' }]}>
                    {modalPersona?.tipo === 'familiar' ? 'Familiar' : 'Cuidador'}
                  </Text>
                </View>
              </View>
            </View>

            {modalPersona?.telefono ? (
              <View style={styles.modalRow}>
                <Ionicons name="call-outline" size={16} color="#102e50" style={{ marginRight: 10, marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalRowLabel}>Teléfono</Text>
                  <Text style={styles.modalRowVal}>{modalPersona.telefono}</Text>
                </View>
              </View>
            ) : (
              <Text style={styles.personaSinDatos}>Sin información de contacto disponible.</Text>
            )}

            <TouchableOpacity style={styles.modalClose} onPress={() => setModalPersona(null)} activeOpacity={0.8}>
              <Text style={styles.modalCloseText}>Cerrar</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <TouchableOpacity
        style={[styles.viajeBtn, estadoViaje?.activo && styles.viajeBtnActive]}
        onPress={() => setShowModoViaje(true)}
        activeOpacity={0.85}
      >
        <Ionicons
          name={estadoViaje?.activo ? 'airplane' : 'airplane-outline'}
          size={22}
          color={estadoViaje?.activo ? '#16a34a' : '#102e50'}
        />
        {estadoViaje?.activo && <View style={styles.viajeBadge} />}
      </TouchableOpacity>

      <ModoViajeModal
        visible={showModoViaje}
        onClose={() => setShowModoViaje(false)}
        pacientes={pacientes.map((p) => ({
          id:     p.id_paciente ?? p.id,
          nombre: p.nombre_paciente ?? 'Paciente',
        }))}
        estadoActivo={estadoViaje}
        onCambio={cargarDatos}
      />

      {rutaVisible && (
        <TouchableOpacity
          style={styles.clearRouteBtn}
          onPress={() => {
            webViewRef.current?.injectJavaScript('clearRoute(); true;')
            setRutaVisible(false)
          }}
          activeOpacity={0.85}
        >
          <Ionicons name="close-circle" size={18} color={Colors.white} />
          <Text style={styles.clearRouteBtnText}>Cerrar ruta</Text>
        </TouchableOpacity>
      )}
    </View>
    </AnimatedScreen>
  )
}

const styles = StyleSheet.create({
  container:    { flex: 1 },
  map:          { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.background,
  },

  menuBtn: {
    position: 'absolute', top: 52, left: 16,
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.white,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15, shadowRadius: 8, elevation: 6,
  },

  statusBadge: {
    position: 'absolute', top: 52, right: 16,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.white,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 14, gap: 7,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12, shadowRadius: 8, elevation: 6,
  },
  sinGrupoBanner: {
    position: 'absolute', bottom: 28, left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#102e50',
    paddingHorizontal: 16, paddingVertical: 14,
    borderRadius: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 12, elevation: 10,
  },
  sinGrupoTitulo: { fontSize: 14, fontWeight: '700', color: Colors.white },
  sinGrupoSub:    { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 },

  statusBadgeOffline: { backgroundColor: '#FFF8E1' },
  statusDot:          { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success },
  statusDotOffline:   { backgroundColor: Colors.warning },
  statusText:         { fontSize: 13, fontWeight: '600', color: Colors.text },
  statusTextOffline:  { color: Colors.warning },

  bellBtn: {
    position: 'absolute', top: 108, right: 16,
    width: 40, height: 40, borderRadius: 22,
    backgroundColor: Colors.white,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15, shadowRadius: 8, elevation: 6,
  },
  bellBadge: {
    position: 'absolute', top: 6, right: 6,
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: Colors.error,
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 3,
  },
  bellBadgeText: {
    fontSize: 10, fontWeight: '700', color: Colors.white,
  },

  viajeBtn: {
    position: 'absolute', top: 164, right: 16,
    width: 40, height: 40, borderRadius: 22,
    backgroundColor: Colors.white,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15, shadowRadius: 8, elevation: 6,
  },
  viajeBtnActive: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1.5,
    borderColor: '#16a34a',
  },
  viajeBadge: {
    position: 'absolute', top: 8, right: 8,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#16a34a',
  },

  clearRouteBtn: {
    position: 'absolute',
    bottom: 32,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#102e50',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
  },
  clearRouteBtnText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '700',
  },

  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet:     { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32, maxHeight: '75%' },
  modalHandle:    { width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb', alignSelf: 'center', marginBottom: 16 },

  modalFotoRow:        { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
  modalFoto:           { width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: '#102e50' },
  modalFotoPlaceholder:{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#f3f4f6', borderWidth: 2, borderColor: '#e5e7eb', justifyContent: 'center', alignItems: 'center' },
  modalNombre:         { fontSize: 18, fontWeight: '800', color: '#102e50', flexWrap: 'wrap' },
  modalEdad:           { fontSize: 14, color: '#6b7280', marginTop: 2 },

  modalRow:      { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  modalRowLabel: { fontSize: 11, color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  modalRowVal:   { fontSize: 14, color: '#111827', fontWeight: '500', marginTop: 1 },

  modalClose:     { marginTop: 20, backgroundColor: '#102e50', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  modalCloseText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  personaBadge:     { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  personaBadgeCui:  { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  personaBadgeFam:  { backgroundColor: '#faf5ff', borderColor: '#e9d5ff' },
  personaBadgeText: { fontSize: 12, fontWeight: '700' },
  personaSinDatos:  { fontSize: 13, color: '#9ca3af', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
})
