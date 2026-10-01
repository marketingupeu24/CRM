'use client'

// Chat de WhatsApp del lead: mensajes del lead, respuestas de Genesys y del asesor.
// Se actualiza en tiempo real (Supabase Realtime respeta el RLS del usuario).
import { useEffect, useRef, useState } from 'react'
import type { LeadInteraccion } from '@crm/db'
import { esDelChat } from '@/lib/chat'
import { crearClienteNavegador } from '@/lib/supabase/client'

export type MensajeChat = LeadInteraccion & { autor_nombre?: string | null }

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
}

export function Conversacion(
  { leadId, telefono, inicial, miNombre, nombresAutores, encabezado, respuestas = [], variables }: Props,
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
  const [error, setError] = useState<string | null>(null)
  const [enVivo, setEnVivo] = useState(false)
  const fondo = useRef<HTMLDivElement>(null)

  const agregar = (m: MensajeChat) =>
    setMensajes((previos) => (previos.some((p) => p.id === m.id) ? previos : [...previos, m]))

  // Mensajes nuevos en tiempo real
  useEffect(() => {
    const supabase = crearClienteNavegador()
    const canal = supabase
      .channel(`chat-${leadId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'lead_interacciones', filter: `lead_id=eq.${leadId}` },
        (payload) => {
          const m = payload.new as MensajeChat
          if (esDelChat(m)) agregar(m)
        },
      )
      .subscribe((estado, err) => {
        setEnVivo(estado === 'SUBSCRIBED')
        if (err) console.warn('[chat] tiempo real:', estado, err.message)
      })
    return () => { supabase.removeChannel(canal) }
  }, [leadId])

  // Bajar al último mensaje
  useEffect(() => {
    fondo.current?.scrollTo({ top: fondo.current.scrollHeight, behavior: 'smooth' })
  }, [mensajes.length])

  async function enviar(contenido: string) {
    const limpio = contenido.trim()
    if (!limpio || enviando) return
    setEnviando(true)
    setError(null)
    const supabase = crearClienteNavegador()
    const { data, error: fallo } = await supabase.functions.invoke('chat', { body: { lead_id: leadId, texto: limpio } })
    let respuesta = data as { ok?: boolean; error?: string; mensaje?: MensajeChat } | null
    if (fallo && 'context' in fallo && fallo.context instanceof Response) {
      respuesta = await fallo.context.json().catch(() => null)
    }
    if (respuesta?.mensaje) agregar({ ...respuesta.mensaje, autor_nombre: miNombre })
    if (respuesta?.ok) setTexto('')
    else setError(respuesta?.error ?? 'No se pudo enviar el mensaje. Revisa tu conexión.')
    setEnviando(false)
  }

  const nombreAutor = (m: MensajeChat) =>
    m.autor_nombre ?? (m.autor_id ? nombresAutores[m.autor_id] : undefined) ?? 'Asesor'

  return (
    <section className="tarjeta flex flex-col overflow-hidden" id="chat">
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
      <div ref={fondo} className="h-[28rem] space-y-2 overflow-y-auto bg-[#efeae2] px-4 py-4">
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
                  propio ? (fallido ? 'bg-rose-100' : 'bg-[#d9fdd3]') : bot ? 'bg-slate-100' : 'bg-white'
                }`}
              >
                <p className="mb-0.5 text-[11px] font-semibold text-slate-500">
                  {propio ? nombreAutor(m) : bot ? 'Genesys (bot)' : 'Lead'}
                </p>
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
              className="block w-full rounded-lg px-3 py-2 text-left hover:bg-white"
            >
              <span className="text-sm font-medium text-slate-800">{rr.titulo}</span>
              <span className="block truncate text-xs text-slate-500">{rr.contenido}</span>
            </button>
          ))}
        </div>
      )}
      <form
        className="flex items-end gap-2 border-t border-slate-200 bg-white p-3"
        onSubmit={(e) => { e.preventDefault(); enviar(texto) }}
      >
        <button
          type="button" onClick={() => setVerRespuestas((v) => !v)} title="Respuestas rápidas"
          className={`h-10 shrink-0 rounded-lg border px-3 text-sm ${verRespuestas ? 'border-marca-600 bg-marca-50 text-marca-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
        >
          ⚡
        </button>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(texto) }
          }}
          rows={2}
          maxLength={1500}
          placeholder="Escribe un mensaje… (Enter para enviar, Shift+Enter para nueva línea)"
          className="campo resize-none"
          aria-label="Mensaje"
        />
        <button className="boton h-10 shrink-0" disabled={enviando || !texto.trim()}>
          {enviando ? 'Enviando…' : 'Enviar'}
        </button>
      </form>
      {error && <p role="alert" className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>}
    </section>
  )
}
