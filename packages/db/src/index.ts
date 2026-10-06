// =====================================================================
//  @crm/db - Tipos y constantes del dominio de leads
//  Compartido por el bot (servidor) y el panel. No contiene claves.
// =====================================================================
import { Constants, type Database, type Tables } from './database.types'

export type { Database, Json, Tables, TablesInsert, TablesUpdate, Enums } from './database.types'

export type Lead = Tables<'leads'>
export type Asesor = Tables<'asesores'>
export type LeadInteraccion = Tables<'lead_interacciones'>
export type LeadEstado = Database['public']['Enums']['lead_estado']
export type AsesorRol = Database['public']['Enums']['asesor_rol']
export type InteraccionTipo = Database['public']['Enums']['interaccion_tipo']

/** Estados del embudo, en orden. */
export const ESTADOS_LEAD: readonly LeadEstado[] = Constants.public.Enums.lead_estado

/** Nombre de cada estado para mostrar en la interfaz. */
export const ETIQUETAS_ESTADO: Record<LeadEstado, string> = {
  lead_nuevo: 'Nuevo',
  lead_en_conversacion: 'En conversación',
  lead_no_interesado: 'No interesado',
  lead_interesado: 'Interesado',
  lead_asignado: 'Asignado',
  lead_contactado: 'Contactado',
  lead_atendido: 'Atendido',
  lead_inscrito: 'Inscrito',
  lead_matriculado: 'Matriculado',
  lead_perdido: 'Perdido',
}

/** Esperando o recién asignado a su asesor: Genesys no le responde (igual que en _shared/dominio.ts). */
export const ESTADOS_SIN_BOT: readonly LeadEstado[] = ['lead_interesado', 'lead_asignado']

/** ¿Genesys responde ahora a este lead? No, si espera a su asesor o si el bot está en pausa. */
export function botAtiendeLead(estado: LeadEstado, botPausadoHasta?: string | null, ahora = Date.now()): boolean {
  if (ESTADOS_SIN_BOT.includes(estado)) return false
  return !botPausadoHasta || Date.parse(botPausadoHasta) <= ahora
}

export const FUENTES = ['whatsapp_genesys', 'manual', 'google_form', 'web', 'actividad'] as const
export type Fuente = (typeof FUENTES)[number]

export const ETIQUETAS_FUENTE: Record<Fuente, string> = {
  whatsapp_genesys: 'WhatsApp (Genesys)',
  manual: 'Registro manual',
  google_form: 'Google Form',
  web: 'Formulario web',
  actividad: 'QR de feria / colegio',
}

export const PROGRAMAS = { pregrado: 'Pregrado', cepre: 'CePre' } as const
export type Programa = keyof typeof PROGRAMAS

/**
 * El panel se usa con usuario (ej. "danna.lima"), sin correo. Supabase Auth necesita
 * un email, así que se usa uno interno que nadie ve. Igual que email_de_usuario() en SQL.
 */
export const DOMINIO_EMAIL_INTERNO = 'crm.local'

export function emailDeUsuario(usuario: string): string {
  return `${usuario.trim().toLowerCase()}@${DOMINIO_EMAIL_INTERNO}`
}

export type Tarea = Tables<'tareas'>
export type RespuestaRapida = Tables<'respuestas_rapidas'>

/**
 * Módulos del panel que el super admin habilita por usuario (asesores.permisos).
 * Deben coincidir con la restricción asesores_permisos_validos de la base.
 */
