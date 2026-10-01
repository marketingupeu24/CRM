'use client'

// Controles interactivos de la ficha del lead.
import { useActionState, useState, useTransition } from 'react'
import { ESTADOS_LEAD, ETIQUETAS_ESTADO, MOTIVOS_PERDIDA, type Lead, type LeadEstado } from '@crm/db'
import {
  actualizarDatos, agregarNota, cambiarEstado, eliminarNota, reasignarAsesor, type Resultado,
} from '../acciones'

function Mensaje({ resultado, textoOk }: { resultado: Resultado; textoOk?: string }) {
  if (resultado.error) return <p role="alert" className="text-sm text-rose-600">{resultado.error}</p>
  if (resultado.ok && textoOk) return <p className="text-sm text-emerald-600">{textoOk}</p>
  return null
}

export function SelectorEstado({ leadId, estado }: { leadId: string; estado: LeadEstado }) {
  const [nuevo, setNuevo] = useState<LeadEstado>(estado)
  const [motivo, setMotivo] = useState('')
  const [detalle, setDetalle] = useState('')
  const [resultado, setResultado] = useState<Resultado>({})
  const [pendiente, iniciar] = useTransition()
  const pideMotivo = (nuevo === 'lead_perdido' || nuevo === 'lead_no_interesado') && nuevo !== estado
  const motivoFinal = motivo === 'Otro' ? `Otro: ${detalle.trim() || 'sin detalle'}` : motivo

  return (
    <div className="space-y-3">
      <select value={nuevo} onChange={(e) => { setNuevo(e.target.value as LeadEstado); setResultado({}) }} className="campo">
        {ESTADOS_LEAD.map((e) => <option key={e} value={e}>{ETIQUETAS_ESTADO[e]}</option>)}
      </select>
      {pideMotivo && (
        <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className="campo" aria-label="Motivo">
          <option value="" disabled>Elige el motivo…</option>
          {MOTIVOS_PERDIDA.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      )}
      {pideMotivo && motivo === 'Otro' && (
        <input value={detalle} onChange={(e) => setDetalle(e.target.value)} maxLength={150} placeholder="Detalle del motivo" className="campo" />
      )}
      <button
        className="boton w-full" disabled={pendiente || nuevo === estado || (pideMotivo && !motivo)}
        onClick={() => iniciar(async () => setResultado(await cambiarEstado(leadId, nuevo, pideMotivo ? motivoFinal : undefined)))}
      >
        {pendiente ? 'Guardando…' : 'Cambiar estado'}
      </button>
      <Mensaje resultado={resultado} textoOk="Estado actualizado." />
    </div>
  )
}

export function FormularioNota({ leadId }: { leadId: string }) {
  const [resultado, accion, enviando] = useActionState<Resultado, FormData>(agregarNota.bind(null, leadId), {})
  return (
    <form action={accion} className="space-y-3">
      <textarea name="nota" rows={3} required maxLength={2000} placeholder="Ej.: Llamé, pidió información de becas. Volver a llamar el lunes." className="campo" />
      <button className="boton w-full" disabled={enviando}>{enviando ? 'Guardando…' : 'Agregar nota'}</button>
      <Mensaje resultado={resultado} />
    </form>
  )
}

export function BotonEliminarNota({ leadId, notaId }: { leadId: string; notaId: number }) {
  const [pendiente, iniciar] = useTransition()
  return (
    <button
      disabled={pendiente}
      onClick={() => {
        if (confirm('¿Eliminar esta nota?')) iniciar(async () => { const r = await eliminarNota(leadId, notaId); if (r.error) alert(r.error) })
      }}
      className="text-xs text-slate-400 hover:text-rose-600"
    >
      {pendiente ? 'Eliminando…' : 'Eliminar'}
    </button>
  )
}

export function ReasignarAsesor(
  { leadId, asesorId, asesores }: { leadId: string; asesorId: string | null; asesores: { id: string; nombre: string; activo: boolean }[] },
) {
  const [nuevo, setNuevo] = useState(asesorId ?? '')
  const [resultado, setResultado] = useState<Resultado>({})
  const [pendiente, iniciar] = useTransition()
  return (
    <div className="space-y-3">
      <select value={nuevo} onChange={(e) => { setNuevo(e.target.value); setResultado({}) }} className="campo">
        <option value="" disabled>Elegir asesor…</option>
        {asesores.map((a) => <option key={a.id} value={a.id}>{a.nombre}{a.activo ? '' : ' (inactivo)'}</option>)}
      </select>
      <button
        className="boton-secundario w-full" disabled={pendiente || !nuevo || nuevo === asesorId}
        onClick={() => iniciar(async () => setResultado(await reasignarAsesor(leadId, nuevo)))}
      >
        {pendiente ? 'Guardando…' : asesorId ? 'Reasignar' : 'Asignar'}
      </button>
      <Mensaje resultado={resultado} textoOk="Asesor actualizado." />
    </div>
  )
}

export function EditarDatos({ lead }: { lead: Lead }) {
  const [abierto, setAbierto] = useState(false)
  const [resultado, accion, enviando] = useActionState<Resultado, FormData>(actualizarDatos.bind(null, lead.id), {})

  if (!abierto) {
    return <button onClick={() => setAbierto(true)} className="text-sm font-medium text-marca-700 hover:underline">Editar datos</button>
  }
  const campos: [keyof Lead, string][] = [
    ['nombre', 'Nombre'], ['dni', 'DNI'], ['carrera_interes', 'Carrera'], ['modalidad', 'Modalidad'],
    ['convocatoria', 'Convocatoria'], ['sede', 'Sede'],
  ]
  return (
    <form action={accion} className="mt-4 grid gap-3 sm:grid-cols-2">
      {campos.map(([campo, etiqueta]) => (
        <label key={campo} className="text-sm text-slate-600">
          {etiqueta}
          <input name={campo} defaultValue={(lead[campo] as string | null) ?? ''} className="campo mt-1" />
        </label>
      ))}
      <div className="flex items-center gap-2 sm:col-span-2">
        <button className="boton" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" onClick={() => setAbierto(false)} className="boton-secundario">Cerrar</button>
        <Mensaje resultado={resultado} textoOk="Datos guardados." />
      </div>
    </form>
  )
}
