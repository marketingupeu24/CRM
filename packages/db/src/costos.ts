// =====================================================================
//  Costos y proformas de Admisión 2027-1 (primer año).
//  Lógica tomada de costos/Proformas_Admision_2027-1.html (tarifario 2027
//  corregido + promociones 2027-1). Mismos redondeos que el original.
//  Sin dependencias: lo usan el panel, las pruebas y el texto para Genesys.
// =====================================================================

export type Modalidad = 'PRES' | 'EAD' | 'SEMI'
export type CampusId = 'LIM' | 'JUL' | 'TAR'
export type BeneficioId = 'PROMO' | 'EXPLORE' | 'B1CA' | 'B2CA' | 'B1IEA' | 'B2IEA' | 'INST' | 'NONE'
export type InstId = 'EGR' | 'DOC' | 'HER' | 'ASO'
export type ExtraId = 'ADV' | 'EGC'
export type FormaPago = 'cuotas' | 'contado'

/** [carrera, créditos del ciclo I, costo del crédito, % de descuento de la promoción, cuotas si difiere del campus] */
type FilaCarrera = readonly [string, number, number, number, number?]

export const MODALIDADES: Record<Modalidad, { label: string; mat?: number; cuotas?: number }> = {
  PRES: { label: 'Presencial' },
  EAD: { label: 'A distancia', mat: 300, cuotas: 5 },
  SEMI: { label: 'Semipresencial', mat: 525, cuotas: 5 },
}

export const CAMPUS: Record<CampusId, { nombre: string; corto: string; mat: number; cuotas: number }> = {
  LIM: { nombre: 'Campus Lima', corto: 'Lima', mat: 700, cuotas: 5 },
  JUL: { nombre: 'Filial Juliaca', corto: 'Juliaca', mat: 600, cuotas: 4 },
  TAR: { nombre: 'Filial Tarapoto', corto: 'Tarapoto', mat: 600, cuotas: 5 },
}

const CARRERAS_MOD: Record<'EAD' | 'SEMI', FilaCarrera[]> = {
  EAD: [
    ['Administración', 19, 150, 0],
    ['Contabilidad, Gestión Tributaria y Aduanera', 20, 150, 0],
    ['Educación Inicial y Puericultura', 21, 140, 0],
    ['Educación, Especialidad Primaria y Pedagogía Terapéutica', 21, 140, 0],
    ['Educación, Especialidad Lingüística e inglés', 21, 140, 0],
  ],
  SEMI: [
    ['Psicología', 20, 180, 0],
    ['Ingeniería Ambiental', 19, 150, 0],
  ],
}

