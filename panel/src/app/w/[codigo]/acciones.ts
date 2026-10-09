'use server'

// Formulario público del QR de un asesor (atención presencial), sin iniciar sesión.
// registrar_lead_asesor() valida, no duplica y deja el lead como de ese asesor.
// Después la pantalla abre WhatsApp con un mensaje listo: el interesado escribe primero.
import { crearClienteServidor } from '@/lib/supabase/server'
import type { ResultadoRegistro } from '@/app/r/[codigo]/acciones'
import { CAMPOS_REGISTRO_PUBLICO, camposDe, esquemaRegistroPublico, primerError, type RegistroPublico } from '@/lib/validacion'

function temaDeInteres(carrera: string): string {
  if (!carrera || /^(aun|aún) no/i.test(carrera)) return 'las carreras y la admisión 2027'
  if (/cepre/i.test(carrera)) return 'el CEPRE'
  return carrera
}

export async function registrarseConAsesor(codigo: string, _previo: ResultadoRegistro, formData: FormData): Promise<ResultadoRegistro> {
  if (String(formData.get('sitio_web') ?? '').trim()) return { ok: true }
  if (formData.get('acepto') !== 'on') return { error: 'Marca la casilla para que podamos contactarte por WhatsApp.' }
  const validado = esquemaRegistroPublico.safeParse({ codigo, ...camposDe(formData, CAMPOS_REGISTRO_PUBLICO) })
  if (!validado.success) return { error: primerError(validado.error) }
  const texto = (k: keyof RegistroPublico) => validado.data[k]

  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc('registrar_lead_asesor', {
    p_codigo: codigo,
    p_nombre: texto('nombre'),
    p_telefono: texto('celular'),
    p_dni: texto('dni') || undefined,
    p_colegio: texto('colegio') || undefined,
    p_grado: texto('grado') || undefined,
    p_carrera: texto('carrera') || undefined,
  })
  if (error) return { error: error.message || 'No pudimos registrarte. Intenta de nuevo.' }

  const r = data as { asesor?: string; whatsapp?: string | null; ref?: string }
  const nombre = texto('nombre').split(/\s+/)[0]
  const tema = temaDeInteres(texto('carrera'))
  const mensaje = `Hola, soy ${nombre}. Acabo de enviar mis datos con ${r.asesor ?? 'mi asesor(a)'} en Admisión de la Universidad Peruana Unión y quiero información ${tema.startsWith('el ') ? 'del ' + tema.slice(3) : 'de ' + tema}.${r.ref ? ` (Ref. ${r.ref})` : ''}`
  const numero = (r.whatsapp ?? '').replace(/\D/g, '')
  return {
    ok: true,
    nombre,
    tema,
    enlaceWhatsApp: numero ? `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}` : null,
  }
}
