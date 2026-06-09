import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Drawer } from 'expo-router/drawer'
import DrawerContent from '@/components/DrawerContent'

export default function AppLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Drawer
        drawerContent={(props) => <DrawerContent {...props} />}
        screenOptions={{
          headerShown:    false,
          drawerType:     'slide',
          drawerStyle:    { width: 285 },
          overlayColor:   'rgba(0,0,0,0.45)',
          swipeEdgeWidth: 60,
        }}
      >
        <Drawer.Screen name="index" />
        <Drawer.Screen name="alertas" />
        <Drawer.Screen name="zonas-seguras" />
        <Drawer.Screen name="historial-ubicaciones" />
        <Drawer.Screen name="grupo-familiar" />
        <Drawer.Screen name="pacientes" />
        <Drawer.Screen name="registro-paciente" />
        <Drawer.Screen name="vincular-dispositivo" />
        <Drawer.Screen name="perfil" />
      </Drawer>
    </GestureHandlerRootView>
  )
}
