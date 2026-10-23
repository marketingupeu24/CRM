'use client'

// Chat de WhatsApp del lead: mensajes del lead, respuestas de Genesys y del asesor.
// Las piezas están en ./chat: tiempo real (useMensajesEnVivo), cada mensaje (Burbuja),
// respuestas rápidas (PanelRespuestas) y utilidades de formato.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { comprimirImagen } from '@/lib/imagen'
import { crearClienteNavegador } from '@/lib/supabase/client'
import { BarraVentana, VentanaWhatsApp, ventanaCerrada } from '@/components/VentanaWhatsApp'
import { useConfirmar } from '@/components/Confirmacion'
import { useMensajesEnVivo } from './chat/useMensajesEnVivo'
import { Burbuja } from './chat/Burbuja'
import { PanelRespuestas, SugerenciasAtajo } from './chat/PanelRespuestas'
import {
  atajoEscrito, buscarRespuestas, CERCA_DEL_FINAL, MAX_ADJUNTO, suscribirTactil, TACTIL, TIPOS_ADJUNTO,
  type MensajeChat, type RespuestaChat,
} from './chat/utilidades'

export type { MensajeChat } from './chat/utilidades'

interface Props {
  leadId: string
  telefono: string
  inicial: MensajeChat[]
  miNombre: string
  nombresAutores: Record<string, string>
  /** Nombre del alumno para sus mensajes (si no tiene, se muestra su número) */
  nombreAlumno?: string | null
  /** Plantillas del chat; {nombre}, {carrera} y {asesor} se reemplazan con `variables` */
  respuestas?: RespuestaChat[]
  variables?: { nombre: string; carrera: string; asesor: string }
  /** Barra con el estado del bot y los botones Atendido / Matriculado */
  encabezado?: React.ReactNode
  /** Acciones extra junto al cuadro de texto (p. ej. enviar la proforma) */
  acciones?: React.ReactNode
}

export function Conversacion(
  { leadId, telefono, inicial, miNombre, nombresAutores, encabezado, acciones, respuestas = [], variables, nombreAlumno }: Props,
) {
  const { mensajes, setMensajes, enVivo, agregar } = useMensajesEnVivo(leadId, inicial)
  const [texto, setTexto] = useState('')
  const tactil = useSyncExternalStore(suscribirTactil, () => matchMedia(TACTIL).matches, () => false)
  const [verRespuestas, setVerRespuestas] = useState(false)
  // Último mensaje del alumno: abre la ventana de 24 h de WhatsApp (se actualiza en vivo)
  const ultimoAlumno = mensajes.findLast((m) => m.tipo === 'mensaje_lead')?.created_at ?? null
  const ultimoAlumnoRef = useRef(ultimoAlumno)
  useEffect(() => { ultimoAlumnoRef.current = ultimoAlumno }, [ultimoAlumno])
  // Panel ⚡: el filtro elegido se mantiene aunque se cierre y vuelva a abrir
  const [categoriaPanel, setCategoriaPanel] = useState('')
  const [buscarPanel, setBuscarPanel] = useState('')

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
  const selector = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const fondo = useRef<HTMLDivElement>(null)
  const campoTexto = useRef<HTMLTextAreaElement>(null)
  // Si el asesor subió a leer, los mensajes nuevos no lo bajan: se avisan con un botón
  const cercaDelFinal = useRef(true)
  const primeraVez = useRef(true)
  const [nuevosSinVer, setNuevosSinVer] = useState(0)
  const cantidad = useRef(inicial.length)
  // Ids negativos para los mensajes que se están enviando (nunca chocan con los de la base)
  const temporales = useRef(-1)

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
  const vistaPrevia = useMemo(() => (archivo?.type.startsWith('image/') ? URL.createObjectURL(archivo) : null), [archivo])
  useEffect(() => () => { if (vistaPrevia) URL.revokeObjectURL(vistaPrevia) }, [vistaPrevia])

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
      const extension = adjunto.type === 'application/pdf' ? 'pdf' : adjunto.type.split('/')[1] === 'jpeg' ? 'jpg' : adjunto.type.split('/')[1]
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
        {mensajes.map((m, i) => (
          <Burbuja
            key={m.id} m={m} previo={mensajes[i - 1]} ultimoAlumno={ultimoAlumno}
            nombreAlumno={nombreCorto} nombreAsesor={nombreAutor(m)}
            alReintentar={() => enviar(m.contenido ?? '', null, m.id < 0 ? m.id : undefined)}
          />
        ))}
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
        <SugerenciasAtajo
          buscado={atajo.buscado} sugeridas={sugeridas} indice={indice}
          alUsar={(contenido) => usarRespuesta(contenido, atajo.desde)} alSeñalar={setElegida}
        />
      )}
      {verRespuestas && !atajo && (
        <PanelRespuestas
          respuestas={respuestas} categoria={categoriaPanel} buscar={buscarPanel}
          alCambiarCategoria={setCategoriaPanel} alBuscar={setBuscarPanel} alUsar={(contenido) => usarRespuesta(contenido)}
        />
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
