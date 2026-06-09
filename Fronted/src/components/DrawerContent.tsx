import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter, usePathname } from 'expo-router'
import { useAuth } from '@/context/AuthContext'
import { Colors } from '@/constants/Colors'

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

interface Props { navigation: any }

export default function DrawerContent({ navigation }: Props) {
  const { cuidador, tipoUsuario, logout } = useAuth()
  const router   = useRouter()
  const pathname = usePathname()

  const NAV_ITEMS_CUIDADOR = [
    { label: 'Mapa',                icon: 'map-outline' as IoniconsName,              iconActive: 'map' as IoniconsName,              route: '/(app)'                      },
    { label: 'Zonas seguras',       icon: 'shield-outline' as IoniconsName,           iconActive: 'shield-checkmark' as IoniconsName, route: '/(app)/zonas-seguras'         },
    { label: 'Historial ubicación', icon: 'location-outline' as IoniconsName,         iconActive: 'location' as IoniconsName,         route: '/(app)/historial-ubicaciones' },
    { label: 'Grupo familiar',      icon: 'people-outline' as IoniconsName,           iconActive: 'people' as IoniconsName,           route: '/(app)/grupo-familiar'        },
    { label: 'Pacientes',           icon: 'people-circle-outline' as IoniconsName,    iconActive: 'people-circle' as IoniconsName,    route: '/(app)/pacientes'             },
    { label: 'Mi perfil',           icon: 'person-circle-outline' as IoniconsName,    iconActive: 'person-circle' as IoniconsName,    route: '/(app)/perfil'                },
  ]

  const NAV_ITEMS_FAMILIAR = [
    { label: 'Mapa',                icon: 'map-outline' as IoniconsName,              iconActive: 'map' as IoniconsName,              route: '/(app)'                      },
    { label: 'Zonas seguras',       icon: 'shield-outline' as IoniconsName,           iconActive: 'shield-checkmark' as IoniconsName, route: '/(app)/zonas-seguras'         },
    { label: 'Historial ubicación', icon: 'location-outline' as IoniconsName,         iconActive: 'location' as IoniconsName,         route: '/(app)/historial-ubicaciones' },
    { label: 'Grupo familiar',      icon: 'people-outline' as IoniconsName,           iconActive: 'people' as IoniconsName,           route: '/(app)/grupo-familiar'        },
    { label: 'Pacientes',           icon: 'people-circle-outline' as IoniconsName,    iconActive: 'people-circle' as IoniconsName,    route: '/(app)/pacientes'             },
    { label: 'Mi perfil',           icon: 'person-circle-outline' as IoniconsName,    iconActive: 'person-circle' as IoniconsName,    route: '/(app)/perfil'                },
  ]

  const navItems = tipoUsuario === 'familiar' ? NAV_ITEMS_FAMILIAR : NAV_ITEMS_CUIDADOR

  const initial  = cuidador?.name?.charAt(0)?.toUpperCase() ?? '?'
  const rolLabel = tipoUsuario === 'familiar' ? 'Familiar' : 'Cuidador'
  const rolIcon: IoniconsName = tipoUsuario === 'familiar' ? 'heart' : 'shield-checkmark'

  const handleLogout = async () => {
    navigation.closeDrawer()
    await logout()
  }

  const handleNav = (route: string) => {
    navigation.closeDrawer()
    router.replace(route as any)
  }

  const isActive = (route: string) =>
    pathname === route || (route === '/(app)' && (pathname === '/' || pathname === '/(app)'))

  return (
    <SafeAreaView style={styles.root}>

      {/* ── Header ──────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerAccent} />

        {/* Avatar doble anillo */}
        <View style={styles.avatarOuter}>
          <View style={styles.avatarInner}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
        </View>

        <Text style={styles.name} numberOfLines={1}>{cuidador?.name ?? 'Usuario'}</Text>
        <Text style={styles.email} numberOfLines={1}>{cuidador?.email ?? ''}</Text>

        <View style={styles.badgeRow}>
          <View style={styles.rolBadge}>
            <Ionicons name={rolIcon} size={11} color={Colors.primaryLight} />
            <Text style={styles.rolText}>{rolLabel}</Text>
          </View>
          <View style={styles.onlineBadge}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>En línea</Text>
          </View>
        </View>
      </View>

      {/* ── Separador ───────────────────────────────────────── */}
      <View style={styles.sep} />

      {/* ── Navegación ──────────────────────────────────────── */}
      <View style={styles.navSection}>
        <Text style={styles.navLabel}>MENÚ</Text>
        {navItems.map((item) => {
          const active = isActive(item.route)
          return (
            <TouchableOpacity
              key={item.route}
              style={[styles.navItem, active && styles.navItemActive]}
              onPress={() => handleNav(item.route)}
              activeOpacity={0.75}
            >
              {active && <View style={styles.activeBar} />}
              <Ionicons
                name={active ? item.iconActive : item.icon}
                size={21}
                color={active ? Colors.primaryLight : Colors.drawerMuted}
                style={styles.navIcon}
              />
              <Text style={[styles.navItemText, active && styles.navItemTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* ── Footer ──────────────────────────────────────────── */}
      <View style={styles.footer}>
        <View style={styles.sep} />
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.75}>
          <View style={styles.logoutIconWrap}>
            <Ionicons name="log-out-outline" size={18} color={Colors.error} />
          </View>
          <Text style={styles.logoutText}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.drawerBg },

  /* ── Header ── */
  header: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 28,
  },
  headerAccent: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 3,
    backgroundColor: Colors.primaryLight,
    opacity: 0.6,
  },
  avatarOuter: {
    width: 88, height: 88, borderRadius: 44,
    borderWidth: 2, borderColor: 'rgba(77,138,184,0.35)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 14,
    backgroundColor: 'rgba(77,138,184,0.06)',
  },
  avatarInner: {
    width: 74, height: 74, borderRadius: 37,
    backgroundColor: '#1e3a5f',
    borderWidth: 2, borderColor: 'rgba(77,138,184,0.25)',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 30, fontWeight: '700', color: Colors.white },
  name:       { fontSize: 17, fontWeight: '700', color: Colors.drawerText, marginBottom: 4, textAlign: 'center' },
  email:      { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 14, textAlign: 'center' },

  badgeRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  rolBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(77,138,184,0.14)',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(77,138,184,0.28)',
  },
  rolText: { fontSize: 11, color: Colors.primaryLight, fontWeight: '600' },
  onlineBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(16,185,129,0.12)',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(16,185,129,0.22)',
  },
  onlineDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  onlineText: { fontSize: 11, color: Colors.success, fontWeight: '600' },

  /* ── Separator ── */
  sep: { height: 1, backgroundColor: Colors.drawerBorder, marginHorizontal: 20 },

  /* ── Nav ── */
  navSection: { flex: 1, paddingHorizontal: 14, paddingTop: 20 },
  navLabel: {
    fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.25)',
    letterSpacing: 1.2, marginLeft: 16, marginBottom: 8,
  },
  navItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 13, paddingHorizontal: 16,
    borderRadius: 14, marginBottom: 2,
    overflow: 'hidden',
  },
  navItemActive: { backgroundColor: 'rgba(16,46,80,0.40)' },
  activeBar: {
    position: 'absolute', left: 0, top: 10, bottom: 10,
    width: 3, borderRadius: 2,
    backgroundColor: Colors.primaryLight,
  },
  navIcon:         { marginRight: 14 },
  navItemText:     { flex: 1, fontSize: 14, fontWeight: '500', color: Colors.drawerMuted },
  navItemTextActive: { color: Colors.drawerText, fontWeight: '700' },

  /* ── Footer ── */
  footer: { paddingBottom: 16 },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 20,
    marginTop: 10, gap: 14,
  },
  logoutIconWrap: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(239,68,68,0.12)',
    justifyContent: 'center', alignItems: 'center',
  },
  logoutText: { fontSize: 14, color: Colors.error, fontWeight: '600' },
})
