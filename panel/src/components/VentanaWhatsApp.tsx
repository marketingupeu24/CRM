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

/** Aviso sobre el cuadro de texto cuando la ventana está cerrada: el mensaje puede no llegar. */
export function AvisoVentanaCerrada({ ultimoMensajeAlumno }: { ultimoMensajeAlumno: string | null | undefined }) {
  const ahora = useAhora()
  if (!ahora) return null
  const v = estadoVentana(ultimoMensajeAlumno, ahora)
  if (v.estado !== 'cerrada' && v.estado !== 'sin_mensajes') return null
  return (
    <p className="border-t border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-700">
      🔒 {v.estado === 'cerrada' ? 'Pasaron más de 24 h desde el último mensaje del alumno' : 'El alumno aún no te ha escrito'}: WhatsApp puede no entregar
      un mensaje normal. Usa una plantilla aprobada o espera a que te escriba.
    </p>
  )
}
