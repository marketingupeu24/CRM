'use client'

// Ausencia temporal de un usuario (viaje, permiso): por horas, días o entre dos fechas.
// La usa "Mi cuenta" (la propia) y "Usuarios" (la de cualquiera, para el admin).
import { useActionState, useState, useTransition } from 'react'
import { useConfirmar } from '@/components/Confirmacion'
import { programarAusencia, terminarAusencia, type ResultadoAusencia } from '@/app/(panel)/cuenta/ausencia'

export interface DatosAusencia {
  id: string
  nombre: string
  ausente_desde: string | null
  ausente_hasta: string | null
  ausente_motivo: string | null
  ausente_reemplazo: string | null
  ausencia_activa: boolean
}

const DURACIONES = [
  { valor: '4h', texto: '4 horas' },
  { valor: '1d', texto: '1 día' },
  { valor: '2d', texto: '2 días' },
  { valor: '3d', texto: '3 días' },
  { valor: '7d', texto: '1 semana' },
  { valor: 'fechas', texto: 'Elegir fechas' },
]

const formato = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const fecha = (iso: string | null) => (iso ? formato.format(new Date(iso)) : '—')

/** Ahora en hora de Perú, para el valor inicial de los campos de fecha ("2026-10-07T16:30") */
function ahoraLima(masHoras = 0): string {
  const d = new Date(Date.now() + masHoras * 3_600_000)
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .format(d).replace(' ', 'T')
}

export function Ausencia({ asesor, reemplazos, compacto = false }: {
  asesor: DatosAusencia
  reemplazos: { id: string; nombre: string }[]
  /** En la tabla de usuarios: el formulario va plegado */
  compacto?: boolean
}) {
  const confirmar = useConfirmar()
  const [r, accion, guardando] = useActionState<ResultadoAusencia, FormData>(programarAusencia.bind(null, asesor.id), {})
  const [rFin, setRFin] = useState<ResultadoAusencia>({})
  const [terminando, iniciar] = useTransition()
  const [duracion, setDuracion] = useState('1d')
  const opciones = reemplazos.filter((p) => p.id !== asesor.id)
  const reemplazo = reemplazos.find((p) => p.id === asesor.ausente_reemplazo)?.nombre

  const terminar = async () => {
    const ok = await confirmar({
      titulo: asesor.ausencia_activa ? '¿Terminar la ausencia ahora?' : '¿Cancelar la ausencia programada?',
      mensaje: asesor.ausencia_activa ? 'Vuelve a recibir leads como antes y los avisos de sus clientes le llegan otra vez.' : undefined,
      confirmar: asesor.ausencia_activa ? 'Terminar ausencia' : 'Cancelar ausencia',
      cancelar: 'Volver',
    })
    if (ok) iniciar(async () => setRFin(await terminarAusencia(asesor.id)))
  }

  const estado = asesor.ausente_hasta && (
    <div className={`rounded-lg px-3 py-2 text-sm ${asesor.ausencia_activa ? 'bg-amber-50 text-amber-800' : 'bg-sky-50 text-sky-800'}`}>
      <p>
        🧳 <b>{asesor.ausencia_activa ? 'Ausente' : 'Ausencia programada'}</b>
        {asesor.ausente_motivo ? ` (${asesor.ausente_motivo})` : ''}: {fecha(asesor.ausente_desde)} → {fecha(asesor.ausente_hasta)}
      </p>
      <p className="mt-0.5 text-xs">{reemplazo ? <>Lo cubre <b>{reemplazo}</b>: ve sus chats y le llegan los avisos.</> : 'Sin reemplazo: los avisos le siguen llegando a él/ella.'}</p>
      <button type="button" onClick={terminar} disabled={terminando} className="mt-2 text-xs font-medium underline disabled:opacity-60">
        {terminando ? 'Guardando…' : asesor.ausencia_activa ? 'Terminar ausencia ahora' : 'Cancelar ausencia'}
      </button>
    </div>
  )

  const formulario = (
    <form action={accion} className="space-y-3">
      <fieldset>
        <legend className="mb-1.5 text-sm text-slate-600">¿Cuánto tiempo?</legend>
        <div className="flex flex-wrap gap-1.5">
          {DURACIONES.map((d) => (
            <label key={d.valor} className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium ${duracion === d.valor ? 'border-marca-600 bg-marca-600 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
              <input type="radio" name="duracion" value={d.valor} checked={duracion === d.valor} onChange={() => setDuracion(d.valor)} className="sr-only" />
              {d.texto}
            </label>
          ))}
        </div>
      </fieldset>
      {duracion === 'fechas' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-slate-600">Desde
            <input type="datetime-local" name="desde" defaultValue={ahoraLima()} className="campo mt-1" />
          </label>
          <label className="text-sm text-slate-600">Hasta (regreso) *
            <input type="datetime-local" name="hasta" required defaultValue={ahoraLima(72)} className="campo mt-1" />
          </label>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-slate-600">¿Quién te cubre? (recomendado)
          <select name="reemplazo" defaultValue={asesor.ausente_reemplazo ?? ''} className="campo mt-1">
            <option value="">Nadie</option>
            {opciones.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </label>
        <label className="text-sm text-slate-600">Motivo (opcional)
          <input name="motivo" maxLength={120} placeholder="Viaje, permiso…" defaultValue={asesor.ausente_motivo ?? ''} className="campo mt-1" />
        </label>
      </div>
      <button type="submit" disabled={guardando} className="boton">
        {guardando ? 'Guardando…' : asesor.ausente_hasta ? 'Actualizar ausencia' : duracion === 'fechas' ? 'Programar ausencia' : 'Activar ausencia'}
      </button>
    </form>
  )

  const mensaje = (x: ResultadoAusencia) => x.error
    ? <p role="alert" className="text-sm text-rose-600">{x.error}</p>
    : x.ok ? <p className="text-sm text-emerald-600">{x.ok}</p> : null

  return (
    <div className="space-y-3">
      {estado}
      {compacto ? (
        <details>
          <summary className="cursor-pointer text-xs font-medium text-marca-700">{asesor.ausente_hasta ? 'Cambiar ausencia' : '🧳 Programar ausencia'}</summary>
          <div className="mt-3">{formulario}</div>
        </details>
      ) : formulario}
      {mensaje(r)}
      {mensaje(rFin)}
    </div>
  )
}
