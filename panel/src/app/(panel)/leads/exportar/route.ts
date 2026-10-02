// Exporta la lista de leads filtrada a un archivo que Excel abre directamente (CSV).
// Usa la sesión del usuario: el RLS limita las filas (el asesor solo exporta sus leads).
// Aplica los mismos filtros que la página /leads.
import { ESTADOS_LEAD, ETIQUETAS_ESTADO, ETIQUETAS_FUENTE, type Fuente, type LeadEstado } from '@crm/db'
import { rangoMes } from '@/lib/periodos'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'

const LOTE = 1000          // la API devuelve máximo 1000 filas por consulta
const MAXIMO = 20_000

function fechaLima(valor: string | null): string {
  if (!valor) return ''
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(valor))
}

/** Celda CSV: entre comillas si tiene separador, comillas o saltos de línea. */
function celda(valor: unknown): string {
  const texto = valor === null || valor === undefined ? '' : String(valor)
  return /[";\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

export async function GET(request: Request) {
  const { esAdmin } = await exigirPermiso('exportar')
  const supabase = await crearClienteServidor()
  const sp = new URL(request.url).searchParams
  const mes = rangoMes(sp.get('mes')?.trim() ?? '')
  const f = (k: string) => (mes && (k === 'desde' || k === 'hasta') ? mes[k] : sp.get(k)?.trim() ?? '')
  const { data: campana } = /^\d+$/.test(f('campana'))
    ? await supabase.from('campanas').select('nombre, origen, inicio, fin').eq('id', Number(f('campana'))).maybeSingle()
    : { data: null }

  const filas: Record<string, unknown>[] = []
  for (let desde = 0; desde < MAXIMO; desde += LOTE) {
    let consulta = supabase
      .from('leads')
      .select('nombre, telefono, dni, programa, carrera_interes, modalidad, resumen, convocatoria, estado, origen, origen_campana, reasignaciones, motivo_no_interes, created_at, ultimo_contacto, fecha_asignado, primer_contacto_asesor_at, reconsultas, total_mensajes, asesor:asesores!leads_asesor_id_fkey(nombre)')

    if (f('q')) {
      const q = f('q').replace(/[,()*%\\]/g, ' ').trim()
      if (q) consulta = consulta.or(`nombre.ilike.*${q}*,telefono.ilike.*${q}*,dni.ilike.*${q}*`)
    }
    if (ESTADOS_LEAD.includes(f('estado') as LeadEstado)) consulta = consulta.eq('estado', f('estado') as LeadEstado)
    if (f('carrera') === 'Sin carrera') consulta = consulta.is('carrera_interes', null)
    else if (f('carrera')) consulta = consulta.eq('carrera_interes', f('carrera'))
    if (f('convocatoria')) consulta = consulta.eq('convocatoria', f('convocatoria'))
    if (esAdmin && f('asesor') === 'sin_asesor') consulta = consulta.is('asesor_id', null)
    else if (esAdmin && f('asesor')) consulta = consulta.eq('asesor_id', f('asesor'))
    if (f('origen') === 'Sin dato') consulta = consulta.is('origen_campana', null)
    else if (f('origen')) consulta = consulta.eq('origen_campana', f('origen'))
    if (campana) {
      consulta = consulta.gte('created_at', `${campana.inicio}T00:00:00-05:00`).lte('created_at', `${campana.fin}T23:59:59.999-05:00`)
      if (campana.origen) consulta = consulta.eq('origen_campana', campana.origen)
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(f('desde'))) consulta = consulta.gte('created_at', `${f('desde')}T00:00:00-05:00`)
    if (/^\d{4}-\d{2}-\d{2}$/.test(f('hasta'))) consulta = consulta.lte('created_at', `${f('hasta')}T23:59:59.999-05:00`)

    const { data, error } = await consulta.order('ultimo_contacto', { ascending: false }).range(desde, desde + LOTE - 1)
    if (error) return new Response(`No se pudo exportar: ${error.message}`, { status: 500 })
    filas.push(...data)
    if (data.length < LOTE) break
  }

  const encabezados = [
    'Nombre', 'Celular', 'DNI', 'Programa', 'Carrera', 'Modalidad', 'Consulta', 'Convocatoria', 'Estado',
    'Asesor', 'Fuente', 'Nos conoció por', 'Motivo de pérdida', 'Registrado', 'Último contacto', 'Asignado', 'Primer contacto del asesor',
    'Veces que volvió a consultar', 'Mensajes al bot', 'Reasignaciones automáticas',
  ]
  const lineas = filas.map((l) => {
    const lead = l as {
      nombre: string | null; telefono: string; dni: string | null; programa: string; carrera_interes: string | null
      modalidad: string | null; resumen: string | null; convocatoria: string | null; estado: LeadEstado; origen: string
      origen_campana: string | null; reasignaciones: number
      motivo_no_interes: string | null; created_at: string; ultimo_contacto: string; fecha_asignado: string | null
      primer_contacto_asesor_at: string | null; reconsultas: number; total_mensajes: number; asesor: { nombre: string } | null
    }
    return [
      lead.nombre, lead.telefono, lead.dni, lead.programa === 'cepre' ? 'CePre' : 'Pregrado', lead.carrera_interes,
      lead.modalidad, lead.resumen, lead.convocatoria, ETIQUETAS_ESTADO[lead.estado] ?? lead.estado,
      lead.asesor?.nombre, ETIQUETAS_FUENTE[lead.origen as Fuente] ?? lead.origen, lead.origen_campana, lead.motivo_no_interes,
      fechaLima(lead.created_at), fechaLima(lead.ultimo_contacto), fechaLima(lead.fecha_asignado),
      fechaLima(lead.primer_contacto_asesor_at), lead.reconsultas, lead.total_mensajes, lead.reasignaciones,
    ].map(celda).join(';')
  })

  // BOM para que Excel reconozca tildes; ";" es el separador que usa Excel en español
  const csv = '﻿' + [encabezados.join(';'), ...lineas].join('\r\n')
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())
  // El nombre del archivo dice qué periodo o campaña contiene
  const sufijo = campana
    ? campana.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()
    : f('desde') || f('hasta') ? `${f('desde') || 'inicio'}_a_${f('hasta') || hoy}` : hoy
  const nombreArchivo = `leads-crm-${sufijo || hoy}`
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nombreArchivo}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
