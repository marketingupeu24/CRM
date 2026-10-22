'use client'

// Ventana de 24 h de WhatsApp (API oficial de Meta): después del último mensaje del alumno se le puede
// responder libremente durante 24 horas; pasado ese tiempo solo con una plantilla aprobada.
// Muestra cuánto tiempo queda (se actualiza cada minuto).
import { useEffect, useState } from 'react'

const VENTANA_MS = 24 * 3_600_000
/** Menos de esto: "por cerrarse" (ámbar) */
const AVISO_MS = 4 * 3_600_000

export type EstadoVentana = 'abierta' | 'por_cerrar' | 'cerrada' | 'sin_mensajes'

export function estadoVentana(ultimoMensajeAlumno: string | null | undefined, ahora: number) {
  if (!ultimoMensajeAlumno) return { estado: 'sin_mensajes' as EstadoVentana, restante: 0, desdeCierre: 0 }
  const restante = Date.parse(ultimoMensajeAlumno) + VENTANA_MS - ahora
  if (restante <= 0) return { estado: 'cerrada' as EstadoVentana, restante: 0, desdeCierre: -restante }
  return { estado: (restante < AVISO_MS ? 'por_cerrar' : 'abierta') as EstadoVentana, restante, desdeCierre: 0 }
}

function duracion(ms: number, corto = false) {
  const min = Math.max(1, Math.round(ms / 60_000))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h >= 48) return `${Math.floor(h / 24)} días`
  const m = min % 60
  return corto || !m || h >= 10 ? `${h} h` : `${h} h ${m} min`
}

/** Reloj que se actualiza cada minuto (empieza en 0 en el servidor y se fija al montar). */
function useAhora() {
  const [ahora, setAhora] = useState(0)
  useEffect(() => {
    const tic = () => setAhora(Date.now())
    const primero = setTimeout(tic, 0)
    const id = setInterval(tic, 60_000)
    return () => { clearTimeout(primero); clearInterval(id) }
  }, [])
  return ahora
}

const AYUDA = 'WhatsApp deja responderle libremente al alumno hasta 24 horas después de su último mensaje. Después, solo con una plantilla aprobada por Meta (o cuando vuelva a escribir).'

const ESTILO: Record<EstadoVentana, string> = {
  abierta: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  por_cerrar: 'bg-amber-50 text-amber-800 ring-amber-300',
  cerrada: 'bg-rose-50 text-rose-700 ring-rose-200',
  sin_mensajes: 'bg-slate-100 text-slate-600 ring-slate-200',
}

/**
 * variante "chip": "⏳ Quedan 18 h para responder" (cabecera del chat)
 * variante "mini": "⏳ 18 h" (bandeja y lista de chats)
 */