const CARRERAS: Record<CampusId, FilaCarrera[]> = {
  LIM: [
    ['Enfermería', 19, 345, 0],
    ['Medicina Humana', 26, 600, 0],
    ['Nutrición Humana', 22, 345, 0],
    ['Psicología', 20, 345, 0],
    ['Tecnología Médica, Especialidad de Laboratorio clínico y anatomía patológica', 21, 380, 25],
    ['Tecnología Médica, Especialidad de Terapia física y rehabilitación', 21, 380, 25],
    ['Arquitectura y Urbanismo', 21, 345, 0],
    ['Ingeniería Ambiental', 19, 330, 25],
    ['Ingeniería Civil', 21, 345, 0],
    ['Ingeniería Industrias Alimentarias', 21, 330, 25],
    ['Ingeniería Industrial', 19, 320, 25],
    ['Ingeniería de Ciberseguridad', 19, 320, 25],
    ['Ingeniería de Sistemas', 19, 330, 0],
    ['Ingeniería de Software', 19, 320, 25],
    ['Administración', 19, 305, 25],
    ['Contabilidad, Gestión tributaria y aduanera', 20, 300, 25],
    ['Marketing y Negocios Internacionales', 20, 305, 0],
    ['Negocios internacionales y Gestión portuaria', 18, 305, 0],
    ['Ciencias de la comunicación', 20, 325, 25],
    ['Comunicación audiovisual y medios interactivos', 21, 325, 25],
    ['Derecho', 20, 345, 0],
    ['Educación Inicial y Puericultura', 21, 235, 25],
    ['Educación, Especialidad Física, Recreación y Deportes', 20, 235, 25],
    ['Educación, Especialidad Lingüística e inglés', 21, 235, 25],
    ['Educación, Especialidad Musical y Artes visuales', 19, 235, 25],
    ['Educación Primaria y pedagógica terapéutica', 21, 235, 25],
    ['Teología', 18, 320, 0],
  ],
  JUL: [
    ['Enfermería', 19, 210, 0],
    ['Medicina Humana', 26, 600, 0, 5],
    ['Nutrición Humana', 22, 185, 0],
    ['Psicología', 20, 190, 0],
    ['Tecnología Médica, Especialidad de Laboratorio clínico y anatomía patológica', 21, 250, 0, 5],
    ['Tecnología Médica, Especialidad de Terapia física y rehabilitación', 21, 250, 0, 5],
    ['Arquitectura y Urbanismo', 21, 190, 0],
    ['Ingeniería Ambiental', 19, 170, 25],
    ['Ingeniería Civil', 21, 185, 0],
    ['Ingeniería Industrias Alimentarias', 21, 165, 25],
    ['Ingeniería de Sistemas', 19, 170, 0],
    ['Administración', 19, 165, 25],
    ['Contabilidad, Gestión tributaria y aduanera', 20, 165, 25],
    ['Derecho', 20, 205, 0],
    ['Educación Inicial y Puericultura', 21, 155, 0],
    ['Educación, Especialidad Física, Recreación y Deportes', 20, 155, 0],
    ['Educación, Especialidad Lingüística e inglés', 21, 155, 0],
    ['Educación, Especialidad Matemática, Análisis de datos y computación', 21, 155, 0],
    ['Educación Primaria y pedagógica terapéutica', 21, 155, 0],
  ],
  TAR: [
    ['Enfermería', 19, 180, 0],
    ['Psicología', 20, 175, 0],
    ['Arquitectura y Urbanismo', 21, 190, 15],
    ['Ingeniería Ambiental', 19, 170, 25],
    ['Ingeniería Civil', 21, 185, 0],
    ['Ingeniería de Sistemas', 19, 170, 15],
    ['Administración', 19, 165, 25],
    ['Contabilidad, Gestión tributaria y aduanera', 20, 165, 25],
    ['Marketing y Negocios Internacionales', 20, 180, 0],
    ['Derecho', 20, 185, 0],
    ['Educación Inicial y Puericultura', 21, 155, 25],
    ['Educación Primaria y pedagógica terapéutica', 21, 155, 25],
  ],
}

const COND = [
  'Ingresar como estudiante de primer año en el ciclo 2027-1. No aplica a reingresantes.',
  'Matricularse dentro del periodo de la promoción y en la carga académica completa de cada ciclo.',
  'No contar con otra beca o descuento institucional: el beneficio no es acumulable.',
  'Mantener la condición de estudiante regular. El retiro o la reserva de matrícula deja sin efecto el descuento del ciclo en curso y del resto del año.',
]
const COND_REG = [
  'Importes regulares del primer ciclo 2027-1, sin descuento.',
  'La matrícula va aparte y la 1.ª cuota se paga junto con ella.',
  'Los ciclos siguientes se facturan según el tarifario vigente.',
]

