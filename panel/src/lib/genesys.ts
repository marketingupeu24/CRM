// Arma el prompt del asistente INFORMACIÓN de BuilderBot a partir de las fichas del CRM
// ("Prompt de Genesys", dividido por partes) y lo revisa antes de copiarlo.
// Los costos no se escriben a mano: salen del tarifario de las proformas.
import { costoCarreraTexto, PARTES_GENESYS, type FichaGenesys } from '@crm/db'

/** Igual que el horario de atención del CRM (public.franjas_atencion). */
const HORARIO_ATENCION = 'Lunes a jueves de 8:00 am a 12:30 pm y de 2:00 pm a 6:00 pm; viernes de 8:00 am a 1:00 pm; sábado y domingo cerrado.'
/** Máximo de caracteres que acepta el asistente de IA de BuilderBot */
const LIMITE_PROMPT = 150_000

/** "8:00 a.m." parte el mensaje en BuilderBot: se escribe "8:00 am". */
export function sinPuntosEnHoras(texto: string): string {
  return texto.replace(/\b([ap])\.\s?m\.?(?=\s|$|[),;:])/gi, (_, l: string) => `${l.toLowerCase()}m`)
}

const lineas = (valor: string | undefined) => (valor ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
const campo = (f: FichaGenesys, clave: string) => (f.campos[clave] ?? '').trim()

function fichaCarrera(f: FichaGenesys): string {
  const costo = costoCarreraTexto(f.titulo.replace(/\s*\(.*\)\s*$/, ''), campo(f, 'modalidad'))
  const estado = campo(f, 'estado')
  return [
    `### *${f.titulo}*${estado && estado !== 'Vigente' ? ` — ${estado}` : ''}`,
    campo(f, 'enfoque') && `- Enfoque: ${campo(f, 'enfoque')}`,
    lineas(f.campos.aprendera).length ? `- Lo que aprenderá: ${lineas(f.campos.aprendera).join('; ')}` : null,
    campo(f, 'perfil') && `- Perfil del egresado: ${campo(f, 'perfil')}`,
    campo(f, 'salidas') && `- Campo laboral: ${campo(f, 'salidas')}`,
    campo(f, 'duracion') && `- Duración: ${campo(f, 'duracion')}`,
    `- Costo referencial (dalo SOLO si pregunta por el precio): ${costo ?? 'lo confirma el asesor(a) con la proforma'}`,
    campo(f, 'notas') && `- Nota: ${campo(f, 'notas')}`,
  ].filter(Boolean).join('\n')
}

function fichaGenerica(f: FichaGenesys, etiquetas: Record<string, string>): string {
  const partes = [`### ${f.titulo}`]
  for (const [clave, etiqueta] of Object.entries(etiquetas)) {
    const l = lineas(f.campos[clave])
    if (!l.length) continue
    partes.push(l.length > 1 ? `- ${etiqueta}:\n${l.map((x) => `  • ${x}`).join('\n')}` : `- ${etiqueta}: ${l[0]}`)
  }
  return partes.join('\n')
}

/** Prompt completo para pegar en el asistente INFORMACIÓN de BuilderBot. */
export function promptGenesys(fichas: FichaGenesys[], fecha: Date = new Date(), feriados: { fecha: string; nombre: string }[] = []): string {
  const hoy = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric' }).format(fecha)
  const activas = fichas.filter((f) => f.activo).sort((a, b) => a.orden - b.orden || a.titulo.localeCompare(b.titulo))
  const de = (parte: string) => activas.filter((f) => f.parte === parte)
  const texto = (f: FichaGenesys) => `### ${f.titulo}\n${campo(f, 'texto')}`
  const salida: string[] = [
    '# Genesys – Asesora virtual de Admisión de la Universidad Peruana Unión, campus Juliaca',
    `(Actualizado el ${hoy} desde el CRM de Admisión. Usa solo esta información; si un dato no está aquí, no lo inventes.)`,
  ]
  let n = 0
  const seccion = (titulo: string, cuerpo: string[]) => {
    if (!cuerpo.length) return
    salida.push('', `## ${++n}. ${titulo}`, '', cuerpo.join('\n\n'))
  }
  seccion('Identidad y estilo', de('identidad').map(texto))
  seccion('Plantillas de respuesta (copia su estilo y sus emojis; reemplaza lo que está entre [corchetes])', de('plantillas').map(texto))
  seccion('Registro de alumnos', de('registro').map(texto))
  seccion('Reglas y límites', de('reglas').map(texto))

  const carreras = de('carreras')
  const grupos: [string, (f: FichaGenesys) => boolean][] = [
    ['Presencial – campus Juliaca', (f) => campo(f, 'modalidad') === 'Presencial' && campo(f, 'estado') !== 'Nueva 2027-1'],
    ['Carreras nuevas 2027-1 (presencial, Juliaca)', (f) => campo(f, 'modalidad') === 'Presencial' && campo(f, 'estado') === 'Nueva 2027-1'],
    ['A distancia (sede Lima)', (f) => campo(f, 'modalidad') === 'A distancia'],
    ['Semipresencial (sede Lima)', (f) => campo(f, 'modalidad') === 'Semipresencial'],
  ]
  const cuerpoCarreras: string[] = []
  for (const [titulo, filtro] of grupos) {
    const lista = carreras.filter(filtro)
    if (lista.length) cuerpoCarreras.push(`**${titulo}:** ${lista.map((f) => f.titulo.replace(/\s*\(.*\)\s*$/, '')).join(', ')}.`, ...lista.map(fichaCarrera))
  }
  if (carreras.length) cuerpoCarreras.unshift('Solo se ofrecen estas carreras. Costos del primer ciclo, referenciales y sin becas ni descuentos institucionales.')
  seccion('Carreras', cuerpoCarreras)

  seccion('Modalidades de admisión', de('modalidades').map((f) => fichaGenerica(f, { dirigido: 'Dirigido a', requisitos: 'Requisitos', examen: 'Examen de conocimientos', notas: 'Nota' })))
  seccion('CEPRE (centro preuniversitario)', de('cepre').map((f) => fichaGenerica(f, { modalidad: 'Modalidad', costo: 'Costo', fechas: 'Fechas', horario: 'Horario', lugar: 'Lugar', areas: 'Áreas', incluye: 'Beneficios', notas: 'Nota' })))
  seccion('Exámenes y fechas', de('examenes').map((f) => fichaGenerica(f, { fecha: 'Fecha', costo: 'Costo', notas: 'Nota' })))
  seccion('Becas y descuentos', de('becas').map(texto))
  const diaFeriado = (f: string) => new Intl.DateTimeFormat('es-PE', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${f}T00:00:00Z`))
  const proximos = feriados.slice(0, 12).map((f) => `- ${diaFeriado(f.fecha)}: ${f.nombre}`)
  seccion('Sede, contacto y horario', [
    ...de('sede').map(texto),
    `### Horario de atención de los asesores\n${HORARIO_ATENCION}`,
    ...(proximos.length ? [`### Feriados: NO hay atención esos días (la atención sigue el siguiente día hábil)\n${proximos.join('\n')}`] : []),
  ])
  seccion('Preguntas frecuentes', de('faq').map((f) => `### ${f.titulo}\n${campo(f, 'texto')}`))
  return sinPuntosEnHoras(salida.join('\n'))
}

