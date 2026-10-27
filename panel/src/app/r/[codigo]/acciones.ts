'use server'

// Formulario público del QR: lo llena el alumno desde su celular, sin iniciar sesión.
// La validación y el registro los hace registrar_lead_actividad(): sin duplicados, identificado por DNI si lo da o, si no, por celular.
// Genesys no le escribe primero: la pantalla final abre WhatsApp con un mensaje listo y el alumno lo envía.
import { crearClienteServidor } from '@/lib/supabase/server'
import { rutaUbigeo } from '@/lib/ubigeos'
import { UBIGEOS } from '@/lib/ubigeos-servidor'
import { CAMPOS_REGISTRO_PUBLICO, camposDe, esquemaRegistroPublico, primerError, type RegistroPublico } from '@/lib/validacion'

export interface ResultadoRegistro {
  error?: string
  ok?: boolean
  nombre?: string
  /** Enlace wa.me al número de Genesys con el mensaje ya escrito (si el número está configurado) */
  enlaceWhatsApp?: string | null
  tema?: string
}

/** "Medicina Humana" -> "Medicina Humana"; "CEPRE" -> "el CEPRE"; sin carrera -> "las carreras y la admisión 2027" */
function temaDeInteres(carrera: string): string {
  if (!carrera) return 'las carreras y la admisión 2027'
  if (/cepre/i.test(carrera)) return 'el CEPRE'
  return carrera
}

/** Respuestas a las preguntas propias: "p_<id>" (una), "pv_<id>" (varias) y "pl_<id>" (lugar). La base valida cuáles valen. */
function respuestasDe(formData: FormData): Record<string, string | string[]> {
  const r: Record<string, string | string[]> = {}
  for (const [clave] of formData) {
    const una = /^p_(p\d{1,3})$/.exec(clave)
    const varias = /^pv_(p\d{1,3})$/.exec(clave)
    // Lugar: llega el código UBIGEO y se guarda con sus nombres ("Juliaca · San Román · Puno")
    const lugar = /^pl_(p\d{1,3})$/.exec(clave)
    const codigo = String(formData.get(clave) ?? '')
    if (lugar) r[lugar[1]!] = UBIGEOS.has(codigo) ? rutaUbigeo(codigo, UBIGEOS) : ''
    else if (una) r[una[1]!] = String(formData.get(clave) ?? '').slice(0, 500)
    else if (varias) r[varias[1]!] = formData.getAll(clave).map((v) => String(v).slice(0, 100)).slice(0, 20)
  }
  return r
}

export async function registrarseEnActividad(codigo: string, _previo: ResultadoRegistro, formData: FormData): Promise<ResultadoRegistro> {
  // Campo trampa: los bots lo llenan, las personas no lo ven
  if (String(formData.get('sitio_web') ?? '').trim()) return { ok: true }
  if (formData.get('acepto') !== 'on') return { error: 'Marca la casilla para que podamos contactarte por WhatsApp.' }
  const validado = esquemaRegistroPublico.safeParse({ codigo, ...camposDe(formData, CAMPOS_REGISTRO_PUBLICO) })
  if (!validado.success) return { error: primerError(validado.error) }
  const texto = (k: keyof RegistroPublico) => validado.data[k]

  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc('registrar_lead_actividad', {
    p_codigo: codigo,
    p_nombre: texto('nombre'),
    p_telefono: texto('celular'),
    p_dni: texto('dni') || undefined,
    p_colegio: texto('colegio') || undefined,
    p_grado: texto('grado') || undefined,
    p_carrera: texto('carrera') || undefined,
    p_ubigeo: texto('ubigeo') || undefined,
    p_respuestas: respuestasDe(formData),
  })
  // Los mensajes de la base ya están escritos para el alumno ("Escribe tu DNI (8 dígitos)", etc.)
  if (error) return { error: error.message || 'No pudimos registrarte. Intenta de nuevo.' }

  const r = data as { actividad?: string; whatsapp?: string | null; ref?: string }
  const nombre = texto('nombre').split(/\s+/)[0]
  const dni = texto('dni').replace(/\D/g, '')
  const tema = temaDeInteres(texto('carrera'))
  // Con DNI, el mensaje lo incluye (une al alumno aunque escriba desde otro celular); sin DNI, lo identifica su celular.
  // "Ref." une el chat al registro cuando WhatsApp oculta el número del alumno (contactos con privacidad @lid).
  const mensaje = `Hola, soy ${nombre}${dni ? ` (DNI ${dni})` : ''}. Me registré en ${r.actividad ?? 'la feria de la Universidad Peruana Unión'} y quiero información ${tema.startsWith('el ') ? 'del ' + tema.slice(3) : 'de ' + tema}.${r.ref ? ` (Ref. ${r.ref})` : ''}`
  const numero = (r.whatsapp ?? '').replace(/\D/g, '')
  return {
    ok: true,
    nombre,
    tema,
    enlaceWhatsApp: numero ? `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}` : null,
  }
}
