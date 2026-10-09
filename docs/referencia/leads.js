// =====================================================================
//  leads.js - Conexión del bot Genesys (BuilderBot) con Supabase
//  Instalar: npm i @supabase/supabase-js
//  .env: SUPABASE_URL=...  SUPABASE_SERVICE_KEY=...  (service_role, solo en el servidor)
// =====================================================================
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

// Registra el lead cada vez que escribe (lo crea si es nuevo) y guarda su mensaje
export async function registrarLead(telefono, mensaje) {
  const { data: lead, error } = await supabase.rpc('registrar_lead', {
    p_telefono: telefono,
    p_mensaje: mensaje ?? null,
  })
  if (error) console.error('[leads] Error registrando lead:', error.message)
  return lead
}

// Actualiza datos del lead (nombre, carrera, modalidad, estado, etc.)
export async function actualizarLead(telefono, campos) {
  const { data: lead, error } = await supabase
    .from('leads')
    .update(campos)
    .eq('telefono', telefono)
    .select()
    .single()
  if (error) console.error('[leads] Error actualizando lead:', error.message)
  return lead
}

// Guarda la respuesta del bot en el historial del lead
export async function registrarRespuestaBot(leadId, texto) {
  await supabase.from('lead_interacciones').insert({ lead_id: leadId, tipo: 'respuesta_bot', contenido: texto })
}

// El lead no quiere asesor: queda registrado como lead no interesado
export async function marcarLeadNoInteresado(telefono, motivo = null) {
  return actualizarLead(telefono, { estado: 'lead_no_interesado', motivo_no_interes: motivo })
}

// El lead confirmó interés: se marca como lead interesado, se le asigna asesor y se devuelve el asesor
export async function confirmarLeadInteresado(telefono) {
  const lead = await actualizarLead(telefono, { estado: 'lead_interesado' })
  if (!lead) return null

  const { data: asesor, error } = await supabase.rpc('asignar_asesor_lead', { p_lead_id: lead.id })
  if (error) {
    console.error('[leads] Error asignando asesor al lead:', error.message)
    return { lead, asesor: null }
  }
  return { lead, asesor }
}

// Consulta el lead actual (útil para saber si el lead ya fue asignado)
export async function obtenerLead(telefono) {
  const { data } = await supabase.from('leads').select('*').eq('telefono', telefono).maybeSingle()
  return data
}
