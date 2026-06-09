import { pacienteService } from './api'

export interface Paciente {
  id: string
  nombre_paciente: string
  edad_paciente?: number
  enfermedad?: string
  id_cuidador?: string
  id_dispositivo?: string
  ultima_ubicacion?: {
    latitud: number
    longitud: number
    timestamp?: string
  }
  activo?: boolean
}

export interface DatosRegistrarPaciente {
  nombre_paciente: string
  edad_paciente: number
  enfermedad?: string
  id_cuidador: string
  id_dispositivo?: string
}

export async function listarPacientes(): Promise<Paciente[]> {
  try {
    const res  = await pacienteService.listar()
    const data = res.data
    const lista: any[] = Array.isArray(data) ? data : (data?.pacientes ?? [])
    return lista.map((p: any) => ({
      ...p,
      id: p.id_paciente ?? p.id ?? p._id,
    }))
  } catch (e) {
    console.log('Error al listar pacientes:', e)
    return []
  }
}

export async function registrarPaciente(datos: DatosRegistrarPaciente): Promise<any> {
  return await pacienteService.registrar(datos)
}

export async function obtenerPaciente(id: string): Promise<Paciente | null> {
  try {
    const res = await pacienteService.obtener(id)
    return res.data as Paciente
  } catch (e) {
    console.log('Error al obtener paciente:', e)
    return null
  }
}

export async function actualizarPaciente(id: string, datos: Partial<Paciente>): Promise<any> {
  return await pacienteService.actualizar(id, datos)
}

export async function tienePacientes(): Promise<boolean> {
  const lista = await listarPacientes()
  return lista.length > 0
}

export async function obtenerUltimaUbicacion(
  pacienteId: string
): Promise<{ latitud: number; longitud: number; timestamp?: string } | null> {
  try {
    const res = await pacienteService.ultimaUbicacion(pacienteId)
    return res.data
  } catch (e) {
    console.log('Error al obtener última ubicación:', e)
    return null
  }
}

export async function obtenerRuta(pacienteId: string): Promise<any[]> {
  try {
    const res = await pacienteService.ruta(pacienteId)
    return Array.isArray(res.data) ? res.data : []
  } catch (e) {
    console.log('Error al obtener ruta:', e)
    return []
  }
}