export function VentanaWhatsApp({ ultimoMensajeAlumno, variante = 'chip' }: { ultimoMensajeAlumno: string | null | undefined; variante?: 'chip' | 'mini' }) {
  const ahora = useAhora()
  if (!ahora) return null
  const v = estadoVentana(ultimoMensajeAlumno, ahora)
  if (variante === 'mini' && (v.estado === 'sin_mensajes' || (v.estado === 'cerrada' && v.desdeCierre > 7 * 24 * 3_600_000))) return null
  const texto = variante === 'mini'
    ? v.estado === 'cerrada' ? '🔒' : v.estado === 'sin_mensajes' ? '' : `${v.estado === 'por_cerrar' ? '⚠️' : '⏳'} ${duracion(v.restante, true)}`
    : v.estado === 'cerrada' ? `🔒 Ventana cerrada hace ${duracion(v.desdeCierre, true)}`
    : v.estado === 'sin_mensajes' ? '🔒 Aún no te escribe'
    : `${v.estado === 'por_cerrar' ? '⚠️' : '⏳'} Quedan ${duracion(v.restante)} para responder`
  const titulo = v.estado === 'cerrada' || v.estado === 'sin_mensajes'
    ? `Pasaron más de 24 h desde su último mensaje (o aún no escribe): WhatsApp solo entrega plantillas aprobadas. ${AYUDA}`
    : `Tiempo para responderle libremente por WhatsApp. ${AYUDA}`
  return (
    <span title={titulo} className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 font-medium whitespace-nowrap ring-1 ring-inset ${variante === 'mini' ? 'text-[10px]' : 'text-xs'} ${ESTILO[v.estado]}`}>
      {texto}
    </span>
  )
}

/** "hoy 10:42 a. m.", "mañana 9:00 a. m." o "lun 27/10, 9:00 a. m." (hora de Lima) */
export function cuandoCierra(ms: number, ahora: number) {
  const dia = (t: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date(t))
  const hora = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: 'numeric', minute: '2-digit' }).format(new Date(ms))
  if (dia(ms) === dia(ahora)) return `hoy ${hora}`
  if (dia(ms) === dia(ahora + 86_400_000)) return `mañana ${hora}`
  if (dia(ms) === dia(ahora - 86_400_000)) return `ayer ${hora}`
  return `${new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(ms))}, ${hora}`
}

/** true si mandar un mensaje normal ahora puede no llegar (ventana cerrada o el alumno nunca escribió). */
export function ventanaCerrada(ultimoMensajeAlumno: string | null | undefined) {
  const e = estadoVentana(ultimoMensajeAlumno, Date.now()).estado
  return e === 'cerrada' || e === 'sin_mensajes'
}

/**
 * Barra destacada sobre el cuadro de texto (siempre visible): estado de la ventana de 24 h con la hora
 * exacta de cierre y una barra de progreso. Verde (abierta), ámbar que late (menos de 4 h) y roja (cerrada).
 */
export function BarraVentana({ ultimoMensajeAlumno }: { ultimoMensajeAlumno: string | null | undefined }) {
  const ahora = useAhora()
  if (!ahora) return null
  const v = estadoVentana(ultimoMensajeAlumno, ahora)
  const cierre = ultimoMensajeAlumno ? Date.parse(ultimoMensajeAlumno) + VENTANA_MS : 0
  const estilos: Record<EstadoVentana, { caja: string; barra: string; icono: string }> = {
    abierta: { caja: 'border-emerald-400 bg-emerald-50 text-emerald-900', barra: 'bg-emerald-500', icono: '✅' },
    por_cerrar: { caja: 'border-amber-500 bg-amber-100 text-amber-950', barra: 'bg-amber-500', icono: '⚠️' },
    cerrada: { caja: 'border-rose-500 bg-rose-100 text-rose-900', barra: 'bg-rose-500', icono: '🔒' },
    sin_mensajes: { caja: 'border-rose-500 bg-rose-100 text-rose-900', barra: 'bg-rose-500', icono: '🔒' },
  }
  const e = estilos[v.estado]
  const titulo = v.estado === 'abierta' ? 'Puedes responderle por WhatsApp'
    : v.estado === 'por_cerrar' ? '¡Respóndele pronto! La ventana de WhatsApp se está cerrando'
    : v.estado === 'cerrada' ? 'Ventana de WhatsApp cerrada: no le escribas un mensaje normal'
    : 'El alumno aún no te escribe: no le escribas primero un mensaje normal'
  const detalle = v.estado === 'abierta' || v.estado === 'por_cerrar'
    ? `Puedes escribirle libremente hasta ${cuandoCierra(cierre, ahora)}. Después solo con plantilla aprobada.`
    : v.estado === 'cerrada'
      ? `Se cerró ${cuandoCierra(cierre, ahora)} (24 h después de su último mensaje). WhatsApp no lo entregará: usa una plantilla aprobada o espera a que te escriba.`
      : 'WhatsApp no entrega mensajes normales a quien no escribió antes: usa una plantilla aprobada o espera a que te escriba.'
  return (
    <div role="status" aria-live="polite" title={AYUDA} className={`flex items-center gap-3 border-t-2 px-3 py-2 ${e.caja}`}>
      <span className={`text-xl leading-none ${v.estado === 'por_cerrar' ? 'animate-pulse' : ''}`} aria-hidden>{e.icono}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-tight font-semibold">{titulo}</p>
        <p className="text-xs leading-snug opacity-90">{detalle}</p>
        {(v.estado === 'abierta' || v.estado === 'por_cerrar') && (
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/70" aria-hidden>
            <div className={`h-full rounded-full ${e.barra}`} style={{ width: `${Math.max(3, (v.restante / VENTANA_MS) * 100)}%` }} />
          </div>
        )}
      </div>
      {(v.estado === 'abierta' || v.estado === 'por_cerrar') && (
        <div className="shrink-0 text-right leading-tight">
          <p className="text-lg font-bold tabular-nums">{duracion(v.restante)}</p>
          <p className="text-[10px] tracking-wide uppercase opacity-80">quedan</p>
        </div>
      )}
    </div>
  )
}

/** Para el panel de detalles de la ficha: chip + hora exacta de cierre. */
export function VentanaDetalle({ ultimoMensajeAlumno }: { ultimoMensajeAlumno: string | null | undefined }) {
  const ahora = useAhora()
  if (!ahora) return null
  const v = estadoVentana(ultimoMensajeAlumno, ahora)
  const cierre = ultimoMensajeAlumno ? Date.parse(ultimoMensajeAlumno) + VENTANA_MS : 0
  return (
    <div className="space-y-1">
      <VentanaWhatsApp ultimoMensajeAlumno={ultimoMensajeAlumno} />
      <p className="text-xs text-slate-500">
        {v.estado === 'sin_mensajes' ? 'Aún no escribe: no se le puede escribir primero sin plantilla.'
          : v.estado === 'cerrada' ? `Se cerró ${cuandoCierra(cierre, ahora)}. Se reabre cuando el alumno vuelva a escribir.`
          : `Puedes escribirle libremente hasta ${cuandoCierra(cierre, ahora)}.`}
      </p>
    </div>
  )
}
