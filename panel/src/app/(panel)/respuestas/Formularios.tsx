'use client'

import { useActionState, useState, useTransition } from 'react'
import type { RespuestaRapida } from '@crm/db'
import { cambiarActiva, eliminarRespuesta, guardarRespuesta, type Resultado } from './acciones'

function Mensaje({ r }: { r: Resultado }) {
  if (r.error) return <p role="alert" className="text-sm text-rose-600">{r.error}</p>
  if (r.ok) return <p className="text-sm text-emerald-600">{r.ok}</p>
  return null
}

export function FormularioRespuesta({ respuesta, alGuardar }: { respuesta?: RespuestaRapida; alGuardar?: () => void }) {
  const [r, accion, guardando] = useActionState<Resultado, FormData>(
    async (previo, formData) => {
      const resultado = await guardarRespuesta(respuesta?.id ?? null, previo, formData)
      if (resultado.ok) alGuardar?.()
      return resultado
    },
    {},
  )

  return (
    <form action={accion} className="grid gap-3 sm:grid-cols-[1fr_6rem]">
      <label className="text-sm text-slate-600">Título
        <input name="titulo" required maxLength={80} defaultValue={respuesta?.titulo} placeholder="Ej.: Costos de pensión" className="campo mt-1" />
      </label>
      <label className="text-sm text-slate-600">Orden
        <input name="orden" type="number" defaultValue={respuesta?.orden ?? 100} className="campo mt-1" />
      </label>
      <label className="text-sm text-slate-600 sm:col-span-2">Mensaje
        <textarea
          name="contenido" required maxLength={1500} rows={4} defaultValue={respuesta?.contenido}
          placeholder="Hola {nombre}, la pensión de {carrera} es…" className="campo mt-1"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button className="boton" disabled={guardando}>{guardando ? 'Guardando…' : respuesta ? 'Guardar cambios' : 'Crear respuesta'}</button>
        <Mensaje r={r} />
      </div>
    </form>
  )
}

export function FilaRespuesta({ respuesta }: { respuesta: RespuestaRapida }) {
  const [editando, setEditando] = useState(false)
  const [r, setR] = useState<Resultado>({})
  const [pendiente, iniciar] = useTransition()

  return (
    <li className={`px-5 py-4 ${respuesta.activa ? '' : 'bg-slate-50 opacity-70'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {respuesta.titulo}
            {!respuesta.activa && <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">Inactiva</span>}
          </p>
          {!editando && <p className="mt-1 text-sm whitespace-pre-wrap text-slate-600">{respuesta.contenido}</p>}
        </div>
        <div className="flex gap-3 text-xs font-medium">
          <button onClick={() => setEditando(!editando)} className="text-marca-700 hover:underline">{editando ? 'Cerrar' : 'Editar'}</button>
          <button disabled={pendiente} onClick={() => iniciar(async () => setR(await cambiarActiva(respuesta.id, !respuesta.activa)))} className="text-slate-500 hover:underline">
            {respuesta.activa ? 'Desactivar' : 'Activar'}
          </button>
          <button
            disabled={pendiente} className="text-rose-600 hover:underline"
            onClick={() => { if (confirm('¿Eliminar esta respuesta rápida?')) iniciar(async () => setR(await eliminarRespuesta(respuesta.id))) }}
          >
            Eliminar
          </button>
        </div>
      </div>
      {editando && <div className="mt-3"><FormularioRespuesta respuesta={respuesta} alGuardar={() => setEditando(false)} /></div>}
      <Mensaje r={r} />
    </li>
  )
}
