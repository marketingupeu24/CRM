'use client'

// Chat de WhatsApp del lead: mensajes del lead, respuestas de Genesys y del asesor.
// Se actualiza en tiempo real (Supabase Realtime respeta el RLS del usuario).
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { agruparPorCategoria, CATEGORIAS_RESPUESTA, categoriaRespuesta, type LeadInteraccion } from '@crm/db'
import { esDelChat } from '@/lib/chat'
import { crearClienteNavegador, prepararTiempoReal } from '@/lib/supabase/client'
import { comprimirImagen } from '@/lib/imagen'
import { Adjunto } from './Adjunto'
import { BarraVentana, VentanaWhatsApp, ventanaCerrada } from '@/components/VentanaWhatsApp'
import { useConfirmar } from '@/components/Confirmacion'

/** Pantalla táctil (celular): Enter hace salto de línea y se envía con el botón */
const TACTIL = '(pointer: coarse)'
function suscribirTactil(cambio: () => void) {
  const m = matchMedia(TACTIL)
  m.addEventListener('change', cambio)
  return () => m.removeEventListener('change', cambio)
}

/** Minúsculas y sin tildes, para buscar respuestas rápidas */
function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/** Atajo "/texto" al inicio de la última línea del mensaje: devuelve dónde empieza y lo buscado */
function atajoEscrito(texto: string): { desde: number; buscado: string } | null {
  const m = /(?:^|\n)\/([^\n]{0,40})$/.exec(texto)
  if (!m) return null
  return { desde: texto.length - m[1]!.length - 1, buscado: m[1]! }
}

/** Respuestas que coinciden con lo buscado: primero las que lo tienen en el título */
function buscarRespuestas<T extends { titulo: string; contenido: string }>(respuestas: T[], buscado: string): T[] {
  const palabras = normalizar(buscado).split(/\s+/).filter(Boolean)
  if (!palabras.length) return respuestas
  const enTitulo = respuestas.filter((r) => palabras.every((p) => normalizar(r.titulo).includes(p)))
  const enTexto = respuestas.filter((r) => !enTitulo.includes(r) && palabras.every((p) => normalizar(r.titulo + ' ' + r.contenido).includes(p)))
  return [...enTitulo, ...enTexto]
}

export type MensajeChat = LeadInteraccion & { autor_nombre?: string | null }

/** Lo que se puede adjuntar en el chat (igual que el bucket "chat-envios"). */
const TIPOS_ADJUNTO = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_ADJUNTO = 10 * 1024 * 1024

/** Día en Lima (AAAA-MM-DD) para separar la conversación por días. */
function diaLima(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date(iso))
}

/** "Hoy", "Ayer" o "lunes 13 de octubre" (con el año si no es el actual). */
function etiquetaDia(dia: string): string {
  const hoy = diaLima(new Date().toISOString())
  const ayer = diaLima(new Date(Date.now() - 86_400_000).toISOString())
  if (dia === hoy) return 'Hoy'
  if (dia === ayer) return 'Ayer'
  const fecha = new Date(`${dia}T12:00:00Z`)
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', ...(dia.slice(0, 4) !== hoy.slice(0, 4) ? { year: 'numeric' } : {}),
  }).format(fecha)
}