export const MODULOS = [
  { clave: 'pendientes', grupo: 'Trabajo diario', titulo: 'Pendientes', descripcion: 'Tareas agendadas y alertas de seguimiento', ruta: '/pendientes' },
  { clave: 'chats', grupo: 'Trabajo diario', titulo: 'Chats', descripcion: 'Conversaciones de WhatsApp y responder desde el CRM', ruta: '/chats' },
  { clave: 'leads', grupo: 'Trabajo diario', titulo: 'Leads', descripcion: 'Lista de leads y ficha de cada lead', ruta: '/leads' },
  { clave: 'kanban', grupo: 'Trabajo diario', titulo: 'Kanban', descripcion: 'Tablero por estado', ruta: '/kanban' },
  { clave: 'registrar', grupo: 'Trabajo diario', titulo: 'Registrar lead', descripcion: 'Registrar leads a mano', ruta: '/leads/nuevo' },
  { clave: 'actividades', grupo: 'Trabajo diario', titulo: 'Actividades y QR', descripcion: 'Crear ferias y visitas a colegios con QR de registro', ruta: '/actividades' },
  { clave: 'qr_asesor', grupo: 'Trabajo diario', titulo: 'Mi QR (presencial)', descripcion: 'QR personal para que el interesado escriba por WhatsApp y quede como su lead', ruta: '/qr' },
  { clave: 'costos', grupo: 'Trabajo diario', titulo: 'Proformas de costos', descripcion: 'Calcular costos, descargar la proforma y enviarla por el chat', ruta: '/costos' },
  { clave: 'dashboard', grupo: 'Análisis', titulo: 'Dashboard', descripcion: 'Indicadores y gráficos', ruta: '/dashboard' },
  { clave: 'campanas', grupo: 'Análisis', titulo: 'Campañas', descripcion: 'Ver campañas y sus resultados', ruta: '/campanas' },
  { clave: 'exportar', grupo: 'Análisis', titulo: 'Exportar Excel', descripcion: 'Descargar la lista de leads', ruta: null },
  { clave: 'ver_todos', grupo: 'Gestión de leads', titulo: 'Ver leads de todo el equipo', descripcion: 'Sin esto, solo ve sus propios leads', ruta: null },
  { clave: 'asignar', grupo: 'Gestión de leads', titulo: 'Asignar y reasignar', descripcion: 'Cambiar el asesor de un lead (también en bloque)', ruta: null },
  { clave: 'repartir', grupo: 'Gestión de leads', titulo: 'Repartir leads entre asesores', descripcion: 'Al registrar, repartir por igual en vez de dejarlos a su nombre', ruta: null },
  { clave: 'editar_celular', grupo: 'Gestión de leads', titulo: 'Editar celular del lead', descripcion: 'Cambiar el número al que escribe el chat', ruta: null },
  { clave: 'papelera', grupo: 'Gestión de leads', titulo: 'Papelera', descripcion: 'Eliminar, restaurar y borrar leads', ruta: '/papelera' },
  { clave: 'usuarios', grupo: 'Administración', titulo: 'Asesores y usuarios', descripcion: 'Crear y editar asesores, contraseñas y papelera de usuarios', ruta: '/usuarios' },
  { clave: 'respuestas', grupo: 'Administración', titulo: 'Respuestas rápidas', descripcion: 'Administrar las plantillas del chat', ruta: '/respuestas' },
  { clave: 'gestionar_campanas', grupo: 'Administración', titulo: 'Crear campañas', descripcion: 'Crear, editar y archivar campañas', ruta: null },
  { clave: 'conocimiento', grupo: 'Genesys (bot)', titulo: 'Base de conocimiento y revisión', descripcion: 'Editar lo que sabe Genesys y revisar lo que no supo responder', ruta: '/revision-bot' },
] as const

export type Modulo = (typeof MODULOS)[number]['clave']
export const CLAVES_MODULOS: readonly Modulo[] = MODULOS.map((m) => m.clave)

/** Grado o situación escolar del interesado (fichas, formulario del QR y ficha del lead). */
export const GRADOS = ['5.° de secundaria', '4.° de secundaria', '3.° de secundaria o menos', 'Ya terminé el colegio', 'Universitario / traslado', 'Otro'] as const

/** Lo que recibe un asesor nuevo (igual al valor por defecto de asesores.permisos). */
export const PERMISOS_ASESOR: readonly Modulo[] = ['pendientes', 'chats', 'leads', 'kanban', 'registrar', 'costos', 'actividades', 'qr_asesor', 'dashboard', 'campanas', 'exportar']

/** Secciones de la base de conocimiento de Genesys (conocimiento.categoria), en orden. */
export const CATEGORIAS_CONOCIMIENTO = {
  reglas: 'Reglas para Genesys',
  carreras: 'Carreras',
  costos: 'Costos y pensiones',
  becas: 'Becas, descuentos y convenios',
  admision: 'Examen y fechas de admisión',
  requisitos: 'Requisitos',
  cepre: 'CEPRE',
  campus: 'Ubicación y horarios',
  otros: 'Otros',
} as const
export type CategoriaConocimiento = keyof typeof CATEGORIAS_CONOCIMIENTO
export type Conocimiento = Tables<'conocimiento'>

/** Cómo nos conoció el lead (leads.origen_campana). Igual que ORIGENES en _shared/dominio.ts. */
export const ORIGENES = [
  'Facebook',
  'Instagram',
  'TikTok',
  'Google',
  'Página web',
  'Recomendación',
  'Colegio adventista',
  'Feria / colegio',
  'Volante / afiche',
  'Radio / TV',
  'Otro',
] as const

/** Motivos de pérdida / no interés (se guardan en leads.motivo_no_interes; "Otro: detalle"). */
export const MOTIVOS_PERDIDA = [
  'Costo / pensión',
  'Eligió otra universidad',
  'Distancia / ubicación',
  'Horarios',
  'No ofrecemos la carrera',
  'No cumple requisitos',
  'Postergó para otro periodo',
  'No responde',
  'Otro',
] as const

export * from './costos'
