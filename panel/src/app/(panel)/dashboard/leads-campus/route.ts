// Descarga en Excel los leads que eligieron un campus (Juliaca, Lima o Tarapoto), por fecha de registro.
// Todos los datos del lead y, en columnas aparte, sus respuestas al formulario del QR.
// Solo con "Dashboard de todo el equipo" y "Exportar": los leads de Lima y Tarapoto no tienen asesor.
import ExcelJS from 'exceljs'
import { ETIQUETAS_ESTADO, ETIQUETAS_FUENTE, type Fuente, type LeadEstado } from '@crm/db'
import { CAMPUS, campusDe, type Campus } from '@/lib/campus'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'
import { hoyLima } from '@/lib/texto'
import { textoProcedencia } from '@/lib/ubigeos'
import { UBIGEOS } from '@/lib/ubigeos-servidor'

const FECHA = /^\d{4}-\d{2}-\d{2}$/
const AZUL = 'FF003865'
const LOTE = 1000
const MAXIMO = 20_000

interface Respuesta { id: string; pregunta: string; respuesta: string }

const fechaLima = (valor: string | null) => (valor ? new Date(new Date(valor).getTime() - 5 * 3_600_000) : null)

export async function GET(request: Request) {
  const { puede } = await exigirPermiso('dashboard')
  if (!puede('dashboard_todos') || !puede('exportar')) return new Response('No tienes permiso para descargar los leads por campus', { status: 403 })
  const sp = new URL(request.url).searchParams
  const desde = FECHA.test(sp.get('desde') ?? '') ? sp.get('desde')! : ''
  const hasta = FECHA.test(sp.get('hasta') ?? '') ? sp.get('hasta')! : ''
  const campus = CAMPUS.includes(sp.get('campus') as Campus) ? (sp.get('campus') as Campus) : null

  const supabase = await crearClienteServidor()
  const leads = []
  for (let i = 0; i < MAXIMO; i += LOTE) {
    let consulta = supabase.from('leads')
      .select('id, sede, nombre, telefono, dni, programa, carrera_interes, modalidad, resumen, convocatoria, estado, origen, origen_campana, canal_entrada, colegio, grado, pais, ubigeo, motivo_no_interes, puntaje, created_at, fecha_asignado, primer_contacto_asesor_at, ultimo_mensaje_lead_at, ultimo_mensaje_texto, total_mensajes, reconsultas, actividad:actividades(nombre), asesor:asesores!leads_asesor_id_fkey(nombre)')
      .not('sede', 'is', null).is('eliminado_at', null)
    if (desde) consulta = consulta.gte('created_at', `${desde}T00:00:00-05:00`)
    if (hasta) consulta = consulta.lte('created_at', `${hasta}T23:59:59.999-05:00`)
    const { data, error } = await consulta.order('created_at', { ascending: false }).range(i, i + LOTE - 1)
    if (error) return new Response(`No se pudo descargar: ${error.message}`, { status: 500 })
    leads.push(...data.filter((l) => campusDe(l.sede) && (!campus || campusDe(l.sede) === campus)))
    if (data.length < LOTE) break
  }

  // Respuestas al formulario del QR (inscripción completa): una columna por pregunta
  const respuestas = new Map<string, Map<string, string>>()
  const preguntas: string[] = []
  for (let i = 0; i < leads.length; i += 200) {
    const { data } = await supabase.from('actividad_respuestas').select('lead_id, respuestas').in('lead_id', leads.slice(i, i + 200).map((l) => l.id)).order('updated_at')
    for (const f of data ?? []) {
      const delLead = respuestas.get(f.lead_id) ?? new Map<string, string>()
      for (const r of f.respuestas as unknown as Respuesta[]) {
        if (!preguntas.includes(r.pregunta)) preguntas.push(r.pregunta)
        delLead.set(r.pregunta, r.respuesta)
      }
      respuestas.set(f.lead_id, delLead)
    }
  }

  const columnas: { titulo: string; ancho: number; formato?: string }[] = [
    { titulo: 'Campus', ancho: 11 }, { titulo: 'Registrado', ancho: 17, formato: 'dd/mm/yyyy hh:mm' }, { titulo: 'Nombre', ancho: 32 },
    { titulo: 'Celular', ancho: 14 }, { titulo: 'DNI', ancho: 10 }, { titulo: 'Programa', ancho: 10 }, { titulo: 'Carrera', ancho: 36 },
    { titulo: 'Modalidad', ancho: 12 }, { titulo: 'Convocatoria', ancho: 14 }, { titulo: 'Estado', ancho: 16 }, { titulo: 'Asesor', ancho: 24 },
    { titulo: 'Colegio', ancho: 30 }, { titulo: 'Grado', ancho: 12 }, { titulo: 'Procedencia', ancho: 30 },
    { titulo: 'Fuente', ancho: 16 }, { titulo: 'Nos conoció por', ancho: 18 }, { titulo: 'Llegó por', ancho: 16 }, { titulo: 'Actividad (QR)', ancho: 24 },
    { titulo: 'Consulta', ancho: 40 }, { titulo: 'Último mensaje del alumno', ancho: 40 }, { titulo: 'Fecha último mensaje', ancho: 17, formato: 'dd/mm/yyyy hh:mm' },
    { titulo: 'Asignado', ancho: 17, formato: 'dd/mm/yyyy hh:mm' }, { titulo: 'Primer contacto del asesor', ancho: 17, formato: 'dd/mm/yyyy hh:mm' },
    { titulo: 'Motivo de pérdida', ancho: 20 }, { titulo: 'Puntaje', ancho: 9 }, { titulo: 'Mensajes al bot', ancho: 10 }, { titulo: 'Veces que volvió a consultar', ancho: 12 },
    ...preguntas.map((p) => ({ titulo: p, ancho: 24 })),
  ]

  const libro = new ExcelJS.Workbook()
  libro.creator = 'CRM Admisión UPeU Juliaca'
  libro.created = new Date()
  const h = libro.addWorksheet(campus ? `Leads ${campus}` : 'Leads por campus', { views: [{ state: 'frozen', ySplit: 1 }] })
  h.columns = columnas.map((c) => ({ header: c.titulo, width: c.ancho, style: c.formato ? { numFmt: c.formato } : {} }))
  const cab = h.getRow(1)
  cab.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }
  cab.alignment = { vertical: 'middle', wrapText: true }
  cab.height = 30
  for (const l of leads) {
    const r = respuestas.get(l.id)
    h.addRow([
      campusDe(l.sede), fechaLima(l.created_at), l.nombre, l.telefono, l.dni, l.programa === 'cepre' ? 'CePre' : 'Pregrado', l.carrera_interes,
      l.modalidad, l.convocatoria, ETIQUETAS_ESTADO[l.estado as LeadEstado] ?? l.estado, l.asesor?.nombre ?? 'Sin asesor',
      l.colegio, l.grado, textoProcedencia(l, UBIGEOS),
      ETIQUETAS_FUENTE[l.origen as Fuente] ?? l.origen, l.origen_campana, l.canal_entrada, l.actividad?.nombre,
      l.resumen, l.ultimo_mensaje_texto, fechaLima(l.ultimo_mensaje_lead_at),
      fechaLima(l.fecha_asignado), fechaLima(l.primer_contacto_asesor_at),
      l.motivo_no_interes, l.puntaje, l.total_mensajes, l.reconsultas,
      ...preguntas.map((p) => r?.get(p) ?? null),
    ])
  }
  if (leads.length) h.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } }

  const archivo = await libro.xlsx.writeBuffer()
  const nombre = `leads-${campus?.toLowerCase() ?? 'todos-los-campus'}-${desde || 'inicio'}-a-${hasta || hoyLima()}.xlsx`
  return new Response(archivo as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nombre}"`,
      'Cache-Control': 'no-store',
    },
  })
}
