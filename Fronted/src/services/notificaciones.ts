import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const IS_EXPO_GO = Constants.appOwnership === 'expo';

// En Expo Go SDK 53+ el módulo expo-notifications no soporta push remoto.
// Se usa require condicional para evitar el error en el arranque.
type NotificationsModule = typeof import('expo-notifications');
const Notifications: NotificationsModule | null = IS_EXPO_GO
  ? null
  : (require('expo-notifications') as NotificationsModule);

if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: false,   // mostramos banner propio en primer plano
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: false,
      shouldShowList: true,     // sigue apareciendo en el centro de notificaciones
    }),
  });

  // Android 8+ requiere que el canal exista antes de recibir notificaciones;
  // si el canal no existe, Android descarta la notificación silenciosamente.
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('ubilife_alertas', {
      name: 'Alertas UbiLife',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1D4ED8',
      enableVibrate: true,
    });
  }
}

export async function registrarToken(): Promise<void> {
  if (!Notifications) {
    console.log('[Notificaciones] Ejecutando en Expo Go — usa un development build para notificaciones push');
    return;
  }

  if (!Device.isDevice) return;

  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      const { status: nuevo } = await Notifications.requestPermissionsAsync();
      if (nuevo !== 'granted') return;
    }

    const token = await Notifications.getExpoPushTokenAsync({
      projectId: Constants.expoConfig?.extra?.eas?.projectId,
    });

    if (!token.data) return;

    const tokenStr = await SecureStore.getItemAsync('token');
    if (!tokenStr) return;

    const tipoUsuario = await AsyncStorage.getItem('tipoUsuario');
    const endpoint = tipoUsuario === 'familiar'
      ? `${API_URL}/familiares/fcm-token`
      : `${API_URL}/cuidadores/fcm-token`;

    await axios.patch(
      endpoint,
      { token: token.data },
      { headers: { Authorization: `Bearer ${tokenStr}` } }
    );
  } catch (error) {
    console.warn('Error registrando token FCM:', error);
  }
}

export function configurarListeners(
  onRecibida: (titulo: string, cuerpo: string) => void,
  onTap: () => void,
): () => void {
  if (!Notifications) {
    console.log('[Notificaciones] Listeners omitidos en Expo Go');
    return () => {};
  }

  type Subscription = ReturnType<typeof Notifications.addNotificationReceivedListener>;
  const subs: Subscription[] = [];

  subs.push(
    Notifications.addNotificationReceivedListener((notif) => {
      const titulo = notif.request.content.title ?? 'Alerta UbiLife';
      const cuerpo = notif.request.content.body  ?? '';
      onRecibida(titulo, cuerpo);
    })
  );

  subs.push(
    Notifications.addNotificationResponseReceivedListener(() => {
      onTap();
    })
  );

  return () => subs.forEach((s) => s.remove());
}

export async function verificarNotifInicial(): Promise<boolean> {
  if (!Notifications) return false;
  try {
    const resp = await Notifications.getLastNotificationResponseAsync();
    return !!resp;
  } catch {
    return false;
  }
}
