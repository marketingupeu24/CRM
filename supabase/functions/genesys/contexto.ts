// Genesys · Lo que el CRM sabe del alumno, para la memoria de Genesys (paso HTTP de BuilderBot).
import { botAtiendeLead, proximaAtencion, textoProximaAtencion } from '../_shared/dominio.ts'
import { type Lead, type Respuesta, supabase, fechaCorta, fechaYHorario, FERIADOS } from './comun.ts'

/** Solo lectura: contexto del alumno y si el bot debe responder, sin guardar nada. */
export async function contextoSinRegistrar(telefono: string): Promise<Respuesta> {
  const { data: leadId } = await supabase.rpc('lead_de_contacto', { p_contacto: telefono })
  const { data: lead } = leadId ? await supabase.from('leads').select('*').eq('id', leadId as string).maybeSingle() : { data: null }
  const apertura = proximaAtencion(new Date(), FERIADOS)
  if (!lead) {
    return { ok: true, registrado: false, bot_atiende: true, nombre: '', contexto: `Alumno nuevo: todavía no ha dado sus datos. ${fechaYHorario()}`, fuera_de_horario: !!apertura }
  }
  return {
    ok: true,
    lead_id: lead.id,
    registrado: leadRegistrado(lead),
    bot_atiende: botAtiendeLead(lead.estado, lead.bot_pausado_hasta),
    nombre: lead.nombre ?? '',
    contexto: `${await contextoDelAlumno(lead)} ${fechaYHorario()}`,
    fuera_de_horario: !!apertura,
    proxima_atencion: apertura ? textoProximaAtencion(apertura) : '',
  }
}

/** Ya dejó sus datos (con Genesys, QR, formulario o un asesor): no hay que volver a pedírselos. */
export function leadRegistrado(lead: Lead): boolean {
  return !!lead.asesor_id || !!lead.fecha_interesado || (!!lead.nombre && (!!lead.dni || !!lead.carrera_interes))
}

/**
 * Resumen en texto del alumno para el prompt de Genesys ("CONTEXTO DEL ALUMNO").
 * Así, si escribe otro día, Genesys sabe quién es y no le vuelve a pedir nombre, documento ni carrera.
 */
export async function contextoDelAlumno(lead: Lead): Promise<string> {
  if (!leadRegistrado(lead) && !lead.nombre) return 'Alumno nuevo: todavía no ha dado sus datos.'
  let asesor: string | null = null
  if (lead.asesor_id) {
    const { data } = await supabase.from('asesores')
      .select('nombre, ausencia_activa, ausente_hasta, ausente_reemplazo')
      .eq('id', lead.asesor_id).maybeSingle()
    const corto = (n?: string | null) => n?.trim().split(/\s+/).slice(0, 2).join(' ') ?? null
    asesor = corto(data?.nombre)
    // Ausente (viaje, permiso): Genesys avisa hasta cuándo y quién lo atiende mientras tanto
    if (asesor && data?.ausencia_activa) {
      const { data: cubre } = data.ausente_reemplazo
        ? await supabase.from('asesores').select('nombre').eq('id', data.ausente_reemplazo).maybeSingle()
        : { data: null }
      const reemplazo = corto(cubre?.nombre)
      asesor += ` (ausente hasta el ${fechaCorta(data.ausente_hasta)}; ${reemplazo ? `mientras tanto lo atiende ${reemplazo}` : 'mientras tanto responde el equipo de Admisión de la Universidad Peruana Unión'})`
    }
  }
  const interes = lead.programa === 'cepre' ? `CEPRE${lead.modalidad ? ` ${lead.modalidad}` : ''}` : lead.carrera_interes
  const datos = [
    lead.nombre && `Nombre: ${lead.nombre}`,
    lead.dni && `Documento: ${lead.dni}`,
    interes && `Interés: ${interes}`,
    lead.colegio && `Colegio: ${lead.colegio}`,
    asesor && `Su asesor(a): ${asesor}`,
  ].filter(Boolean).join(' · ')
  if (!leadRegistrado(lead)) return `Datos que ya dio: ${datos}. Aún no está registrado: pide solo lo que falte.`
  return `YA REGISTRADO (no le vuelvas a pedir sus datos ni lo registres otra vez): ${datos}.`
}
