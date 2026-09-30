// =====================================================================
//  Chat del CRM (Supabase Edge Function)
//  El asesor responde al lead desde el panel; el mensaje sale por WhatsApp
//  con el número de Genesys (API de BuilderBot). La API key nunca llega al panel.
//
//  POST /functions/v1/chat   { lead_id, texto }
//  Header: Authorization: Bearer <sesión del usuario del panel>
//
//  Seguridad: la sesión del usuario se valida con Supabase Auth y el lead se lee
//  con SU sesión, así el RLS decide si puede escribirle (asesor: solo sus leads).
// =====================================================================
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../_shared/database.types.ts'
import { enviarWhatsApp } from '../_shared/builderbot.ts'

const URL_SUPABASE = Deno.env.get('SUPABASE_URL')!
const CLAVE_PUBLICA = Deno.env.get('SUPABASE_ANON_KEY')!
const admin = createClient<Database>(URL_SUPABASE, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

const MAX_CARACTERES = 1500
// WhatsApp conectado por QR: limitar ráfagas para no arriesgar un bloqueo del número
const MAX_MENSAJES_POR_MINUTO = 20

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function responder(datos: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(datos), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return responder({ ok: false, error: 'Método no permitido' }, 405)

  // 1. Sesión del usuario del panel
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const usuario = createClient<Database>(URL_SUPABASE, CLAVE_PUBLICA, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user } } = await usuario.auth.getUser(token)
  if (!user) return responder({ ok: false, error: 'Sesión no válida. Vuelve a iniciar sesión.' }, 401)

  // 2. Datos del mensaje
  let cuerpo: { lead_id?: unknown; texto?: unknown }
  try {
    cuerpo = await req.json()
  } catch {
    return responder({ ok: false, error: 'Cuerpo JSON no válido' }, 400)
  }
  const leadId = typeof cuerpo.lead_id === 'string' ? cuerpo.lead_id : ''
  const texto = typeof cuerpo.texto === 'string' ? cuerpo.texto.trim() : ''
  if (!/^[0-9a-f-]{36}$/i.test(leadId)) return responder({ ok: false, error: 'Lead no válido' }, 400)
  if (!texto) return responder({ ok: false, error: 'Escribe un mensaje' }, 400)
  if (texto.length > MAX_CARACTERES) {
    return responder({ ok: false, error: `El mensaje es muy largo (máximo ${MAX_CARACTERES} caracteres)` }, 400)
  }

  // 3. Permisos: el lead se busca con la sesión del usuario (RLS)
  const [{ data: lead }, { data: yo }] = await Promise.all([
    usuario.from('leads').select('id, telefono, estado').eq('id', leadId).maybeSingle(),
    usuario.from('asesores').select('id, nombre').eq('user_id', user.id).maybeSingle(),
  ])
  if (!yo) return responder({ ok: false, error: 'Tu usuario no está vinculado a un asesor' }, 403)
  if (!lead) return responder({ ok: false, error: 'No tienes acceso a este lead' }, 403)

  // 4. Límite de envío por asesor
  const { count } = await admin.from('lead_interacciones')
    .select('id', { count: 'exact', head: true })
    .eq('tipo', 'mensaje_asesor').eq('autor_id', yo.id)
    .gte('created_at', new Date(Date.now() - 60_000).toISOString())
  if ((count ?? 0) >= MAX_MENSAJES_POR_MINUTO) {
    return responder({ ok: false, error: 'Estás enviando demasiados mensajes seguidos. Espera un minuto.' }, 429)
  }

  // 5. Envío por WhatsApp, firmado con el nombre del asesor
  const primerNombre = yo.nombre.split(' ')[0]
  const envio = await enviarWhatsApp(lead.telefono, `*${primerNombre}:* ${texto}`)

  const { data: mensaje, error } = await admin.from('lead_interacciones').insert({
    lead_id: lead.id,
    tipo: 'mensaje_asesor',
    contenido: texto,
    autor_id: yo.id,
    estado_envio: envio.ok ? 'enviado' : 'error',
    error_envio: envio.ok ? null : envio.error?.slice(0, 300) ?? 'Error desconocido',
  }).select('*').single()
  if (error) console.error('[chat] No se pudo guardar el mensaje:', error.message)

  // 6. Primer mensaje a un lead asignado: pasa a "contactado" (con la sesión del asesor,
  //    así el cambio queda firmado en el historial)
  if (envio.ok && lead.estado === 'lead_asignado') {
    await usuario.from('leads').update({ estado: 'lead_contactado' }).eq('id', lead.id)
  }

  if (!envio.ok) {
    console.error('[chat] Error enviando WhatsApp:', envio.error)
    return responder({ ok: false, error: 'WhatsApp no aceptó el mensaje. Intenta de nuevo.', mensaje }, 502)
  }
  return responder({ ok: true, mensaje })
})