export interface Beca { grp: string; label: string; w: string; pct: number; cap: number; vig: string; req: string; resp: string }
export const BECAS: Record<'B1CA' | 'B2CA' | 'B1IEA' | 'B2IEA', Beca> = {
  B1CA: { grp: 'Excelencia académica', label: 'Beca 1er puesto · Centro de Aplicación / Colegio Unión o CAT', w: 'Beca 1er puesto', pct: 100, cap: 5750, vig: 'del 1.er al 5.° año, manteniéndose en el quinto superior', req: 'Carta o resolución brindada por la universidad', resp: 'Finanzas' },
  B2CA: { grp: 'Excelencia académica', label: 'Media beca 2do puesto · Centro de Aplicación / Colegio Unión o CAT', w: 'Media beca', pct: 50, cap: 2875, vig: 'del 1.er al 5.° año, manteniéndose en el quinto superior', req: 'Carta o resolución brindada por la universidad', resp: 'Finanzas' },
  B1IEA: { grp: 'Convenios', label: 'Beca 1er puesto IEA (convenio)', w: 'Beca IEA', pct: 100, cap: 5750, vig: 'el 1.er año, manteniéndose en el quinto superior', req: 'Carta o resolución brindada por la universidad', resp: 'Finanzas' },
  B2IEA: { grp: 'Convenios', label: 'Media beca 2do puesto IEA (convenio)', w: 'Media beca IEA', pct: 50, cap: 2875, vig: 'el 1.er año, manteniéndose en el quinto superior', req: 'Carta o resolución brindada por la universidad', resp: 'Finanzas' },
}

export const INSTITUCIONALES: Record<InstId, { label: string; w: string; pct: number; vig: string; req: string; resp: string }> = {
  EGR: { label: 'Egresado de IE Adventista', w: 'Egresado IEA', pct: 10, vig: 'el 1.er año (ciclos 1 y 2)', req: 'Constancia de haber estudiado 3 años a más en un colegio IEA', resp: 'Finanzas' },
  DOC: { label: 'Hijo de docente de institución adventista', w: 'Hijo docente', pct: 10, vig: 'del 1.er al 5.° año, con promedio ponderado de 14 a más', req: 'Constancia de trabajo del padre (más de 3 años) y constancia de feligresía', resp: 'Finanzas' },
  HER: { label: 'Segundo hermano', w: '2do hermano', pct: 8, vig: 'del 1.er al 5.° año, con promedio ponderado de 14 a más', req: 'Partidas de nacimiento y contrato de estudios del primer hermano', resp: 'Finanzas' },
  ASO: { label: 'Asociado a la promotora', w: 'Asociado', pct: 10, vig: 'del 1.er al 5.° año, con promedio ponderado de 14 a más', req: 'Constancia de feligresía', resp: 'Capellán de la facultad' },
}

export const ADICIONALES_EXPLORE: Record<ExtraId, { label: string; w: string; pct: number; cond: string }> = {
  ADV: { label: 'Estudiante adventista', w: 'Adventista', pct: 10, cond: '10 % adicional por ser estudiante adventista, previa presentación de la constancia de feligresía.' },
  EGC: { label: 'Egresado de colegio adventista', w: 'Colegio adv.', pct: 10, cond: '10 % adicional por haber egresado de un colegio adventista (sea o no parte de la Red Educativa Adventista).' },
}

export const BENEFICIOS: { id: BeneficioId; label: string; grupo?: string }[] = [
  { id: 'PROMO', label: 'Promoción Admisión 2027-I (25 % / 15 %)' },
  { id: 'EXPLORE', label: 'Promoción EXPLORE 2026 · 25 % (requiere DNI registrado)' },
  { id: 'B1CA', label: 'Beca · 1er puesto C. de Aplicación / Colegio Unión o CAT', grupo: 'Excelencia académica' },
  { id: 'B2CA', label: 'Media beca · 2do puesto C. de Aplicación / Colegio Unión o CAT', grupo: 'Excelencia académica' },
  { id: 'B1IEA', label: 'Beca · 1er puesto IEA', grupo: 'Convenios' },
  { id: 'B2IEA', label: 'Media beca · 2do puesto IEA', grupo: 'Convenios' },
  { id: 'INST', label: 'Descuentos institucionales (hasta 2)' },
  { id: 'NONE', label: 'Sin beneficio' },
]

const OTROS_MED: [string, number][] = [['Jornada científica', 80], ['CALIMED', 220]]

/* ---------- redondeos (idénticos al original) ---------- */
const r2 = (x: number) => Math.floor(x * 100 + 0.5 + 1e-9) / 100
const t2 = (x: number) => Math.trunc(x * 100 + 1e-6) / 100

