// Un mensaje del chat: separador de día, aviso del sistema o burbuja (alumno, Genesys o asesor) con su hora y checks.
import { Adjunto } from '../Adjunto'
import { diaLima } from '@/lib/texto'
import { etiquetaDia, hora, quien, soloHora, type MensajeChat } from './utilidades'

/**
 * Estado de entrega de un mensaje enviado, como en WhatsApp:
 * - con los avisos de Meta (si BuilderBot los reenvía): ✓✓ gris = entregado, ✓✓ azul = leído, ⚠️ = no se entregó;
 * - sin ellos: ✓✓ azul si el alumno respondió después (le llegó y lo vio), si no ✓ (salió y WhatsApp lo aceptó).
 */
function Checks({ m, ultimoAlumno }: { m: MensajeChat; ultimoAlumno: string | null }) {
  const fecha = (iso: string) => hora(iso)
  if (m.error_entrega) return <span className="font-bold text-rose-600" title={`WhatsApp no lo entregó: ${m.error_entrega}`}> ⚠️</span>
  if (m.leido_at) return <span className="font-bold text-sky-500" title={`Leído ${fecha(m.leido_at)}`}> ✓✓</span>
  if (ultimoAlumno && ultimoAlumno > m.created_at) return <span className="font-bold text-sky-500" title="Le llegó y lo vio: el alumno respondió después"> ✓✓</span>
  if (m.entregado_at) return <span className="font-bold text-slate-500" title={`Entregado ${fecha(m.entregado_at)}`}> ✓✓</span>
  return <span title="Enviado. WhatsApp aún no confirma la entrega"> ✓</span>
}

export function Burbuja({ m, previo, ultimoAlumno, nombreAlumno, nombreAsesor, alReintentar }: {
  m: MensajeChat
  /** Mensaje anterior (para el separador de día y para agrupar mensajes seguidos) */
  previo: MensajeChat | undefined
  /** Último mensaje del alumno: si es posterior, el mensaje del asesor le llegó (✓✓) */
  ultimoAlumno: string | null
  nombreAlumno: string
  nombreAsesor: string
  alReintentar: () => void
}) {
  const dia = diaLima(m.created_at)
  const nuevoDia = !previo || diaLima(previo.created_at) !== dia
  const separador = nuevoDia && (
    <div className="sticky top-0 z-10 my-3 flex justify-center first:mt-0">
      <span className="rounded-full bg-superficie/90 px-3 py-0.5 text-[11px] font-medium text-slate-600 shadow-sm backdrop-blur first-letter:uppercase">{etiquetaDia(dia)}</span>
    </div>
  )
  if (m.tipo === 'sistema') {
    return (
      <div>
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
    <div>
      {separador}
      <div className={`flex ${propio ? 'justify-end' : 'justify-start'} ${mismoGrupo ? 'mt-0.5' : 'mt-3'}`}>
        <div
          className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm shadow-sm md:max-w-[75%] ${propio ? 'rounded-br-md' : 'rounded-bl-md'} ${
            propio ? (fallido ? 'bg-rose-100' : 'bg-burbuja-propia') : bot ? 'bg-slate-100' : 'bg-superficie'
          } ${pendiente ? 'opacity-70' : ''}`}
        >
          {!mismoGrupo && (
            <p className={`mb-0.5 text-[11px] font-semibold ${propio ? 'text-emerald-800' : bot ? 'text-violet-700' : 'text-marca-700'}`}>
              {propio ? nombreAsesor : bot ? '🤖 Genesys' : nombreAlumno}
            </p>
          )}
          {m.adjunto_url && <Adjunto ruta={m.adjunto_url} propio={propio} />}
          <p className="break-words whitespace-pre-wrap text-slate-800">
            {m.contenido}
            {/* Hora (y estado del envío) al final del texto, como en WhatsApp */}
            <span className="float-right mt-1.5 ml-3 text-[10px] leading-none text-slate-500" title={hora(m.created_at)}>
              {soloHora(m.created_at)}
              {propio && (pendiente ? ' 🕓' : fallido ? ' ⚠️' : <Checks m={m} ultimoAlumno={ultimoAlumno} />)}
            </span>
          </p>
          {fallido && (
            <div className="mt-1 flex items-center justify-between gap-3 text-xs text-rose-700">
              <span>No enviado</span>
              <button onClick={alReintentar} className="font-semibold underline">
                Reintentar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
