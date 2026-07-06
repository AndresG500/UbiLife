import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
  ImageBackground, Image, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { cuidadorService } from '@/services/api'
import { Colors } from '@/constants/Colors'

export default function RegisterCuidadorScreen() {
  const [name,      setName]      = useState('')
  const [email,     setEmail]     = useState('')
  const [phone,     setPhone]     = useState('')
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [foto,      setFoto]      = useState<string | null>(null)
  const [loading,         setLoading]         = useState(false)
  const [error,           setError]           = useState('')
  const [errorEsServidor, setErrorEsServidor] = useState(false)
  const [success,         setSuccess]         = useState(false)
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

  const seleccionarFoto = () => {
    Alert.alert('Foto de perfil', 'Elige una opción', [
      {
        text: 'Galería',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
          if (status !== 'granted') {
            Alert.alert('Permiso requerido', 'Se necesita acceso a la galería para seleccionar una foto.')
            return
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true,
          })
          if (!result.canceled && result.assets[0].base64) {
            setFoto(`data:image/jpeg;base64,${result.assets[0].base64}`)
          }
        },
      },
      {
        text: 'Cámara',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync()
          if (status !== 'granted') {
            Alert.alert('Permiso requerido', 'Se necesita acceso a la cámara para tomar una foto.')
            return
          }
          const result = await ImagePicker.launchCameraAsync({
            allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true,
          })
          if (!result.canceled && result.assets[0].base64) {
            setFoto(`data:image/jpeg;base64,${result.assets[0].base64}`)
          }
        },
      },
      ...(foto ? [{ text: 'Quitar foto', style: 'destructive' as const, onPress: () => setFoto(null) }] : []),
      { text: 'Cancelar', style: 'cancel' as const },
    ])
  }

  const handleRegister = async () => {
    const validationError = validate()
    if (validationError) { setError(validationError); return }

    setLoading(true)
    setError('')
    try {
      const payload: { name: string; email: string; password: string; phone?: string; foto?: string } = {
        name:     name.trim(),
        email:    email.trim().toLowerCase(),
        password,
      }
      if (phone.trim()) payload.phone = phone.trim()
      if (foto) payload.foto = foto

      await cuidadorService.registrar(payload)
      setSuccess(true)
    } catch (err: any) {
      const status = err?.response?.status
      if (status === 409) {
        setErrorEsServidor(false)
        setError('Este correo ya está registrado. Prueba con otro o inicia sesión.')
      } else if (status && status >= 500) {
        setErrorEsServidor(true)
        setError('No se pudo completar el registro. Inténtalo más tarde.')
      } else if (!status) {
        setErrorEsServidor(false)
        setError('Sin conexión. Verifica tu red e intenta de nuevo.')
      } else {
        setErrorEsServidor(false)
        setError('Verifica los datos ingresados e intenta de nuevo.')
      }
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <ImageBackground source={require('@/assets/images/map-bg.jpg')} style={styles.root} resizeMode="cover" blurRadius={0.5}>
        <View style={styles.overlay} />
        <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.successWrap}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={52} color={Colors.white} />
          </View>
          <Text style={styles.successTitle}>¡Cuenta creada!</Text>
          <Text style={styles.successSub}>
            Tu cuenta de cuidador ha sido registrada exitosamente. Ya puedes iniciar sesión.
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
      </ImageBackground>
    )
  }

  return (
    <ImageBackground source={require('@/assets/images/map-bg.jpg')} style={styles.root} resizeMode="cover" blurRadius={0.5}>
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

          <View style={styles.card}>

            {error ? (
              <View style={errorEsServidor ? styles.errorBox : styles.warningBox}>
                <Ionicons
                  name="warning-outline"
                  size={15}
                  color={errorEsServidor ? Colors.error : Colors.warning}
                  style={{ marginRight: 6 }}
                />
                <Text style={errorEsServidor ? styles.errorText : styles.warningText}>{error}</Text>
              </View>
            ) : null}

            {/* Foto de perfil (opcional) */}
            <View style={styles.fotoContainer}>
              <TouchableOpacity style={styles.fotoBtn} onPress={seleccionarFoto} activeOpacity={0.8}>
                {foto ? (
                  <Image source={{ uri: foto }} style={styles.fotoImagen} />
                ) : (
                  <View style={styles.fotoPlaceholder}>
                    <Ionicons name="camera-outline" size={26} color={Colors.textSecondary} />
                  </View>
                )}
                <View style={styles.fotoBadge}>
                  <Ionicons name="pencil" size={11} color={Colors.white} />
                </View>
              </TouchableOpacity>
              <Text style={styles.fotoLabel}>Foto de perfil <Text style={styles.opt}>(opcional)</Text></Text>
            </View>

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
                  onChangeText={(t) => setPhone(t.replace(/\D/g, '').slice(0, 10))}
                  keyboardType="phone-pad"
                  maxLength={10}
                  autoComplete="tel"
                />
              </View>
            </View>

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
    </ImageBackground>
  )
}

const styles = StyleSheet.create({
  root:    { flex: 1 },
  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(20, 50, 160, 0.78)' },
  kav: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    paddingTop: 16,
  },

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
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
    borderLeftWidth: 4,
    borderLeftColor: Colors.warning,
  },
  warningText: { flex: 1, color: '#92400e', fontSize: 13, lineHeight: 19 },

  fotoContainer: { alignItems: 'center', marginBottom: 20 },
  fotoBtn:       { width: 88, height: 88, borderRadius: 44 },
  fotoImagen:    { width: 88, height: 88, borderRadius: 44, borderWidth: 2, borderColor: Colors.primary },
  fotoPlaceholder: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: Colors.background,
    borderWidth: 1.5, borderColor: Colors.border, borderStyle: 'dashed',
    justifyContent: 'center', alignItems: 'center',
  },
  fotoBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.primary,
    borderWidth: 2, borderColor: Colors.white,
    justifyContent: 'center', alignItems: 'center',
  },
  fotoLabel: { fontSize: 12, color: Colors.text, fontWeight: '600', marginTop: 8 },

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

  btn: {
    backgroundColor: '#102e50',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#102e50',
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

  loginLink: {
    alignItems: 'center',
    marginTop: 20,
  },
  loginText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  loginHighlight: {
    color: '#102e50',
    fontWeight: '700',
  },

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