'use server'

// Registro presencial con QR por persona: el asesor escribe los datos y el panel muestra un QR
// solo para esa persona. Al enviar el mensaje, Genesys crea el lead con estos datos (usar_prerregistro).
import { mensajeError } from '@/lib/formato'
import { exigirPermiso } from '@/lib/sesion'
import { urlBase } from '@/lib/sitio'
import { crearClienteServidor } from '@/lib/supabase/server'

export interface ResultadoPrerregistro {
  error?: string
  id?: string
  url?: string
  nombre?: string
}

export async function crearPrerregistro(_previo: ResultadoPrerregistro, formData: FormData): Promise<ResultadoPrerregistro> {
  await exigirPermiso('qr_asesor')
  const texto = (k: string) => String(formData.get(k) ?? '').trim().replace(/\s+/g, ' ')
  const nombre = texto('nombre')
  const dni = texto('dni').replace(/\D/g, '')
  if (nombre.length < 3) return { error: 'Escribe el nombre de la persona.' }
  if (dni && !/^\d{8,12}$/.test(dni)) return { error: 'El DNI debe tener 8 dígitos (o déjalo vacío).' }

  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.from('prerregistros').insert({
    nombre: nombre.slice(0, 120),
    dni: dni || null,
    carrera: texto('carrera').slice(0, 120) || null,
    colegio: texto('colegio').slice(0, 120) || null,
    grado: texto('grado').slice(0, 40) || null,
  }).select('id, codigo').single()
  if (error) return { error: mensajeError(error) }
  return { id: data.id, url: `${await urlBase()}/w/${data.codigo}`, nombre }
}