/** Solo la hora ("07:33 p. m."): el día va en el separador. */
function soloHora(iso: string): string {
  return new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

/** Quién habla: alumno, bot o un asesor en particular (para agrupar mensajes seguidos). */
const quien = (m: MensajeChat) => (m.tipo === 'mensaje_asesor' ? `asesor-${m.autor_id ?? ''}` : m.tipo)

/** Distancia al final (px) para considerar que el asesor está "abajo" leyendo lo último. */
const CERCA_DEL_FINAL = 150

function hora(iso: string): string {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

interface Props {
  leadId: string
  telefono: string
  inicial: MensajeChat[]
  miNombre: string
  nombresAutores: Record<string, string>
  /** Nombre del alumno para sus mensajes (si no tiene, se muestra su número) */
  nombreAlumno?: string | null
  /** Plantillas del chat; {nombre}, {carrera} y {asesor} se reemplazan con `variables` */
  respuestas?: { id: number; titulo: string; contenido: string; personal?: boolean; categoria?: string | null }[]
  variables?: { nombre: string; carrera: string; asesor: string }
  /** Barra con el estado del bot y los botones Atendido / Matriculado */
  encabezado?: React.ReactNode
  /** Acciones extra junto al cuadro de texto (p. ej. enviar la proforma) */
  acciones?: React.ReactNode
}

export function Conversacion(
  { leadId, telefono, inicial, miNombre, nombresAutores, encabezado, acciones, respuestas = [], variables, nombreAlumno }: Props,
) {
  const [mensajes, setMensajes] = useState<MensajeChat[]>(inicial)
  const [texto, setTexto] = useState('')
  const tactil = useSyncExternalStore(suscribirTactil, () => matchMedia(TACTIL).matches, () => false)
  const [verRespuestas, setVerRespuestas] = useState(false)
  // Último mensaje del alumno: abre la ventana de 24 h de WhatsApp (se actualiza en vivo)
  const ultimoAlumno = mensajes.findLast((m) => m.tipo === 'mensaje_lead')?.created_at ?? null
  const ultimoAlumnoRef = useRef(ultimoAlumno)
  useEffect(() => { ultimoAlumnoRef.current = ultimoAlumno }, [ultimoAlumno])
  // Panel ⚡: por categoría (saludo, carreras, modalidades…) y con buscador
  const [categoriaPanel, setCategoriaPanel] = useState('')
  const [buscarPanel, setBuscarPanel] = useState('')
  const enPanel = buscarRespuestas(respuestas, buscarPanel).filter((r) => !categoriaPanel || categoriaRespuesta(r.categoria).clave === categoriaPanel)

  // Atajo: "/" al inicio de una línea abre las respuestas rápidas filtradas por lo que sigue ("/traslado")
  const [atajoCerrado, setAtajoCerrado] = useState<string | null>(null)
  const [elegida, setElegida] = useState(0)
  const atajo = respuestas.length && atajoCerrado !== texto ? atajoEscrito(texto) : null
  const sugeridas = atajo ? buscarRespuestas(respuestas, atajo.buscado).slice(0, 8) : []
  const indice = Math.min(elegida, Math.max(sugeridas.length - 1, 0))

  /** Aplica una respuesta rápida: reemplaza las variables y la deja lista para editar */
  function usarRespuesta(contenido: string, desdeAtajo?: number) {
    const v = variables ?? { nombre: '', carrera: '', asesor: miNombre }
    const final = contenido
      .replaceAll('{nombre}', v.nombre)
      .replaceAll('{carrera}', v.carrera)
      .replaceAll('{asesor}', v.asesor)
      // "Hola , ..." cuando falta el nombre -> "Hola, ..."
      .replace(/\s+([,.!?])/g, '$1')
    setTexto((actual) => {
      // Con el atajo, la respuesta reemplaza el "/texto" escrito
      const base = desdeAtajo !== undefined ? actual.slice(0, desdeAtajo) : actual
      return base.trim() ? `${base.trimEnd()}\n${final}` : final
    })
    setVerRespuestas(false)
    setElegida(0)
  }
  const [enviando, setEnviando] = useState(false)
  // Imagen o PDF para adjuntar (botón 📎 o pegar con Ctrl+V)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null)
  const selector = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [enVivo, setEnVivo] = useState(false)
  const fondo = useRef<HTMLDivElement>(null)
  const campoTexto = useRef<HTMLTextAreaElement>(null)
  // Si el asesor subió a leer, los mensajes nuevos no lo bajan: se avisan con un botón
  const cercaDelFinal = useRef(true)
  const primeraVez = useRef(true)
  const [nuevosSinVer, setNuevosSinVer] = useState(0)
  const cantidad = useRef(inicial.length)
  // Ids negativos para los mensajes que se están enviando (nunca chocan con los de la base)
  const temporales = useRef(-1)

  /** Agrega mensajes sin repetir y mantiene el orden por fecha. */
  const agregarVarios = (nuevos: MensajeChat[]) =>
    setMensajes((previos) => {
      const ids = new Set(previos.map((p) => p.id))
      const sumar = nuevos.filter((m) => !ids.has(m.id))
      if (!sumar.length) return previos
      return [...previos, ...sumar].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    })
  const agregar = (m: MensajeChat) => agregarVarios([m])

  // Mensajes nuevos: tiempo real con reconexión automática + revisión periódica de respaldo
  const ultimaFecha = useRef<string | null>(inicial.at(-1)?.created_at ?? null)
  useEffect(() => {
    ultimaFecha.current = mensajes.at(-1)?.created_at ?? ultimaFecha.current
  }, [mensajes])

  useEffect(() => {
    const supabase = crearClienteNavegador()
    let canal: ReturnType<typeof supabase.channel> | null = null
    let reintento: ReturnType<typeof setTimeout> | undefined
    let espera = 2_000
    let activo = true

    /** Trae lo que llegó desde el último mensaje mostrado (por si el tiempo real se cortó). */
    async function revisar() {
      let consulta = supabase.from('lead_interacciones').select('*').eq('lead_id', leadId)
        .order('created_at', { ascending: true }).limit(100)
      if (ultimaFecha.current) consulta = consulta.gte('created_at', ultimaFecha.current)
      const { data } = await consulta
      if (activo && data?.length) agregarVarios((data as MensajeChat[]).filter(esDelChat))
    }

    async function conectar() {
      if (!activo) return
      await prepararTiempoReal(supabase)
      if (!activo) return
      canal = supabase
        .channel(`chat-${leadId}-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'lead_interacciones', filter: `lead_id=eq.${leadId}` },
          (payload) => {
            const m = payload.new as MensajeChat
            if (esDelChat(m)) agregar(m)
          },
        )
        // El archivo que envió el lead se une al mensaje unos segundos después (lo copia Genesys)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'lead_interacciones', filter: `lead_id=eq.${leadId}` },
          (payload) => {
            const m = payload.new as MensajeChat
            setMensajes((previos) => previos.map((p) => (p.id === m.id ? { ...p, adjunto_url: m.adjunto_url } : p)))
          },
        )
        .subscribe((estado, err) => {
          if (!activo) return
          if (estado === 'SUBSCRIBED') {
            setEnVivo(true)
            espera = 2_000
            void revisar() // lo que haya llegado mientras estaba desconectado
          } else if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT' || estado === 'CLOSED') {
            setEnVivo(false)
            if (err) console.warn('[chat] tiempo real:', estado, err.message)
            // Reconexión con espera creciente (2 s, 4 s, 8 s… hasta 30 s)
            clearTimeout(reintento)
            reintento = setTimeout(() => {
              if (canal) void supabase.removeChannel(canal)
              void conectar()
            }, espera)
            espera = Math.min(espera * 2, 30_000)
          }
        })
    }

    void conectar()
    // Respaldo: cada 10 s con la pestaña visible, y al volver a la pestaña
    const intervalo = setInterval(() => { if (document.visibilityState === 'visible') void revisar() }, 10_000)
    const alVolver = () => { if (document.visibilityState === 'visible') void revisar() }
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('focus', alVolver)

    return () => {
      activo = false
      clearTimeout(reintento)
      clearInterval(intervalo)
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('focus', alVolver)
      if (canal) void supabase.removeChannel(canal)
    }
  }, [leadId])

  // Al abrir: directo al último mensaje. Después: baja solo si el asesor ya estaba abajo o si él mismo envió;
  // si estaba leyendo más arriba, se muestra "↓ N mensajes nuevos" en vez de moverle la conversación.
  useEffect(() => {
    const caja = fondo.current
    if (!caja) return
    const agregados = mensajes.length - cantidad.current
    cantidad.current = mensajes.length
    if (primeraVez.current) { primeraVez.current = false; caja.scrollTop = caja.scrollHeight; return }
    if (agregados <= 0) return
    const ultimo = mensajes.at(-1)
    if (cercaDelFinal.current || ultimo?.tipo === 'mensaje_asesor') {
      caja.scrollTo({ top: caja.scrollHeight, behavior: 'smooth' })
    } else {
      setNuevosSinVer((n) => n + agregados)
    }
  }, [mensajes])

  function irAlFinal() {
    fondo.current?.scrollTo({ top: fondo.current.scrollHeight, behavior: 'smooth' })
    setNuevosSinVer(0)
  }

  // La caja de texto crece con lo que se escribe (hasta ~6 líneas) y vuelve a su tamaño al enviar
  useEffect(() => {
    const c = campoTexto.current
    if (!c) return
    c.style.height = 'auto'
    c.style.height = `${Math.min(c.scrollHeight, 160)}px`
  }, [texto])

  /** Valida y deja listo el archivo para enviar (imagen o PDF, máx. 10 MB). */
  function elegirArchivo(f: File | null | undefined) {
    if (!f) return
    if (!TIPOS_ADJUNTO.includes(f.type)) { setError('Solo puedes adjuntar imágenes (JPG, PNG, WEBP) o PDF.'); return }
    if (f.size > MAX_ADJUNTO) { setError('El archivo pesa más de 10 MB.'); return }
    setError(null)
    setArchivo(f)
  }

  // Miniatura de la imagen elegida
  useEffect(() => {
    if (!archivo || !archivo.type.startsWith('image/')) { setVistaPrevia(null); return }
    const url = URL.createObjectURL(archivo)
    setVistaPrevia(url)
    return () => URL.revokeObjectURL(url)
  }, [archivo])

  function quitarArchivo() {
    setArchivo(null)
    if (selector.current) selector.current.value = ''
  }

  // Con la ventana de 24 h cerrada, se pide confirmar: WhatsApp (API oficial) no entrega mensajes normales
  const confirmar = useConfirmar()
  async function enviarRevisando() {
    if (!texto.trim() && !archivo) return
    if (ventanaCerrada(ultimoAlumnoRef.current)) {
      const ok = await confirmar({
        titulo: '¿Enviar con la ventana de WhatsApp cerrada?',
        mensaje: 'Pasaron más de 24 horas desde el último mensaje del alumno (o aún no te escribe). WhatsApp probablemente NO entregará este mensaje. Lo correcto es usar una plantilla aprobada o esperar a que te escriba.',
        confirmar: 'Enviar de todos modos', peligro: true,
      })
      if (!ok) return
    }
    void enviar(texto, archivo)
  }

  async function enviar(contenido: string, adjunto: File | null = null, reintentoDe?: number) {
    const limpio = contenido.trim()
    if (!limpio && !adjunto) return
    // Solo texto: aparece al instante en el chat y la caja queda libre para seguir escribiendo
    if (!adjunto) {
      const temporal: MensajeChat = {
        id: temporales.current--, lead_id: leadId, tipo: 'mensaje_asesor', contenido: limpio, created_at: new Date().toISOString(),
        estado_envio: 'pendiente', error_envio: null, adjunto_url: null, autor_id: null, autor_nombre: miNombre,
      }
      setMensajes((previos) => [...previos.filter((p) => p.id !== reintentoDe), temporal])
      if (reintentoDe === undefined) setTexto('')
      setError(null)
      campoTexto.current?.focus()
      const { data, error: fallo } = await crearClienteNavegador().functions.invoke('chat', { body: { lead_id: leadId, texto: limpio } })
      let respuesta = data as { ok?: boolean; error?: string; mensaje?: MensajeChat } | null
      if (fallo && 'context' in fallo && fallo.context instanceof Response) respuesta = await fallo.context.json().catch(() => null)
      setMensajes((previos) => {
        const sin = previos.filter((p) => p.id !== temporal.id)
        if (respuesta?.mensaje) {
          const real = { ...respuesta.mensaje, autor_nombre: miNombre }
          return sin.some((p) => p.id === real.id) ? sin : [...sin, real].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
        }
        // No llegó al servidor: queda en el chat marcado para reintentar
        return [...sin, { ...temporal, estado_envio: 'error' }]
      })
      if (!respuesta?.ok) setError(respuesta?.error ?? 'No se pudo enviar el mensaje. Revisa tu conexión.')
      return
    }
    if (enviando) return
    setEnviando(true)
    setError(null)
    const supabase = crearClienteNavegador()
    // El archivo se sube a "chat-envios" (público: BuilderBot lo descarga para mandarlo por WhatsApp)
    let adjuntoUrl: string | undefined
    if (adjunto) {
      // Fotos grandes: se reducen a la calidad de WhatsApp antes de subirlas (ocupan menos espacio)
      adjunto = await comprimirImagen(adjunto)
      const extension =adjunto.type === 'application/pdf' ? 'pdf' : adjunto.type.split('/')[1] === 'jpeg' ? 'jpg' : adjunto.type.split('/')[1]
      const ruta = `${leadId}/${crypto.randomUUID()}.${extension}`
      const subida = await supabase.storage.from('chat-envios').upload(ruta, adjunto, { contentType: adjunto.type })
      if (subida.error) {
        setError('No se pudo subir el archivo. Intenta de nuevo.')
        setEnviando(false)
        return
      }
      adjuntoUrl = supabase.storage.from('chat-envios').getPublicUrl(ruta).data.publicUrl
    }
    const { data, error: fallo } = await supabase.functions.invoke('chat', { body: { lead_id: leadId, texto: limpio, adjunto_url: adjuntoUrl } })
    let respuesta = data as { ok?: boolean; error?: string; mensaje?: MensajeChat } | null
    if (fallo && 'context' in fallo && fallo.context instanceof Response) {
      respuesta = await fallo.context.json().catch(() => null)
    }
    if (respuesta?.mensaje) agregar({ ...respuesta.mensaje, autor_nombre: miNombre })
    if (respuesta?.ok) { setTexto(''); if (adjunto) quitarArchivo() }
    else setError(respuesta?.error ?? 'No se pudo enviar el mensaje. Revisa tu conexión.')
    setEnviando(false)
  }

  // Primer nombre y primer apellido del alumno (o su número si aún no dio su nombre)
  const nombreCorto = (() => {
    const partes = (nombreAlumno ?? '').trim().split(/\s+/).filter(Boolean)
    if (!partes.length) return telefono
    return partes.length >= 4 ? `${partes[0]} ${partes[2]}` : partes.slice(0, 2).join(' ')
  })()
  const nombreAutor = (m: MensajeChat) =>
    m.autor_nombre ?? (m.autor_id ? nombresAutores[m.autor_id] : undefined) ?? 'Asesor'


  return (
    <section className="@container tarjeta flex min-h-0 flex-1 flex-col overflow-hidden" id="chat">
      {/* Una sola línea: más espacio para los mensajes */}
      <div className="flex flex-nowrap items-center gap-2 border-b border-slate-200 px-3 py-2 md:px-4">
        <div className="flex min-w-0 shrink-0 items-center gap-2" title="Los mensajes salen por el número de Genesys, firmados con tu nombre">
          <h2 className="text-sm font-semibold whitespace-nowrap">💬<span className="@max-[26rem]:hidden"> WhatsApp</span></h2>
          <span className="truncate text-xs text-slate-500 @max-[36rem]:hidden">{telefono}</span>
          <span className={`flex shrink-0 items-center gap-1 text-xs ${enVivo ? 'text-emerald-600' : 'text-slate-400'}`} title={enVivo ? 'Recibe los mensajes en vivo' : 'Conectando…'}>
            <span className={`h-2 w-2 rounded-full ${enVivo ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            <span className="@max-[46rem]:hidden">{enVivo ? 'En vivo' : 'Conectando…'}</span>
          </span>
          <span className="@max-[40rem]:hidden"><VentanaWhatsApp ultimoMensajeAlumno={ultimoAlumno} /></span>
          <span className="hidden @max-[40rem]:inline"><VentanaWhatsApp ultimoMensajeAlumno={ultimoAlumno} variante="mini" /></span>
        </div>
        {encabezado && <div className="ml-auto flex min-w-0 justify-end">{encabezado}</div>}
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={fondo} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-chat-fondo px-3 py-3 md:px-4"
        onScroll={(e) => {
          const c = e.currentTarget
          cercaDelFinal.current = c.scrollHeight - c.scrollTop - c.clientHeight < CERCA_DEL_FINAL
          if (cercaDelFinal.current && nuevosSinVer) setNuevosSinVer(0)
        }}
      >
        {mensajes.length === 0 && (
          <p className="mt-24 text-center text-sm text-slate-500">
            Aún no hay mensajes. Escribe abajo para iniciar la conversación.
          </p>
        )}
        {mensajes.map((m, i) => {
          const previo = mensajes[i - 1]
          const dia = diaLima(m.created_at)
          const nuevoDia = !previo || diaLima(previo.created_at) !== dia
          const separador = nuevoDia && (
            <div className="sticky top-0 z-10 my-3 flex justify-center first:mt-0">
              <span className="rounded-full bg-superficie/90 px-3 py-0.5 text-[11px] font-medium text-slate-600 shadow-sm backdrop-blur first-letter:uppercase">{etiquetaDia(dia)}</span>
            </div>
          )
          if (m.tipo === 'sistema') {
            return (
              <div key={m.id}>
                {separador}
                <div className="mx-auto my-2 max-w-sm rounded-lg bg-amber-50 px-3 py-1.5 text-center text-xs whitespace-pre-wrap text-amber-900 shadow-sm">
                  {m.contenido}
                </div>
              </div>
            )
          }
          const propio = m.tipo === 'mensaje_asesor'
          const bot = m.tipo === 'respuesta_bot'
          const fallido = propio && m.estado_envio === 'error'
          const pendiente = propio && m.estado_envio === 'pendiente'
          // Mensajes seguidos del mismo autor (hasta 5 min) van juntos: el nombre solo en el primero
          const mismoGrupo = !nuevoDia && !!previo && previo.tipo !== 'sistema' && quien(previo) === quien(m)
            && Date.parse(m.created_at) - Date.parse(previo.created_at) < 5 * 60_000
          return (
            <div key={m.id}>
              {separador}
              <div className={`flex ${propio ? 'justify-end' : 'justify-start'} ${mismoGrupo ? 'mt-0.5' : 'mt-3'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm shadow-sm md:max-w-[75%] ${propio ? 'rounded-br-md' : 'rounded-bl-md'} ${
                    propio ? (fallido ? 'bg-rose-100' : 'bg-burbuja-propia') : bot ? 'bg-slate-100' : 'bg-superficie'
                  } ${pendiente ? 'opacity-70' : ''}`}
                >
                  {!mismoGrupo && (
                    <p className={`mb-0.5 text-[11px] font-semibold ${propio ? 'text-emerald-800' : bot ? 'text-violet-700' : 'text-marca-700'}`}>
                      {propio ? nombreAutor(m) : bot ? '🤖 Genesys' : nombreCorto}
                    </p>
                  )}
                  {m.adjunto_url && <Adjunto ruta={m.adjunto_url} propio={propio} />}
                  <p className="break-words whitespace-pre-wrap text-slate-800">
                    {m.contenido}
                    {/* Hora (y estado del envío) al final del texto, como en WhatsApp */}
                    <span className="float-right mt-1.5 ml-3 text-[10px] leading-none text-slate-500" title={hora(m.created_at)}>
                      {soloHora(m.created_at)}
                      {propio && (pendiente ? ' 🕓' : fallido ? ' ⚠️' : ' ✓')}
                    </span>
                  </p>
                  {fallido && (
                    <div className="mt-1 flex items-center justify-between gap-3 text-xs text-rose-700">
                      <span>No enviado</span>
                      <button onClick={() => enviar(m.contenido ?? '', null, m.id < 0 ? m.id : undefined)} className="font-semibold underline">
                        Reintentar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {nuevosSinVer > 0 && (
        <button
          type="button" onClick={irAlFinal}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-marca-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg hover:brightness-110"
        >
          ↓ {nuevosSinVer} {nuevosSinVer === 1 ? 'mensaje nuevo' : 'mensajes nuevos'}
        </button>
      )}
      </div>

      {atajo && (
        <div className="max-h-64 overflow-y-auto border-t border-slate-200 bg-slate-50 p-2" role="listbox" aria-label="Respuestas rápidas">
          <p className="px-2 pb-1 text-xs text-slate-500">
            Respuestas rápidas{atajo.buscado ? <> con «<b>{atajo.buscado}</b>»</> : ''} · ↑ ↓ para elegir, Enter o Tab para usarla, Esc para cerrar
          </p>
          {sugeridas.map((rr, i) => (
            <button
              key={rr.id} type="button" role="option" aria-selected={i === indice}
              onMouseDown={(e) => { e.preventDefault(); usarRespuesta(rr.contenido, atajo.desde) }}
              onMouseEnter={() => setElegida(i)}
              className={`block w-full rounded-lg px-3 py-2 text-left ${i === indice ? 'bg-marca-50 ring-1 ring-marca-200' : 'hover:bg-superficie'}`}
            >
              <span className="text-sm font-medium text-slate-800">{rr.titulo}{rr.personal && <span className="ml-1.5 rounded bg-violet-100 px-1 py-px text-[10px] font-medium text-violet-700">👤 personal</span>}</span>
              <span className="block truncate text-xs text-slate-500">{rr.contenido}</span>
            </button>
          ))}
          {!sugeridas.length && <p className="px-2 py-3 text-center text-xs text-slate-500">Ninguna respuesta rápida coincide con «{atajo.buscado}».</p>}
        </div>
      )}
      {verRespuestas && !atajo && (
        <div className="border-t border-slate-200 bg-slate-50">
          {respuestas.length === 0 ? (
            <p className="px-4 py-3 text-center text-xs text-slate-500">No hay respuestas rápidas. El administrador las crea en «Respuestas rápidas».</p>
          ) : (
            <>
              <div className="space-y-1.5 border-b border-slate-200 p-2">
                <input
                  value={buscarPanel} onChange={(e) => setBuscarPanel(e.target.value)} placeholder="⌕ Buscar respuesta" aria-label="Buscar respuesta rápida"
                  className="campo py-1 text-sm"
                />
                <div className="flex gap-1 overflow-x-auto pb-0.5 text-xs" role="tablist" aria-label="Categorías">
                  {[{ clave: '', nombre: 'Todas', icono: '' }, ...CATEGORIAS_RESPUESTA.filter((c) => respuestas.some((r) => categoriaRespuesta(r.categoria).clave === c.clave))].map((c) => (
                    <button
                      key={c.clave || 'todas'} type="button" role="tab" aria-selected={categoriaPanel === c.clave} onClick={() => setCategoriaPanel(c.clave)}
                      className={`shrink-0 rounded-full border px-2.5 py-0.5 whitespace-nowrap ${categoriaPanel === c.clave ? 'border-marca-600 bg-marca-600 text-white' : 'border-slate-300 bg-superficie text-slate-700 hover:bg-slate-100'}`}
                    >
                      {c.icono} {c.nombre}
                    </button>
                  ))}
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto p-1">
                {agruparPorCategoria(enPanel).map((g) => (
                  <div key={g.categoria.clave}>
                    {!categoriaPanel && (
                      <p className="sticky top-0 z-10 bg-slate-50 px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{g.categoria.icono} {g.categoria.nombre}</p>
                    )}
                    {g.items.map((rr) => (
                      <button
                        key={rr.id} type="button" onClick={() => usarRespuesta(rr.contenido)}
                        className="block w-full rounded-lg px-3 py-1.5 text-left hover:bg-superficie"
                      >
                        <span className="text-sm font-medium text-slate-800">{rr.titulo}{rr.personal && <span className="ml-1.5 rounded bg-violet-100 px-1 py-px text-[10px] font-medium text-violet-700">👤 personal</span>}</span>
                        <span className="block truncate text-xs text-slate-500">{rr.contenido}</span>
                      </button>
                    ))}
                  </div>
                ))}
                {!enPanel.length && <p className="px-2 py-3 text-center text-xs text-slate-500">Ninguna respuesta en este filtro.</p>}
              </div>
            </>
          )}
        </div>
      )}
      {archivo && (
        <div className="flex items-center gap-3 border-t border-slate-200 bg-slate-50 px-3 py-2">
          {vistaPrevia
            // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
            ? <img src={vistaPrevia} alt="Imagen para enviar" className="h-14 w-14 rounded-md border border-slate-200 object-cover" />
            : <span aria-hidden className="flex h-14 w-14 items-center justify-center rounded-md border border-slate-200 bg-superficie text-2xl">📄</span>}
          <div className="min-w-0 flex-1 text-sm">
            <p className="truncate font-medium text-slate-800">{archivo.name}</p>
            <p className="text-xs text-slate-500">{(archivo.size / 1024 / 1024).toFixed(1)} MB · escribe un mensaje para acompañarlo (opcional)</p>
          </div>
          <button type="button" onClick={quitarArchivo} disabled={enviando} className="text-sm font-medium text-slate-500 hover:text-rose-600" aria-label="Quitar archivo">✕ Quitar</button>
        </div>
      )}
      <BarraVentana ultimoMensajeAlumno={ultimoAlumno} />
      <form
        className="flex items-end gap-2 border-t border-slate-200 bg-superficie p-3 @max-[36rem]:gap-1.5 @max-[36rem]:p-2"
        onSubmit={(e) => { e.preventDefault(); void enviarRevisando() }}
      >
        <input
          ref={selector} type="file" accept={TIPOS_ADJUNTO.join(',')} className="hidden"
          onChange={(e) => elegirArchivo(e.target.files?.[0])}
        />
        <button
          type="button" onClick={() => selector.current?.click()} disabled={enviando} title="Adjuntar imagen o PDF"
          aria-label="Adjuntar imagen o PDF"
          className="h-10 shrink-0 rounded-lg border border-slate-300 px-3 text-sm text-slate-600 hover:bg-slate-50 @max-[36rem]:w-9 @max-[36rem]:px-0"
        >
          📎
        </button>
        <button
          type="button" onClick={() => setVerRespuestas((v) => !v)} title="Respuestas rápidas (atajo: escribe / en el mensaje)"
          className={`h-10 shrink-0 rounded-lg border px-3 text-sm @max-[36rem]:w-9 @max-[36rem]:px-0 @max-[22rem]:hidden ${verRespuestas ? 'border-marca-600 bg-marca-50 text-marca-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
        >
          ⚡
        </button>
        {acciones}
        <textarea
          ref={campoTexto}
          value={texto}
          onChange={(e) => { setTexto(e.target.value); setElegida(0) }}
          onKeyDown={(e) => {
            if (atajo) {
              if (e.key === 'Escape') { e.preventDefault(); setAtajoCerrado(texto); return }
              if (sugeridas.length) {
                if (e.key === 'ArrowDown') { e.preventDefault(); setElegida((indice + 1) % sugeridas.length); return }
                if (e.key === 'ArrowUp') { e.preventDefault(); setElegida((indice - 1 + sugeridas.length) % sugeridas.length); return }
                if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') { e.preventDefault(); usarRespuesta(sugeridas[indice]!.contenido, atajo.desde); return }
              }
            }
            // En el celular (pantalla táctil) Enter hace salto de línea, como en WhatsApp: se envía con el botón
            if (e.key === 'Enter' && !e.shiftKey && !tactil) { e.preventDefault(); void enviarRevisando() }
          }}
          onPaste={(e) => {
            // Pegar una captura de pantalla (Ctrl+V) la deja lista para enviar
            const imagen = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'))
            if (imagen) { e.preventDefault(); elegirArchivo(imagen) }
          }}
          rows={tactil ? 1 : 2}
          maxLength={1500}
          placeholder={archivo ? 'Mensaje (opcional)' : 'Escribe un mensaje'}
          className="campo max-h-40 resize-none @max-[36rem]:min-h-10 @max-[36rem]:min-w-0 @max-[36rem]:flex-1 @max-[36rem]:py-2"
          aria-label="Mensaje"
        />
        <button className="boton h-10 shrink-0 @max-[36rem]:w-10 @max-[36rem]:px-0" aria-label="Enviar" disabled={(enviando && !!archivo) || (!texto.trim() && !archivo)}>
          <span className="@max-[36rem]:hidden">{enviando ? 'Enviando…' : 'Enviar'}</span>
          <span aria-hidden className="text-base @min-[36rem]:hidden">{enviando ? '…' : '➤'}</span>
        </button>
      </form>
      {error && <p role="alert" className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>}
    </section>
  )
}
