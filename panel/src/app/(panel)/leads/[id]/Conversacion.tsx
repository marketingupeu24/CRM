'use client'

// Chat de WhatsApp del lead: mensajes del lead, respuestas de Genesys y del asesor.
// Se actualiza en tiempo real (Supabase Realtime respeta el RLS del usuario).
import { useEffect, useRef, useState } from 'react'
import type { LeadInteraccion } from '@crm/db'
import { esDelChat } from '@/lib/chat'
import { crearClienteNavegador, prepararTiempoReal } from '@/lib/supabase/client'
import { comprimirImagen } from '@/lib/imagen'
import { Adjunto } from './Adjunto'

export type MensajeChat = LeadInteraccion & { autor_nombre?: string | null }

/** Lo que se puede adjuntar en el chat (igual que el bucket "chat-envios"). */
const TIPOS_ADJUNTO = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_ADJUNTO = 10 * 1024 * 1024

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
  /** Plantillas del chat; {nombre}, {carrera} y {asesor} se reemplazan con `variables` */
  respuestas?: { id: number; titulo: string; contenido: string }[]
  variables?: { nombre: string; carrera: string; asesor: string }
  /** Barra con el estado del bot y los botones Atendido / Matriculado */
  encabezado?: React.ReactNode
  /** Acciones extra junto al cuadro de texto (p. ej. enviar la proforma) */
  acciones?: React.ReactNode
}