export interface Aviso {
  nivel: 'error' | 'aviso' | 'info'
  texto: string
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/**
 * Fechas con año escritas en una ficha ("22 de noviembre de 2026") que ya pasaron.
 * Las fechas sin año ("del 14 de septiembre al 6 de noviembre") no se revisan: serían ambiguas.
 */
export function fechasVencidas(f: FichaGenesys, hoy: Date): string[] {
  const hoyLima = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(hoy)
  const texto = Object.values(f.campos).join(' ').toLowerCase().replace('setiembre', 'septiembre')
  const vencidas: string[] = []
  for (const m of texto.matchAll(/\b(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre) del? (\d{4})\b/g)) {
    const iso = `${m[3]}-${String(MESES.indexOf(m[2]!) + 1).padStart(2, '0')}-${m[1]!.padStart(2, '0')}`
    if (iso < hoyLima) vencidas.push(`${m[1]} de ${m[2]} de ${m[3]}`)
  }
  return [...new Set(vencidas)]
}

/** Revisión antes de copiar: palabra clave del registro, horas con puntos, fichas incompletas, fechas vencidas, largo. */
export function revisarPrompt(prompt: string, fichas: FichaGenesys[], hoy = new Date()): Aviso[] {
  const avisos: Aviso[] = []
  const activas = fichas.filter((f) => f.activo)
  // Fin de campaña: el bot no debe dar fechas que ya pasaron (error común: fechas del ciclo anterior)
  const conFechasPasadas = activas.map((f) => ({ f, fechas: fechasVencidas(f, hoy) })).filter((x) => x.fechas.length)
  if (conFechasPasadas.length) {
    avisos.push({ nivel: 'aviso', texto: `Fechas que ya pasaron (Genesys las seguiría dando): ${conFechasPasadas.map((x) => `${x.f.titulo} (${x.fechas.join(', ')})`).join('; ')}. Actualízalas o desactiva la ficha.` })
  }
  const fueraDeRegistro = activas.filter((f) => f.parte !== 'registro' && JSON.stringify(f.campos).includes('PEDIDO_CONFIRMADO'))
  if (fueraDeRegistro.length) {
    avisos.push({ nivel: 'error', texto: `PEDIDO_CONFIRMADO aparece fuera de "Registro de alumnos" (${fueraDeRegistro.map((f) => f.titulo).join(', ')}): puede registrar antes de tiempo o repetir el registro.` })
  }
  if (!prompt.includes('PEDIDO_CONFIRMADO')) avisos.push({ nivel: 'error', texto: 'Falta la palabra clave PEDIDO_CONFIRMADO en "Registro de alumnos": Genesys no podría registrar a nadie.' })
  const conPuntos = activas.filter((f) => /\b[ap]\.\s?m\./i.test(JSON.stringify(f.campos)))
  if (conPuntos.length) avisos.push({ nivel: 'info', texto: `Se corrigieron horas con "a.m./p.m." (${conPuntos.length} ficha(s)); conviene escribirlas como "am/pm" en la ficha.` })
  const nombres = PARTES_GENESYS.reduce<Record<string, string>>((a, p) => ({ ...a, [p.clave]: p.titulo }), {})
  // A distancia y semipresencial no repiten el plan de la presencial: solo cuentan las presenciales
  const incompletas = activas.filter((f) => f.parte === 'carreras' && f.campos.modalidad === 'Presencial' && !(f.campos.enfoque ?? '').trim())
  if (incompletas.length) avisos.push({ nivel: 'aviso', texto: `Carreras sin enfoque ni plan (Genesys tendrá poco que decir): ${incompletas.map((f) => f.titulo).join(', ')}.` })
  const sinCosto = activas.filter((f) => f.parte === 'carreras' && !costoCarreraTexto(f.titulo.replace(/\s*\(.*\)\s*$/, ''), f.campos.modalidad ?? ''))
  if (sinCosto.length) avisos.push({ nivel: 'info', texto: `Sin costo en el tarifario de proformas (Genesys dirá que lo confirma el asesor): ${sinCosto.map((f) => f.titulo).join(', ')}.` })
  const pendientes = fichas.filter((f) => !f.activo)
  if (pendientes.length) avisos.push({ nivel: 'info', texto: `${pendientes.length} ficha(s) desactivada(s) o por completar no van en el prompt: ${pendientes.map((f) => `${f.titulo} (${nombres[f.parte] ?? f.parte})`).join(', ')}.` })
  // BuilderBot acepta hasta 150 000 caracteres en el asistente: se avisa al acercarse al límite
  if (prompt.length > LIMITE_PROMPT) avisos.push({ nivel: 'error', texto: `El prompt tiene ${prompt.length.toLocaleString('es-PE')} caracteres y BuilderBot acepta hasta ${LIMITE_PROMPT.toLocaleString('es-PE')}: desactiva fichas poco usadas antes de pegarlo.` })
  else if (prompt.length > LIMITE_PROMPT * 0.9) avisos.push({ nivel: 'aviso', texto: `El prompt tiene ${prompt.length.toLocaleString('es-PE')} caracteres: se acerca al límite de BuilderBot (${LIMITE_PROMPT.toLocaleString('es-PE')}).` })
  return avisos
}
