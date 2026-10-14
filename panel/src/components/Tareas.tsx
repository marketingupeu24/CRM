'use client'

// Tareas ("próxima acción"): formulario para agendar y botones de cada tarea.
import { useState, useTransition } from 'react'
import { completarTarea, crearTarea, eliminarTarea, posponerTarea, type Resultado } from '@/app/(panel)/pendientes/acciones'
import { useAviso, useConfirmar } from '@/components/Confirmacion'

/** Fecha para <input type="datetime-local"> en la hora local del navegador. */
function aInputLocal(fecha: Date): string {
  const d = new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60_000)
  return d.toISOString().slice(0, 16)
}

function manana9(): Date {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  return d
}

/** 1 de marzo del próximo año, 9 am: inicio del año escolar. */
function marzoProximoAnio(): Date {
  return new Date(new Date().getFullYear() + 1, 2, 1, 9, 0, 0, 0)
}

/** Inicio de la campaña de la próxima convocatoria (semestre 2): el próximo 1 de mayo, 9 am. */
const MES_PROXIMA_CONVOCATORIA = 4 // mayo (enero = 0)
function proximaConvocatoria(): Date {
  const hoy = new Date()
  const d = new Date(hoy.getFullYear(), MES_PROXIMA_CONVOCATORIA, 1, 9, 0, 0, 0)
  if (d <= hoy) d.setFullYear(d.getFullYear() + 1)
  return d
}

const ATAJOS: { texto: string; calcular: () => Date; titulo?: string }[] = [
  { texto: 'En 2 h', calcular: () => new Date(Date.now() + 2 * 3_600_000) },
  { texto: 'Mañana 9 am', calcular: manana9 },
  { texto: 'En 3 días', calcular: () => { const d = manana9(); d.setDate(d.getDate() + 2); return d } },
  { texto: 'Próxima convocatoria', calcular: proximaConvocatoria, titulo: 'Contactar para la próxima convocatoria' },
  { texto: 'Próximo año', calcular: marzoProximoAnio, titulo: 'Contactar el próximo año' },
]

export function FormularioTarea({ leadId }: { leadId: string }) {
  const [titulo, setTitulo] = useState('')
  const [cuando, setCuando] = useState(() => aInputLocal(manana9()))
  const [resultado, setResultado] = useState<Resultado>({})
  const [pendiente, iniciar] = useTransition()

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        iniciar(async () => {
          const r = await crearTarea(leadId, titulo, new Date(cuando).toISOString())
          setResultado(r)
          if (r.ok) setTitulo('')
        })
      }}
    >
      <input
        value={titulo} onChange={(e) => setTitulo(e.target.value)} required maxLength={300}
        placeholder="Ej.: Llamar para confirmar el examen" className="campo" aria-label="Próxima acción"
      />
      <div className="flex flex-wrap gap-1">
        {ATAJOS.map((a) => (
          <button
            key={a.texto} type="button"
            onClick={() => { setCuando(aInputLocal(a.calcular())); if (a.titulo && !titulo.trim()) setTitulo(a.titulo) }}
            title={a.titulo ? `${a.titulo} (puedes cambiar la fecha antes de agendar)` : undefined}
            className="rounded-full border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
          >
            {a.texto}
          </button>
        ))}
      </div>
      <input type="datetime-local" value={cuando} onChange={(e) => setCuando(e.target.value)} required className="campo" aria-label="Fecha y hora" />
      <button className="boton w-full" disabled={pendiente || !titulo.trim()}>{pendiente ? 'Guardando…' : 'Agendar'}</button>
      {resultado.error && <p role="alert" className="text-sm text-rose-600">{resultado.error}</p>}
      {resultado.ok && <p className="text-sm text-emerald-600">Tarea agendada.</p>}
    </form>
  )
}

export function BotonesTarea({ tareaId, leadId }: { tareaId: number; leadId: string }) {
  const [pendiente, iniciar] = useTransition()
  const confirmar = useConfirmar()
  const avisar = useAviso()
  const ejecutar = (accion: () => Promise<Resultado>) =>
    iniciar(async () => { const r = await accion(); if (r.error) void avisar(r.error) })

  return (
    <div className="flex shrink-0 gap-1 text-xs">
      <button disabled={pendiente} onClick={() => ejecutar(() => completarTarea(tareaId, leadId))} className="rounded bg-emerald-600 px-2 py-0.5 font-semibold text-white hover:brightness-110">
        ✓ Hecho
      </button>
      <button disabled={pendiente} onClick={() => ejecutar(() => posponerTarea(tareaId, leadId))} className="rounded border border-slate-300 px-2 py-0.5 text-slate-600 hover:bg-slate-50" title="Posponer un día">
        +1 día
      </button>
      <button
        disabled={pendiente} title="Eliminar"
        onClick={async () => {
          if (await confirmar({ titulo: '¿Eliminar esta tarea?', confirmar: 'Eliminar', peligro: true })) ejecutar(() => eliminarTarea(tareaId, leadId))
        }}
        className="rounded px-1.5 py-0.5 text-slate-400 hover:text-rose-600"
      >
        ✕
      </button>
    </div>
  )
}