export const soles0 = (n: number) =>
  'S/ ' + (Math.abs(n - Math.round(n)) > 0.001
    ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : n.toLocaleString('en-US', { maximumFractionDigits: 0 }))
export const soles2 = (n: number) => 'S/ ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const fechaLarga = (d: Date) => d.toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Lima' })

/** Carreras de la modalidad/campus (presencial: por campus; a distancia y semipresencial: sede Lima). */
export function carreras(modalidad: Modalidad, campus: CampusId): FilaCarrera[] {
  return modalidad === 'PRES' ? CARRERAS[campus] : CARRERAS_MOD[modalidad]
}

export interface OpcionesProforma {
  modalidad: Modalidad
  campus: CampusId
  carrera: string
  beneficio: BeneficioId
  /** Descuentos institucionales en el orden en que se marcaron (máximo 2). */
  institucionales?: InstId[]
  /** Adicionales de EXPLORE en el orden en que se marcaron. */
  adicionales?: ExtraId[]
  /** El DNI figura en la lista de EXPLORE 2026 (se verifica en el servidor). */
  exploreVerificado?: boolean
  pago: FormaPago
}

export interface Descuento { l: string; w: string; v: number; sub: string }

/** Ajusta las opciones a las reglas: fuera de presencial no hay beneficios y la sede es Lima, etc. */
export function normalizarOpciones(o: OpcionesProforma): OpcionesProforma {
  const r = { ...o, institucionales: [...(o.institucionales ?? [])].slice(0, 2), adicionales: [...(o.adicionales ?? [])] }
  if (r.modalidad !== 'PRES') { r.campus = 'LIM'; r.beneficio = 'NONE' }
  if (r.beneficio === 'EXPLORE' && !r.exploreVerificado) r.beneficio = 'PROMO'
  const lista = carreras(r.modalidad, r.campus)
  if (!lista.some((c) => c[0] === r.carrera)) r.carrera = (lista.find((c) => c[0] === 'Educación Inicial y Puericultura') ?? lista[0]!)[0]
  return r
}

