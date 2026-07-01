import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
  ImageBackground, Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useAuth } from '@/context/AuthContext'
import { cuidadorService, familiarService, adminService } from '@/services/api'
import { registrarToken } from '@/utils/notificaciones'
import { Colors } from '@/constants/Colors'

export default function LoginScreen() {
  const [email,           setEmail]           = useState('')
  const [password,        setPassword]        = useState('')
  const [showPassword,    setShowPassword]    = useState(false)
  const [loading,         setLoading]         = useState(false)
  const [error,           setError]           = useState('')
  const [errorEsServidor, setErrorEsServidor] = useState(false)
  const { login } = useAuth()
  const router    = useRouter()

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Por favor completa todos los campos')
      return
    }
    setLoading(true)
    setError('')

    const correo = email.trim().toLowerCase()

    // ── 1. Intentar como cuidador ─────────────────────────────
    try {
      const res  = await cuidadorService.login(correo, password)
      const data = res.data
      await login(data.token ?? data.access_token, data.cuidador ?? { email: correo }, 'cuidador')
      registrarToken().catch(() => {})
      router.replace('/(app)')
      return
    } catch {}

    // ── 2. Intentar como familiar ─────────────────────────────
    try {
      const res  = await familiarService.login(correo, password)
      const data = res.data
      await login(data.token ?? data.access_token, data.familiar ?? { email: correo }, 'familiar')
      registrarToken().catch(() => {})
      router.replace('/(app)')
      return
    } catch {}

    // ── 3. Intentar como administrador ────────────────────────
    try {
      const res  = await adminService.login(correo, password)
      const data = res.data
      await login(data.token ?? data.access_token, { email: correo, name: data.admin?.nombre }, 'admin')
      router.replace('/(admin)' as any)
      return
    } catch (adminErr: any) {
      const status = adminErr?.response?.status
      if (status && status >= 500) {
        setErrorEsServidor(true)
        setError('Error en el servidor. Inténtalo más tarde.')
      } else if (!status) {
        setErrorEsServidor(false)
        setError('Sin conexión. Verifica tu red e intenta de nuevo.')
      } else {
        setErrorEsServidor(false)
        setError('Correo o contraseña incorrectos.')
      }
    }

    setLoading(false)
  }

  return (
    <ImageBackground
      source={require('@/assets/images/map-bg.jpg')}
      style={styles.root}
      resizeMode="cover"
      blurRadius={0.5}
    >
      <View style={styles.overlay} />
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.kav}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
            {/* Logo y nombre */}
            <View style={styles.header}>
              <View>
                <Image
                  source={require('@/assets/images/Logo.png')}
                  style={styles.logoImage}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.appName}>UbiLife</Text>
              <Text style={styles.tagline}>Rastreo GPS para cuidadores</Text>
            </View>

            {/* Card */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Iniciar sesión</Text>

              {error ? (
                <View style={errorEsServidor ? styles.errorBox : styles.warningBox}>
                  <Ionicons
                    name="warning-outline"
                    size={15}
                    color={errorEsServidor ? Colors.error : Colors.warning}
                    style={{ marginRight: 6, marginTop: 1 }}
                  />
                  <Text style={errorEsServidor ? styles.errorText : styles.warningText}>{error}</Text>
                </View>
              ) : null}

              {/* Email */}
              <View style={styles.field}>
                <Text style={styles.label}>Correo electrónico</Text>
                <View style={styles.inputWrap}>
                  <Ionicons name="mail-outline" size={18} color={Colors.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="correo@ejemplo.com"
                    placeholderTextColor={Colors.textSecondary}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                  />
                </View>
              </View>

              {/* Contraseña */}
              <View style={styles.field}>
                <Text style={styles.label}>Contraseña</Text>
                <View style={styles.inputWrap}>
                  <TouchableOpacity onPress={() => setShowPassword(v => !v)} activeOpacity={0.7}>
                    <Ionicons
                      name={showPassword ? 'lock-open-outline' : 'lock-closed-outline'}
                      size={18}
                      color={showPassword ? Colors.primary : Colors.textSecondary}
                      style={styles.inputIcon}
                    />
                  </TouchableOpacity>
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor={Colors.textSecondary}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoComplete="password"
                  />
                </View>
              </View>

              {/* Botón */}
              <TouchableOpacity
                style={[styles.btn, loading && styles.btnDisabled]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading
                  ? <ActivityIndicator color={Colors.white} />
                  : <Text style={styles.btnText}>Ingresar</Text>}
              </TouchableOpacity>

              {/* Link de registro */}
              <TouchableOpacity
                style={styles.registerLink}
                onPress={() => router.push('/elegir-rol')}
                activeOpacity={0.7}
              >
                <Text style={styles.registerText}>
                  ¿No tienes cuenta?{' '}
                  <Text style={styles.registerHighlight}>Regístrate</Text>
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  )
}

const styles = StyleSheet.create({
  root:    { flex: 1 },
  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(20, 50, 160, 0.78)' },
  kav:     { flex: 1 },
  scroll:  { flexGrow: 1, justifyContent: 'center', padding: 24 },

  header: { alignItems: 'center', marginBottom: 28 },
  logoWrap: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 16, borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  logoImage: { width: 250, height: 150 },
  appName: { fontSize: 38, fontWeight: '800', color: Colors.white, letterSpacing: 1.5 },
  tagline: { fontSize: 14, color: 'rgba(255,255,255,0.72)', marginTop: 6, letterSpacing: 0.3 },

  card: {
    backgroundColor: Colors.white, borderRadius: 24, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18, shadowRadius: 20, elevation: 10,
  },
  cardTitle: {
    fontSize: 22, fontWeight: '700', color: '#102e50',
    marginBottom: 20, textAlign: 'center',
  },

  errorBox: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#FEF2F2', borderRadius: 12, padding: 14,
    marginBottom: 16, borderLeftWidth: 4, borderLeftColor: Colors.error,
  },
  errorText: { flex: 1, color: Colors.error, fontSize: 13, lineHeight: 19 },
  warningBox: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#FFFBEB', borderRadius: 12, padding: 14,
    marginBottom: 16, borderLeftWidth: 4, borderLeftColor: Colors.warning,
  },
  warningText: { flex: 1, color: '#92400e', fontSize: 13, lineHeight: 19 },

  field:     { marginBottom: 16 },
  label:     { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 7 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: 12, backgroundColor: Colors.background,
    paddingHorizontal: 12,
  },
  inputIcon: { marginRight: 8 },
  input: {
    flex: 1, paddingVertical: 13,
    fontSize: 15, color: Colors.text,
  },

  btn: {
    backgroundColor: '#102e50', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
    marginTop: 8, marginHorizontal: 16,
    shadowColor: Colors.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  btnDisabled: { opacity: 0.65 },
  btnText:     { color: Colors.white, fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },

  registerLink:      { alignItems: 'center', marginTop: 18 },
  registerText:      { fontSize: 14, color: Colors.textSecondary },
  registerHighlight: { color: '#102e50', fontWeight: '700' },
})
