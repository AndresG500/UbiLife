import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import axios from 'axios'
import { registrarLogout } from '@/services/api'

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8000'

interface Cuidador {
  id?: string
  name?: string
  email: string
  phone?: string
  foto?: string | null
}

type TipoUsuario = 'cuidador' | 'familiar' | 'admin'

interface AuthContextType {
  token:     string | null
  cuidador:  Cuidador | null
  tipoUsuario: TipoUsuario
  loading:   boolean
  login:     (token: string, cuidador: Cuidador, tipo?: TipoUsuario) => Promise<void>
  logout:    () => Promise<void>
  actualizarUsuario: (datos: Partial<Cuidador>) => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token,        setToken]        = useState<string | null>(null)
  const [cuidador,     setCuidador]     = useState<Cuidador | null>(null)
  const [tipoUsuario,  setTipoUsuario]  = useState<TipoUsuario>('cuidador')
  const [loading,      setLoading]      = useState(true)

  useEffect(() => { init() }, [])

  useEffect(() => { registrarLogout(logout) }, [])

  const init = async () => {
    try {
      const t    = await SecureStore.getItemAsync('token')
      const c    = await AsyncStorage.getItem('cuidador')
      const tipo = await AsyncStorage.getItem('tipoUsuario') as TipoUsuario | null

      if (t) {
        const endpoint = tipo === 'familiar'
        ? '/familiares/grupos'
        : tipo === 'admin'
        ? '/admin/perfil'
        : '/cuidadores/perfil'
        try {
          await axios.get(`${BASE_URL}${endpoint}`, {
            headers: { Authorization: `Bearer ${t}` },
            timeout: 5000,
          })
          setToken(t)
          setCuidador(c ? JSON.parse(c) : null)
          setTipoUsuario(tipo ?? 'cuidador')
        } catch (err) {
          const status = axios.isAxiosError(err) ? err.response?.status : undefined
          if (status === 401 || status === 403) {
            // Token realmente inválido/revocado → limpiar sesión
            await SecureStore.deleteItemAsync('token')
            await AsyncStorage.multiRemove(['cuidador', 'tipoUsuario'])
          } else {
            // Error de red / timeout / servidor caído → conservar sesión y entrar
            // de forma optimista. El interceptor 401 de api.ts desloguea si el
            // token resulta inválido en la primera petición real.
            setToken(t)
            setCuidador(c ? JSON.parse(c) : null)
            setTipoUsuario(tipo ?? 'cuidador')
          }
        }
      }
    } finally {
      setLoading(false)
    }
  }

  const login = async (newToken: string, cuidadorData: Cuidador, tipo: TipoUsuario = 'cuidador') => {
    await SecureStore.setItemAsync('token',    newToken)
    await AsyncStorage.setItem('cuidador',    JSON.stringify(cuidadorData))
    await AsyncStorage.setItem('tipoUsuario', tipo)
    setToken(newToken)
    setCuidador(cuidadorData)
    setTipoUsuario(tipo)
  }

  const logout = async () => {
    await SecureStore.deleteItemAsync('token')
    await AsyncStorage.multiRemove(['cuidador', 'tipoUsuario'])
    setToken(null)
    setCuidador(null)
    setTipoUsuario('cuidador')
  }

  const actualizarUsuario = async (datos: Partial<Cuidador>) => {
    setCuidador((prev) => {
      const actualizado = { ...(prev ?? { email: '' }), ...datos } as Cuidador
      AsyncStorage.setItem('cuidador', JSON.stringify(actualizado)).catch(() => {})
      return actualizado
    })
  }

  return (
    <AuthContext.Provider value={{ token, cuidador, tipoUsuario, loading, login, logout, actualizarUsuario }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