export function Conversacion(
  { leadId, telefono, inicial, miNombre, nombresAutores, encabezado, acciones, respuestas = [], variables }: Props,
) {
  const [mensajes, setMensajes] = useState<MensajeChat[]>(inicial)
  const [texto, setTexto] = useState('')
  const [verRespuestas, setVerRespuestas] = useState(false)

  /** Aplica una respuesta rápida: reemplaza las variables y la deja lista para editar */
  function usarRespuesta(contenido: string) {
    const v = variables ?? { nombre: '', carrera: '', asesor: miNombre }
    const final = contenido
      .replaceAll('{nombre}', v.nombre)
      .replaceAll('{carrera}', v.carrera)
      .replaceAll('{asesor}', v.asesor)
      // "Hola , ..." cuando falta el nombre -> "Hola, ..."
      .replace(/\s+([,.!?])/g, '$1')
    setTexto((actual) => (actual.trim() ? `${actual.trimEnd()}\n${final}` : final))
    setVerRespuestas(false)
  }
  const [enviando, setEnviando] = useState(false)
  // Imagen o PDF para adjuntar (botón 📎 o pegar con Ctrl+V)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null)
  const selector = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [enVivo, setEnVivo] = useState(false)
  const fondo = useRef<HTMLDivElement>(null)

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

  // Bajar al último mensaje
  useEffect(() => {
    fondo.current?.scrollTo({ top: fondo.current.scrollHeight, behavior: 'smooth' })
  }, [mensajes.length])

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

  async function enviar(contenido: string, adjunto: File | null = null) {
    const limpio = contenido.trim()
    if ((!limpio && !adjunto) || enviando) return
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

  const nombreAutor = (m: MensajeChat) =>
    m.autor_nombre ?? (m.autor_id ? nombresAutores[m.autor_id] : undefined) ?? 'Asesor'

  return (
    <section className="tarjeta flex scroll-mt-36 flex-col overflow-hidden" id="chat">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <div>
          <h2 className="font-semibold">Conversación de WhatsApp</h2>
          <p className="text-xs text-slate-500">{telefono} · los mensajes salen por el número de Genesys, firmados con tu nombre</p>
        </div>
        <span className={`flex items-center gap-1.5 text-xs ${enVivo ? 'text-emerald-600' : 'text-slate-400'}`}>
          <span className={`h-2 w-2 rounded-full ${enVivo ? 'bg-emerald-500' : 'bg-slate-300'}`} />
          {enVivo ? 'En vivo' : 'Conectando…'}
        </span>
      </div>

      {encabezado}
      <div ref={fondo} className="h-[28rem] space-y-2 overflow-y-auto bg-chat-fondo px-4 py-4">
        {mensajes.length === 0 && (
          <p className="mt-24 text-center text-sm text-slate-500">
            Aún no hay mensajes. Escribe abajo para iniciar la conversación.
          </p>
        )}
        {mensajes.map((m) => {
          if (m.tipo === 'sistema') {
            return (
              <div key={m.id} className="mx-auto max-w-sm rounded-lg bg-amber-50 px-3 py-2 text-xs whitespace-pre-wrap text-amber-900 shadow-sm">
                {m.contenido}
              </div>
            )
          }
          const propio = m.tipo === 'mensaje_asesor'
          const bot = m.tipo === 'respuesta_bot'
          const fallido = propio && m.estado_envio === 'error'
          return (
            <div key={m.id} className={`flex ${propio ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                  propio ? (fallido ? 'bg-rose-100' : 'bg-burbuja-propia') : bot ? 'bg-slate-100' : 'bg-superficie'
                }`}
              >
                <p className="mb-0.5 text-[11px] font-semibold text-slate-500">
                  {propio ? nombreAutor(m) : bot ? 'Genesys (bot)' : 'Lead'}
                </p>
                {m.adjunto_url && <Adjunto ruta={m.adjunto_url} propio={propio} />}
                <p className="break-words whitespace-pre-wrap text-slate-800">{m.contenido}</p>
                <p className="mt-1 text-right text-[10px] text-slate-500">
                  {hora(m.created_at)}
                  {propio && !fallido && ' ✓'}
                </p>
                {fallido && (
                  <div className="mt-1 flex items-center justify-between gap-3 text-xs text-rose-700">
                    <span>No enviado</span>
                    <button onClick={() => enviar(m.contenido ?? '')} disabled={enviando} className="font-semibold underline">
                      Reintentar
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {verRespuestas && (
        <div className="max-h-56 overflow-y-auto border-t border-slate-200 bg-slate-50 p-2">
          {respuestas.length === 0 && (
            <p className="px-2 py-3 text-center text-xs text-slate-500">No hay respuestas rápidas. El administrador las crea en «Respuestas rápidas».</p>
          )}
          {respuestas.map((rr) => (
            <button
              key={rr.id} type="button" onClick={() => usarRespuesta(rr.contenido)}
              className="block w-full rounded-lg px-3 py-2 text-left hover:bg-superficie"
            >
              <span className="text-sm font-medium text-slate-800">{rr.titulo}</span>
              <span className="block truncate text-xs text-slate-500">{rr.contenido}</span>
            </button>
          ))}
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
      <form
        className="flex items-end gap-2 border-t border-slate-200 bg-superficie p-3"
        onSubmit={(e) => { e.preventDefault(); enviar(texto, archivo) }}
      >
        <input
          ref={selector} type="file" accept={TIPOS_ADJUNTO.join(',')} className="hidden"
          onChange={(e) => elegirArchivo(e.target.files?.[0])}
        />
        <button
          type="button" onClick={() => selector.current?.click()} disabled={enviando} title="Adjuntar imagen o PDF"
          aria-label="Adjuntar imagen o PDF"
          className="h-10 shrink-0 rounded-lg border border-slate-300 px-3 text-sm text-slate-600 hover:bg-slate-50"
        >
          📎
        </button>
        <button
          type="button" onClick={() => setVerRespuestas((v) => !v)} title="Respuestas rápidas"
          className={`h-10 shrink-0 rounded-lg border px-3 text-sm ${verRespuestas ? 'border-marca-600 bg-marca-50 text-marca-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
        >
          ⚡
        </button>
        {acciones}
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(texto, archivo) }
          }}
          onPaste={(e) => {
            // Pegar una captura de pantalla (Ctrl+V) la deja lista para enviar
            const imagen = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'))
            if (imagen) { e.preventDefault(); elegirArchivo(imagen) }
          }}
          rows={2}
          maxLength={1500}
          placeholder={archivo ? 'Mensaje para acompañar el archivo (opcional)…' : 'Escribe un mensaje… (Enter para enviar, Shift+Enter para nueva línea)'}
          className="campo resize-none"
          aria-label="Mensaje"
        />
        <button className="boton h-10 shrink-0" disabled={enviando || (!texto.trim() && !archivo)}>
          {enviando ? 'Enviando…' : 'Enviar'}
        </button>
      </form>
      {error && <p role="alert" className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>}
    </section>
  )
}
