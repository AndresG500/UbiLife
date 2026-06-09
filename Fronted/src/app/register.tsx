import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { cuidadorService } from '@/services/api'
import { Colors } from '@/constants/Colors'

export default function RegisterScreen() {
  const [name,      setName]      = useState('')
  const [email,     setEmail]     = useState('')
  const [phone,     setPhone]     = useState('')
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [success,   setSuccess]   = useState(false)
  const router = useRouter()

  const validate = () => {
    if (name.trim().length < 2)
      return 'El nombre debe tener al menos 2 caracteres.'
    if (!email.trim().includes('@'))
      return 'Ingresa un correo electrónico válido.'
    if (phone.trim() && !/^\+?[0-9]{7,15}$/.test(phone.trim()))
      return 'El teléfono debe tener entre 7 y 15 dígitos (puede comenzar con +).'
    if (password.length < 8)
      return 'La contraseña debe tener al menos 8 caracteres.'
    if (password !== confirm)
      return 'Las contraseñas no coinciden.'
    return null
  }

  const handleRegister = async () => {
    const validationError = validate()
    if (validationError) { setError(validationError); return }

    setLoading(true)
    setError('')
    try {
      const payload: { name: string; email: string; password: string; phone?: string } = {
        name:     name.trim(),
        email:    email.trim().toLowerCase(),
        password,
      }
      if (phone.trim()) payload.phone = phone.trim()

      await cuidadorService.registrar(payload)
      setSuccess(true)
    } catch (err: any) {
      const msg =
        err.response?.data?.detail  ??
        err.response?.data?.duplicado ??
        err.response?.data?.mensaje ??
        err.response?.data?.error   ??
        'No se pudo completar el registro. Intenta de nuevo.'
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg))
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.bgTop} />
        <View style={styles.successWrap}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={52} color={Colors.white} />
          </View>
          <Text style={styles.successTitle}>¡Cuenta creada!</Text>
          <Text style={styles.successSub}>
            Tu cuenta ha sido registrada exitosamente. Ya puedes iniciar sesión.
          </Text>
          <TouchableOpacity
            style={styles.successBtn}
            onPress={() => router.replace('/login')}
            activeOpacity={0.85}
          >
            <Text style={styles.successBtnText}>Iniciar sesión</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.bgTop} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kav}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
              <Ionicons name="arrow-back" size={22} color={Colors.white} />
            </TouchableOpacity>
            <View style={styles.logoWrap}>
              <Ionicons name="person-add" size={38} color={Colors.white} />
            </View>
            <Text style={styles.appName}>Crear cuenta</Text>
            <Text style={styles.tagline}>Regístrate como cuidador</Text>
          </View>

          {/* Card */}
          <View style={styles.card}>

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="warning-outline" size={15} color={Colors.error} style={{ marginRight: 6, marginTop: 1 }} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Nombre */}
            <View style={styles.field}>
              <Text style={styles.label}>Nombre completo <Text style={styles.req}>*</Text></Text>
              <View style={styles.inputWrap}>
                <Ionicons name="person-outline" size={18} color={Colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Ej: María Rodríguez"
                  placeholderTextColor={Colors.textSecondary}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  autoComplete="name"
                />
              </View>
            </View>

            {/* Correo */}
            <View style={styles.field}>
              <Text style={styles.label}>Correo electrónico <Text style={styles.req}>*</Text></Text>
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

            {/* Teléfono */}
            <View style={styles.field}>
              <Text style={styles.label}>
                Teléfono <Text style={styles.opt}>(opcional)</Text>
              </Text>
              <View style={styles.inputWrap}>
                <Ionicons name="call-outline" size={18} color={Colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="+573001234567"
                  placeholderTextColor={Colors.textSecondary}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                />
              </View>
            </View>

            {/* Contraseña */}
            <View style={styles.field}>
              <Text style={styles.label}>Contraseña <Text style={styles.req}>*</Text></Text>
              <View style={styles.inputWrap}>
                <Ionicons name="lock-closed-outline" size={18} color={Colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Mínimo 8 caracteres"
                  placeholderTextColor={Colors.textSecondary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="new-password"
                />
              </View>
            </View>

            {/* Confirmar contraseña */}
            <View style={styles.field}>
              <Text style={styles.label}>Confirmar contraseña <Text style={styles.req}>*</Text></Text>
              <View style={styles.inputWrap}>
                <Ionicons name="lock-closed-outline" size={18} color={Colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Repite tu contraseña"
                  placeholderTextColor={Colors.textSecondary}
                  value={confirm}
                  onChangeText={setConfirm}
                  secureTextEntry
                  autoComplete="new-password"
                />
              </View>
            </View>

            {/* Botón */}
            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleRegister}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color={Colors.white} />
                : <Text style={styles.btnText}>Crear cuenta</Text>}
            </TouchableOpacity>

            {/* Volver */}
            <TouchableOpacity
              style={styles.loginLink}
              onPress={() => router.back()}
              activeOpacity={0.7}
            >
              <Text style={styles.loginText}>
                ¿Ya tienes cuenta?{' '}
                <Text style={styles.loginHighlight}>Inicia sesión</Text>
              </Text>
            </TouchableOpacity>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  bgTop: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: Colors.primary,
  },
  kav: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    paddingTop: 16,
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  backBtn: {
    alignSelf: 'flex-start',
    padding: 4,
    marginBottom: 16,
  },
  logoWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  appName: {
    fontSize: 30,
    fontWeight: '800',
    color: Colors.white,
    letterSpacing: 0.5,
  },
  tagline: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.72)',
    marginTop: 5,
  },

  // Card
  card: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 10,
  },

  // Error
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
    borderLeftWidth: 4,
    borderLeftColor: Colors.error,
  },
  errorText: {
    flex: 1,
    color: Colors.error,
    fontSize: 13,
    lineHeight: 19,
  },

  // Campos
  field: { marginBottom: 16 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 7,
  },
  req: {
    color: Colors.error,
  },
  opt: {
    color: Colors.textSecondary,
    fontWeight: '400',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 12,
    backgroundColor: Colors.background,
    paddingHorizontal: 14,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 15,
    color: Colors.text,
  },

  // Botón principal
  btn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: Colors.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  btnDisabled: { opacity: 0.65 },
  btnText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Link de login
  loginLink: {
    alignItems: 'center',
    marginTop: 20,
  },
  loginText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  loginHighlight: {
    color: Colors.primary,
    fontWeight: '700',
  },

  // Pantalla de éxito
  successWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  successIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  successTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: Colors.white,
  },
  successSub: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    lineHeight: 22,
  },
  successBtn: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 40,
    marginTop: 12,
  },
  successBtnText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
})