export function calcularProforma(entrada: OpcionesProforma) {
  const o = normalizarOpciones(entrada)
  const L0 = carreras(o.modalidad, o.campus)
  const c = L0.find((x) => x[0] === o.carrera) ?? L0[0]!
  const cp = o.modalidad === 'PRES'
    ? CAMPUS[o.campus]
    : { nombre: 'Sede Lima', corto: 'Lima', mat: MODALIDADES[o.modalidad].mat!, cuotas: MODALIDADES[o.modalidad].cuotas! }
  const [name, cr, costo, pct, cq] = c
  const n = cq || cp.cuotas
  const ens = cr * costo
  const descs: Descuento[] = []
  let bconds: string[] | null = null, pctUsed = 0, beca: Beca | null = null
  const benef = o.beneficio

  if (benef === 'PROMO' && pct) {
    pctUsed = pct
    descs.push({ l: `Descuento ${pct} % en la enseñanza`, w: `Descuento ${pct} %`, v: t2(ens * pct / 100), sub: 'promoción del primer año' })
  } else if (benef in BECAS) {
    const b = BECAS[benef as keyof typeof BECAS]; beca = b
    const cap = (o.modalidad === 'PRES' && o.campus !== 'LIM') ? (b.pct === 100 ? 3000 : 1500) : b.cap
    const v = t2(Math.min(ens * b.pct / 100, cap))
    descs.push({ l: b.label, w: b.w, v, sub: `beca de hasta ${soles0(cap)} en la enseñanza` })
    bconds = [`${b.grp}: ${b.label}. No aplica otro tipo de descuento ni la promoción de Admisión 2027-I.`, `Vigencia: ${b.vig}.`, `Requisito: ${b.req}. Activa: ${b.resp}.`]
    bconds.splice(1, 0, 'Puede acogerse al descuento por pago al contado, que se aplica sobre la diferencia entre la enseñanza y la beca. Si la beca cubre toda la enseñanza, solo paga la matrícula.')
  } else if (benef === 'EXPLORE' && o.exploreVerificado) {
    let rem = ens; const conds: string[] = []
    const push = (l: string, w: string, pp: number, subf: (b: number) => string) => {
      const base = rem, v = t2(base * pp / 100); descs.push({ l, w, v, sub: subf(base) }); rem = t2(base - v)
    }
    push('Promoción EXPLORE 2026 · 25 %', 'EXPLORE 25 %', 25, (b) => `25 % de la enseñanza (${soles0(b)})`)
    for (const key of o.adicionales!) {
      const it = ADICIONALES_EXPLORE[key]
      push(`${it.label} · ${it.pct} % adicional`, `${it.w} ${it.pct} %`, it.pct, (b) => `${it.pct} % sobre el saldo de ${soles0(b)}`)
      conds.push(it.cond)
    }
    conds.unshift('Promoción EXPLORE 2026: 25 % de descuento en la enseñanza, en todas las carreras profesionales, por haber participado en EXPLORE (DNI verificado).')
    conds.push('Los descuentos se aplican en cascada: cada uno se calcula sobre el saldo que deja el anterior. No se acumula con la promoción de Admisión 2027-I, becas ni descuentos institucionales.')
    bconds = conds
  } else if (benef === 'INST') {
    const conds: string[] = []; let rem = ens
    o.institucionales!.forEach((key, i) => {
      const it = INSTITUCIONALES[key]
      let base = rem, sub = i === 0 ? `${it.pct} % de la enseñanza (${soles0(base)})` : `${it.pct} % sobre el saldo de ${soles0(base)}`
      if (key === 'DOC' && o.modalidad === 'PRES' && name === 'Medicina Humana') {
        const enf = CARRERAS[o.campus].find((x) => x[0] === 'Enfermería')
        if (enf) { base = t2(cr * enf[2] * rem / ens); sub = `10 % sobre ${cr} cr × ${soles0(enf[2])} (costo del crédito de Enfermería)${i ? ' al neto' : ''}` }
      }
      const v = t2(base * it.pct / 100); rem = t2(rem - v)
      descs.push({ l: `${it.label} · ${it.pct} %`, w: `${it.w} ${it.pct} %`, v, sub })
      conds.push(`${it.label} (${it.pct} %): vigencia ${it.vig}. Requisito: ${it.req}. Activa: ${it.resp}.`)
    })
    conds.unshift('Descuentos institucionales: se pueden combinar hasta dos, más el 5 % por pago al contado. Se aplican en cascada: cada descuento se calcula sobre el saldo que deja el anterior. No se combinan con la promoción del 25 % / 15 % ni con becas.')
    bconds = conds
  }

  const desc = t2(Math.min(ens, descs.reduce((a, d) => a + d.v, 0))), con = t2(ens - desc)
  const medJul = o.modalidad === 'PRES' && o.campus === 'JUL' && name === 'Medicina Humana'
  const mat = cp.mat, descMat = medJul ? mat : 0, matNeta = mat - descMat
  const cubre = ens > 0 && desc >= ens
  const contado = o.pago === 'contado' && !cubre
  const desc5 = contado ? t2(con * 5 / 100) : 0, neto = t2(con - desc5)
  const cuota = cubre ? 0 : (contado ? neto : r2(con / n))
  const otros = (o.modalidad === 'PRES' && name === 'Medicina Humana' && (o.campus === 'LIM' || o.campus === 'JUL')) ? OTROS_MED : []
  const otrosT = otros.reduce((a, x) => a + x[1], 0)

  return {
    opciones: o, cubre, name, cr, costo, pct: pctUsed, descs, bconds, beca, benef, n, ens, desc, con, desc5, neto, contado,
    mat, descMat, matNeta, cuota, otros, otrosT, modal: MODALIDADES[o.modalidad].label, cp,
    inicial: r2(matNeta + cuota + otrosT),
    total: neto + matNeta + otrosT,
    regular: ens + mat + otrosT,
    ahorro: desc + descMat + desc5,
  }
}

export type Proforma = ReturnType<typeof calcularProforma>

