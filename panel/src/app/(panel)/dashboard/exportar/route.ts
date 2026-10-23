// Descarga el Dashboard en Excel (.xlsx), con los mismos filtros de la página (fechas, convocatoria, asesor).
// Una hoja por sección, con encabezados fijos, filtros de Excel, porcentajes y totales.
// Usa la sesión del usuario: sin "Dashboard de todo el equipo" solo salen sus propios leads.
import ExcelJS from 'exceljs'
import { ETIQUETAS_ESTADO, type LeadEstado } from '@crm/db'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'
import { hoyLima } from '@/lib/texto'

const FECHA = /^\d{4}-\d{2}-\d{2}$/
const AZUL = 'FF003865'
const GRIS = 'FFF1F5F9'

interface Resumen {
  total: number; interesados: number; asignados: number; contactados: number; matriculados: number
  no_interesados: number; perdidos: number; primera_respuesta_min: number | null
  contactados_a_tiempo: number; con_primer_contacto: number; sin_contactar_2h: number; reasignados?: number
  por_estado: { estado: LeadEstado; total: number }[]
  por_carrera: { carrera: string; total: number; interesados: number; matriculados: number }[]
  por_asesor: { asesor: string; activo: boolean; total: number; sin_contactar: number; contactados: number; inscritos: number; matriculados: number; perdidos: number; primera_respuesta_min: number | null; sin_contactar_2h: number }[]
  por_periodo: { periodo: string; total: number }[]
  por_motivo: { motivo: string; total: number }[]
  por_origen?: { origen: string; total: number; matriculados: number }[]
  unidad_periodo: 'dia' | 'semana'
  desde: string; hasta: string
}
interface FilaEmbudo { grupo: string; escribieron: number; registrados: number; contactados: number; inscritos: number; matriculados: number }

const div = (a: number, b: number) => (b ? a / b : 0)
const fechaDMY = (iso: string) => (FECHA.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso)

/** Hoja con tabla: encabezado azul fijo, filtros de Excel, anchos y formatos por columna. */
function hoja(libro: ExcelJS.Workbook, nombre: string, columnas: { titulo: string; ancho: number; formato?: string }[], filas: (string | number | Date | null)[][], total?: (string | number | Date | null)[]) {
  const h = libro.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 1 }] })
  h.columns = columnas.map((c) => ({ header: c.titulo, width: c.ancho, style: c.formato ? { numFmt: c.formato } : {} }))
  const cab = h.getRow(1)
  cab.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }
  cab.alignment = { vertical: 'middle', wrapText: true }
  cab.height = 30
  for (const f of filas) h.addRow(f)
  if (filas.length) h.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } }
  if (total && filas.length) {
    const fila = h.addRow(total)
    fila.font = { bold: true }
    fila.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } }
  }
  return h
}

