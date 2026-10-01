'use client'

import { useActionState, useState, useTransition } from 'react'
import { ORIGENES } from '@crm/db'
import type { Campana } from '@/lib/periodos'
import { cambiarActiva, eliminarCampana, guardarCampana, type Resultado } from './acciones'

function Mensaje({ r }: { r: Resultado }) {
  if (r.error) return <p role="alert" className="text-sm text-rose-600">{r.error}</p>
  if (r.ok) return <p className="text-sm text-emerald-600">{r.ok}</p>
  return null
}

export function FormularioCampana({ campana, alGuardar }: { campana?: Campana; alGuardar?: () => void }) {
  const [r, accion, guardando] = useActionState<Resultado, FormData>(
    async (previo, formData) => {
      const resultado = await guardarCampana(campana?.id ?? null, previo, formData)
      if (resultado.ok) alGuardar?.()
      return resultado
    },
    {},
  )

  return (
    <form action={accion} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm text-slate-600 sm:col-span-2">Nombre
        <input name="nombre" required maxLength={80} defaultValue={campana?.nombre} placeholder="Ej.: Facebook Admisión 2026-2" className="campo mt-1" />
      </label>
      <label className="text-sm text-slate-600 sm:col-span-2">Origen (opcional)
        <select name="origen" defaultValue={campana?.origen ?? ''} className="campo mt-1">
          <option value="">Todos los orígenes (solo por fechas)</option>
          {ORIGENES.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
      <label className="text-sm text-slate-600">Inicio
        <input type="date" name="inicio" required defaultValue={campana?.inicio} className="campo mt-1" />
      </label>
      <label className="text-sm text-slate-600">Fin
        <input type="date" name="fin" required defaultValue={campana?.fin} className="campo mt-1" />
      </label>
      <div className="flex flex-wrap items-end gap-3 sm:col-span-2">
        <button className="boton" disabled={guardando}>{guardando ? 'Guardando…' : campana ? 'Guardar cambios' : 'Crear campaña'}</button>
        <Mensaje r={r} />
      </div>
    </form>
  )
}

export function AccionesCampana({ campana }: { campana: Campana }) {
  const [editando, setEditando] = useState(false)
  const [r, setR] = useState<Resultado>({})
  const [pendiente, iniciar] = useTransition()

  return (
    <>
      <div className="flex gap-3 text-xs font-medium">
        <button onClick={() => setEditando(!editando)} className="text-marca-700 hover:underline">{editando ? 'Cerrar' : 'Editar'}</button>
        <button disabled={pendiente} onClick={() => iniciar(async () => setR(await cambiarActiva(campana.id, !campana.activa)))} className="text-slate-500 hover:underline">
          {campana.activa ? 'Archivar' : 'Activar'}
        </button>
        <button
          disabled={pendiente} className="text-rose-600 hover:underline"
          onClick={() => { if (confirm(`¿Eliminar la campaña "${campana.nombre}"? Los leads no se borran.`)) iniciar(async () => setR(await eliminarCampana(campana.id))) }}
        >
          Eliminar
        </button>
      </div>
      {editando && <div className="mt-4"><FormularioCampana campana={campana} alGuardar={() => setEditando(false)} /></div>}
      <Mensaje r={r} />
    </>
  )
}