/** Condiciones que van en la proforma (mismo orden que el original). */
export function condiciones(k: Proforma): string[] {
  const cl = k.bconds && k.descs.length ? [...k.bconds] : [...(k.pct || k.descMat ? COND : COND_REG)]
  if (k.otros.length) cl.push(`${k.otros.map((o) => o[0] + ' (' + soles0(o[1]) + ')').join(' y ')} se pagan junto con la matrícula y la 1.ª cuota.`)
  if (k.contado) cl.splice(1, 0, 'El 5 % adicional exige pagar al contado la enseñanza del ciclo junto con la matrícula; se calcula sobre la enseñanza ya descontada.')
  return cl
}

/** Número de proforma: PF-JUL-270105-0930 */
export function numeroProforma(k: Proforma, d: Date = new Date()): string {
  // Partes de la fecha en hora de Lima (igual en el servidor y en el navegador)
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Lima', year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]))
  return `PF-${k.opciones.modalidad === 'PRES' ? k.opciones.campus : k.opciones.modalidad}-${partes.year}${partes.month}${partes.day}-${partes.hour}${partes.minute}`
}

/** Mensaje de WhatsApp con el detalle (tablas en bloque monoespaciado). */
export function textoWhatsApp(k: Proforma, datos: { nombre?: string; asesor?: string; vence?: Date | null }): string {
  const nom = datos.nombre?.trim() ?? '', ase = datos.asesor?.trim() ?? ''
  const LW = 19, NW = 9, W = LW + 3 + NW
  const num = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const m = (n: number) => 'S/ ' + num(n)
  const cell = (n: number, sg = '') => 'S/ ' + (sg + num(n)).padStart(NW, ' ')
  const row = (l: string, v: string) => l.slice(0, LW - 1).padEnd(LW, ' ') + v
  const neg = (n: number) => cell(n, '-')
  const T: string[] = [row('Enseñanza', cell(k.ens))]
  k.descs.forEach((x) => T.push(row(x.w, neg(x.v))))
  if (k.desc5) T.push(row('Contado 5 %', neg(k.desc5)))
  T.push(row('Matrícula', cell(k.mat)))
  if (k.descMat) T.push(row('Dscto. lanzamiento', neg(k.descMat)))
  k.otros.forEach((o) => T.push(row(o[0], cell(o[1]))))
  T.push('-'.repeat(W), row('TOTAL DEL CICLO', cell(k.total)))
  const P: string[] = []
  if (k.contado) P.push(row('Pago único', cell(k.inicial)))
  else if (k.cubre) P.push(row('Al matricularse', cell(k.inicial)), row('Cuotas pendientes', cell(0)))
  else P.push(row('Al matricularse', cell(k.inicial)), row(`${k.n - 1} cuotas de`, cell(k.cuota)))

  const L: string[] = [
    '*UNIVERSIDAD PERUANA UNIÓN*',
    '_Admisión 2027-I · Proforma de primer año_',
    '',
    nom ? `Estimado(a) *${nom}*:` : 'Estimado(a) postulante:',
    'Reciba un cordial saludo. Le compartimos el detalle de costos de su primer ciclo.',
    '',
    `*Carrera:* ${k.name}`,
    `*Campus:* ${k.cp.nombre} · ${k.modal}`,
    '',
    '*DETALLE DE COSTOS*',
    '```' + T.join('\n') + '```',
    '',
    k.cubre ? '*FORMA DE PAGO · BECA TOTAL*' : k.contado ? '*FORMA DE PAGO · AL CONTADO*' : `*FORMA DE PAGO · ${k.n} ARMADAS*`,
    '```' + P.join('\n') + '```',
  ]
  if (k.otros.length) L.push(`_El pago al matricularse incluye ${k.otros.map((o) => o[0]).join(' y ')}._`)
  L.push('')
  if (k.ahorro) L.push(`✅ *Su ahorro en el primer ciclo: ${m(k.ahorro)}*`)
  if (k.pct) L.push(`El descuento del ${k.pct} % rige durante el primer año académico (ciclos 2027-I y 2027-II).`)
  if (k.beca) L.push(`${k.beca.label}. Vigencia: ${k.beca.vig}.`)
  if (k.benef === 'EXPLORE' && k.descs.length) L.push(`Promoción EXPLORE 2026: ${k.descs.map((x) => x.w).join(', ')}.${k.descs.length > 1 ? ' Los descuentos adicionales están sujetos a la presentación de los requisitos.' : ''}`)
  if (k.benef === 'INST' && k.descs.length) L.push(`Beneficios aplicados: ${k.descs.map((x) => x.w).join(', ')}. Sujetos a la presentación de los requisitos.`)
  if (datos.vence) L.push(`Proforma válida hasta el ${fechaLarga(datos.vence)}.`)
  L.push('', '🔴 *SUJETO A VARIACIÓN*', '_Los montos de esta proforma son referenciales y pueden variar._', '',
    'Quedamos atentos a cualquier consulta.', 'Atentamente,', ase ? `*${ase}*\nGestión Comercial 2027` : '*Gestión Comercial 2027*')
  return L.join('\n')
}