export async function GET(request: Request) {
  const { puede, perfil } = await exigirPermiso('dashboard')
  const esAdmin = puede('dashboard_todos')
  const sp = new URL(request.url).searchParams
  const desde = FECHA.test(sp.get('desde') ?? '') ? sp.get('desde')! : ''
  const hasta = FECHA.test(sp.get('hasta') ?? '') ? sp.get('hasta')! : ''
  const convocatoria = sp.get('convocatoria')?.trim() ?? ''
  const asesorId = esAdmin && /^[0-9a-f-]{36}$/i.test(sp.get('asesor') ?? '') ? sp.get('asesor')! : ''

  const supabase = await crearClienteServidor()
  const filtros = { p_desde: desde || undefined, p_hasta: hasta || undefined, p_convocatoria: convocatoria || undefined, p_asesor_id: asesorId || undefined }
  const [{ data, error }, { data: porOrigen }, { data: porCanal }, { data: asesor }] = await Promise.all([
    supabase.rpc('resumen_dashboard', filtros),
    supabase.rpc('embudo_por_origen', { ...filtros, p_por: 'origen' }),
    supabase.rpc('embudo_por_origen', { ...filtros, p_por: 'canal' }),
    asesorId ? supabase.from('asesores').select('nombre').eq('id', asesorId).maybeSingle() : Promise.resolve({ data: null }),
  ])
  if (error || !data) return new Response(`No se pudo generar el Excel: ${error?.message ?? 'sin datos'}`, { status: 500 })
  const r = data as unknown as Resumen

  const libro = new ExcelJS.Workbook()
  libro.creator = 'CRM Admisión UPeU Juliaca'
  libro.created = new Date()

  // 1. Resumen: filtros aplicados e indicadores
  const generado = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' }).format(new Date())
  const res = libro.addWorksheet('Resumen', { views: [{ showGridLines: false }] })
  res.columns = [{ width: 38 }, { width: 18 }, { width: 46 }]
  res.addRow(['Dashboard · CRM Admisión UPeU Juliaca']).font = { bold: true, size: 14, color: { argb: AZUL } }
  res.addRow([`Generado el ${generado} por ${perfil.nombre}`]).font = { italic: true, color: { argb: 'FF64748B' } }
  res.addRow([])
  const filtro = (etiqueta: string, valor: string) => { const f = res.addRow([etiqueta, valor]); f.getCell(1).font = { bold: true } }
  filtro('Periodo', desde || hasta ? `del ${fechaDMY(desde || r.desde)} al ${fechaDMY(hasta || r.hasta)}` : 'Todo el periodo')
  filtro('Convocatoria', convocatoria || 'Todas')
  filtro('Asesor', asesor?.nombre ?? (esAdmin ? 'Todo el equipo' : `Solo mis leads (${perfil.nombre})`))
  res.addRow([])
  const cab = res.addRow(['Indicador', 'Valor', 'Detalle'])
  cab.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }
  const ind = (nombre: string, valor: number | string | null, detalle = '', formato?: string) => {
    const f = res.addRow([nombre, valor ?? '—', detalle])
    if (formato) f.getCell(2).numFmt = formato
    f.getCell(2).alignment = { horizontal: 'right' }
  }
  ind('Total de leads', r.total, `${r.no_interesados} no interesados`, '#,##0')
  ind('Leads interesados', r.interesados, 'del total', '#,##0')
  ind('% interesados', div(r.interesados, r.total), 'interesados / total', '0.0%')
  ind('Asignados a un asesor', r.asignados, '', '#,##0')
  ind('Contactados', r.contactados, 'contactado, atendido, inscrito o matriculado', '#,##0')
  ind('Matriculados', r.matriculados, '', '#,##0')
  ind('% matrícula (de los interesados)', div(r.matriculados, r.interesados), 'matriculados / interesados', '0.0%')
  ind('Conversión global', div(r.matriculados, r.total), 'lead → matriculado', '0.0%')
  ind('Primera respuesta (mediana, minutos)', r.primera_respuesta_min, 'desde la asignación hasta el primer contacto', '0.0')
  ind('Contactados en menos de 2 h', div(r.contactados_a_tiempo, r.con_primer_contacto), `${r.contactados_a_tiempo} de ${r.con_primer_contacto}`, '0.0%')
  ind('Sin contactar hace más de 2 h', r.sin_contactar_2h, 'asignados que nadie contactó', '#,##0')
  ind('Reasignados por no contactar a tiempo', r.reasignados ?? 0, '', '#,##0')
  ind('No interesados', r.no_interesados, '', '#,##0')
  ind('Perdidos', r.perdidos, '', '#,##0')

  // 2. Por estado
  hoja(libro, 'Por estado', [{ titulo: 'Estado', ancho: 22 }, { titulo: 'Leads', ancho: 10, formato: '#,##0' }, { titulo: '% del total', ancho: 12, formato: '0.0%' }],
    r.por_estado.map((e) => [ETIQUETAS_ESTADO[e.estado] ?? e.estado, e.total, div(e.total, r.total)]),
    ['Total', r.total, 1])

  // 3. Por carrera (todas, no solo las 10 del gráfico)
  hoja(libro, 'Por carrera', [
    { titulo: 'Carrera', ancho: 50 }, { titulo: 'Leads', ancho: 10, formato: '#,##0' }, { titulo: 'Interesados', ancho: 12, formato: '#,##0' },
    { titulo: 'Matriculados', ancho: 13, formato: '#,##0' }, { titulo: '% matrícula', ancho: 12, formato: '0.0%' }, { titulo: '% del total', ancho: 12, formato: '0.0%' },
  ], r.por_carrera.map((c) => [c.carrera, c.total, c.interesados, c.matriculados, div(c.matriculados, c.total), div(c.total, r.total)]),
  ['Total', r.total, r.interesados, r.matriculados, div(r.matriculados, r.total), 1])

  // 4. Por asesor
  const sumar = (k: keyof Resumen['por_asesor'][number]) => r.por_asesor.reduce((s, a) => s + (Number(a[k]) || 0), 0)
  hoja(libro, 'Por asesor', [
    { titulo: 'Asesor', ancho: 32 }, { titulo: 'Activo', ancho: 8 }, { titulo: 'Leads', ancho: 9, formato: '#,##0' },
    { titulo: 'Sin contactar', ancho: 12, formato: '#,##0' }, { titulo: 'Contactados', ancho: 12, formato: '#,##0' }, { titulo: 'Inscritos', ancho: 10, formato: '#,##0' },
    { titulo: 'Matriculados', ancho: 13, formato: '#,##0' }, { titulo: 'Perdidos / no interesados', ancho: 14, formato: '#,##0' },
    { titulo: '% matrícula', ancho: 11, formato: '0.0%' }, { titulo: 'Primera respuesta (min, mediana)', ancho: 16, formato: '0.0' },
    { titulo: 'Sin contactar > 2 h', ancho: 12, formato: '#,##0' },
  ], r.por_asesor.map((a) => [a.asesor, a.activo ? 'Sí' : 'No', a.total, a.sin_contactar, a.contactados, a.inscritos, a.matriculados, a.perdidos,
    div(a.matriculados, a.total), a.primera_respuesta_min, a.sin_contactar_2h]),
  ['Total', '', sumar('total'), sumar('sin_contactar'), sumar('contactados'), sumar('inscritos'), sumar('matriculados'), sumar('perdidos'),
    div(sumar('matriculados'), sumar('total')), r.primera_respuesta_min, sumar('sin_contactar_2h')])

  // 5 y 6. Embudo por origen ("Nos conoció por") y por canal de entrada
  const embudo = (nombre: string, titulo: string, filas: FilaEmbudo[] | null) => {
    const f = filas ?? []
    const t = (k: keyof FilaEmbudo) => f.reduce((s, x) => s + (Number(x[k]) || 0), 0)
    hoja(libro, nombre, [
      { titulo, ancho: 34 }, { titulo: 'Escribieron', ancho: 12, formato: '#,##0' }, { titulo: 'Registrados', ancho: 12, formato: '#,##0' },
      { titulo: 'Contactados', ancho: 12, formato: '#,##0' }, { titulo: 'Inscritos', ancho: 10, formato: '#,##0' }, { titulo: 'Matriculados', ancho: 13, formato: '#,##0' },
      { titulo: '% registro', ancho: 11, formato: '0.0%' }, { titulo: '% matrícula', ancho: 11, formato: '0.0%' },
    ], f.map((x) => [x.grupo, x.escribieron, x.registrados, x.contactados, x.inscritos, x.matriculados, div(x.registrados, x.escribieron), div(x.matriculados, x.escribieron)]),
    ['Total', t('escribieron'), t('registrados'), t('contactados'), t('inscritos'), t('matriculados'), div(t('registrados'), t('escribieron')), div(t('matriculados'), t('escribieron'))])
  }
  embudo('Embudo por origen', 'Nos conoció por', porOrigen as FilaEmbudo[] | null)
  embudo('Embudo por canal', 'Llegó por', porCanal as FilaEmbudo[] | null)

  // 7. Leads por día o semana
  hoja(libro, r.unidad_periodo === 'semana' ? 'Por semana' : 'Por día',
    [{ titulo: r.unidad_periodo === 'semana' ? 'Semana (desde el lunes)' : 'Día', ancho: 22, formato: 'dd/mm/yyyy' }, { titulo: 'Leads nuevos', ancho: 13, formato: '#,##0' }],
    r.por_periodo.map((p) => [new Date(`${p.periodo}T12:00:00Z`), p.total]),
    ['Total', r.por_periodo.reduce((s, p) => s + p.total, 0)])

  // 8. Motivos de pérdida
  hoja(libro, 'Motivos de pérdida', [{ titulo: 'Motivo', ancho: 40 }, { titulo: 'Leads', ancho: 10, formato: '#,##0' }, { titulo: '%', ancho: 10, formato: '0.0%' }],
    r.por_motivo.map((m) => [m.motivo, m.total, div(m.total, r.por_motivo.reduce((s, x) => s + x.total, 0))]),
    ['Total', r.por_motivo.reduce((s, x) => s + x.total, 0), 1])

  const archivo = await libro.xlsx.writeBuffer()
  const nombre = `dashboard-${desde || 'inicio'}-a-${hasta || hoyLima()}.xlsx`
  return new Response(archivo as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nombre}"`,
      'Cache-Control': 'no-store',
    },
  })
}
