import { View, Text, TouchableOpacity, StyleSheet, ImageBackground } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { Colors } from '@/constants/Colors'

export default function ElegirRolScreen() {
  const router = useRouter()

  return (
    <ImageBackground
      source={require('@/assets/images/map-bg.jpg')}
      style={styles.root}
      resizeMode="cover"
      blurRadius={0.5}
    >
      <View style={styles.overlay} />
      <SafeAreaView style={{ flex: 1 }}>

      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="people" size={48} color={Colors.white} />
        </View>
        <Text style={styles.title}>¿Cómo te registras?</Text>
        <Text style={styles.subtitle}>
          Elige tu rol en UbiLife para continuar
        </Text>

        <View style={styles.cards}>
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push('/register-cuidador')}
            activeOpacity={0.85}
          >
            <View style={styles.cardIcon}>
              <Ionicons name="person" size={28} color={Colors.primary} />
            </View>
            <Text style={styles.cardTitle}>Cuidador</Text>
            <Text style={styles.cardDesc}>
              Cuidar pacientes con Alzheimer. Puedes agregar pacientes y crear zonas seguras.
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.card, styles.cardSecondary]}
            onPress={() => router.push('/register-familiar')}
            activeOpacity={0.85}
          >
            <View style={[styles.cardIcon, styles.cardIconSecondary]}>
              <Ionicons name="heart" size={28} color={Colors.primaryLight} />
            </View>
            <Text style={styles.cardTitleSecondary}>Familiar</Text>
            <Text style={[styles.cardDesc, styles.cardDescSecondary]}>
              Únete a un grupo familiar para ver la ubicación y alertas del paciente.
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.loginLink}
           onPress={() => router.push('/login')}
          activeOpacity={0.7}
        >
          <Text style={styles.loginText}>
            ¿Ya tienes cuenta?{' '}
            <Text style={styles.loginHighlight}>Inicia sesión</Text>
          </Text>
        </TouchableOpacity>
      </View>
      </SafeAreaView>
    </ImageBackground>
  )
}

const styles = StyleSheet.create({
  root:    { flex: 1 },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(20, 50, 160, 0.78)' },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.white,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'center',
    marginBottom: 32,
  },
  cards: {
    gap: 16,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  cardSecondary: {
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  cardIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primaryBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardIconSecondary: {
    backgroundColor: 'rgba(96,165,250,0.15)',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 6,
  },
  cardTitleSecondary: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.primaryLight,
    marginBottom: 6,
  },
  cardDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
  },
  cardDescSecondary: {
    color: Colors.primaryLight,
  },
  loginLink: {
    alignItems: 'center',
    marginTop: 32,
  },
  loginText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
  },
  loginHighlight: {
    color: Colors.white,
    fontWeight: '700',
  },
})