/** Busca en el tarifario la carrera que más se parece a lo que escribió el lead ("enfermeria" -> "Enfermería"). */
export function carreraParecida(texto: string | null | undefined, modalidad: Modalidad, campus: CampusId): string | null {
  if (!texto) return null
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ')
  const t = norm(texto)
  const palabras = t.split(/\s+/).filter((p) => p.length > 3 && !['educacion', 'especialidad', 'ingenieria', 'carrera'].includes(p))
  let mejor: { nombre: string; puntos: number } | null = null
  for (const [nombre] of carreras(modalidad, campus)) {
    const n = norm(nombre)
    let puntos = n === t ? 100 : n.includes(t) || t.includes(n) ? 50 : 0
    puntos += palabras.filter((p) => n.includes(p)).length * 10
    if (puntos > 0 && (!mejor || puntos > mejor.puntos)) mejor = { nombre, puntos }
  }
  return mejor?.nombre ?? null
}

/** Resumen del tarifario de un campus para la base de conocimiento de Genesys. */
export function tarifarioTexto(campus: CampusId): string {
  const cp = CAMPUS[campus]
  const lineas = [`${cp.nombre} · presencial · matrícula ${soles0(cp.mat)} · pago en ${cp.cuotas} cuotas (salvo que se indique)`]
  for (const [nombre, cr, costo, pct, cq] of CARRERAS[campus]) {
    const ens = cr * costo
    const cuotas = cq || cp.cuotas
    const conPromo = pct ? t2(ens - t2(ens * pct / 100)) : ens
    lineas.push(`- ${nombre}: ${cr} créditos × ${soles0(costo)} = ${soles0(ens)} por ciclo${pct ? `; con la promoción del ${pct} %: ${soles0(conPromo)}` : ''} → ${cuotas} cuotas de ${soles2(r2(conPromo / cuotas))}${cq ? ` (${cq} cuotas)` : ''}`)
  }
  if (campus === 'JUL') lineas.push('- Medicina Humana en Juliaca: matrícula gratis en el primer ciclo (lanzamiento); además Jornada científica S/ 80 y CALIMED S/ 220 con la matrícula.')
  for (const m of ['EAD', 'SEMI'] as const) {
    const md = { ...MODALIDADES[m], cuotas: MODALIDADES[m].cuotas! }
    lineas.push(`${md.label} (sede Lima) · matrícula ${soles0(md.mat!)} · ${md.cuotas} cuotas · sin descuentos de promoción`)
    for (const [nombre, cr, costo] of CARRERAS_MOD[m]) lineas.push(`- ${nombre}: ${cr} créditos × ${soles0(costo)} = ${soles0(cr * costo)} por ciclo → ${md.cuotas} cuotas de ${soles2(r2(cr * costo / md.cuotas))}`)
  }
  lineas.push('Pago al contado: 5 % adicional sobre la enseñanza ya descontada. Becas y descuentos institucionales (egresado de colegio adventista 10 %, hijo de docente adventista 10 %, segundo hermano 8 %, asociado 10 %) los confirma el asesor con la proforma.')
  return lineas.join('\n')
}
