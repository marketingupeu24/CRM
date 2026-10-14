'use client'

import { useActionState, useOptimistic, useState, useTransition } from 'react'
import type { RespuestaRapida } from '@crm/db'
import { useConfirmar } from '@/components/Confirmacion'
import { cambiarActiva, cambiarPara, cambiarUso, eliminarRespuesta, guardarRespuesta, type Resultado } from './acciones'

export interface AsesorOpcion { id: string; nombre: string }

function Mensaje({ r }: { r: Resultado }) {
  if (r.error) return <p role="alert" className="text-sm text-rose-600">{r.error}</p>
  if (r.ok) return <p className="text-sm text-emerald-600">{r.ok}</p>
  return null
}

/** Selector "para quién" del formulario (solo quien administra las respuestas). */
function SelectorPara({ valor, asesores, miId }: { valor: string; asesores: AsesorOpcion[]; miId: string }) {
  return (
    <select name="para" defaultValue={valor} className="campo mt-1" aria-label="Para quién">
      <option value="todos">👥 Para todos</option>
      <option value={miId}>👤 Personal (mía)</option>
      {asesores.filter((a) => a.id !== miId).map((a) => <option key={a.id} value={a.id}>👤 Personal de {a.nombre}</option>)}
    </select>
  )
}

export function FormularioRespuesta({ respuesta, alGuardar, admin, asesores, miId }: {
  respuesta?: RespuestaRapida; alGuardar?: () => void; admin: boolean; asesores: AsesorOpcion[]; miId: string
}) {
  const [r, accion, guardando] = useActionState<Resultado, FormData>(
    async (previo, formData) => {
      const resultado = await guardarRespuesta(respuesta?.id ?? null, previo, formData)
      if (resultado.ok) alGuardar?.()
      return resultado
    },
    {},
  )

  return (
    <form action={accion} className={`grid gap-3 ${admin ? 'sm:grid-cols-[1fr_14rem_6rem]' : 'sm:grid-cols-[1fr_6rem]'}`}>
      <label className="text-sm text-slate-600">Título
        <input name="titulo" required maxLength={80} defaultValue={respuesta?.titulo} placeholder="Ej.: Costos de pensión" className="campo mt-1" />
      </label>
      {admin && (
        <label className="text-sm text-slate-600">Para quién
          <SelectorPara valor={respuesta ? (respuesta.asesor_id ?? 'todos') : 'todos'} asesores={asesores} miId={miId} />
        </label>
      )}
      <label className="text-sm text-slate-600">Orden
        <input name="orden" type="number" defaultValue={respuesta?.orden ?? 100} className="campo mt-1" />
      </label>
      <label className={`text-sm text-slate-600 ${admin ? 'sm:col-span-3' : 'sm:col-span-2'}`}>Mensaje
        <textarea
          name="contenido" required maxLength={1500} rows={4} defaultValue={respuesta?.contenido}
          placeholder="Hola {nombre}, la pensión de {carrera} es…" className="campo mt-1"
        />
      </label>
      <div className={`flex flex-wrap items-center gap-3 ${admin ? 'sm:col-span-3' : 'sm:col-span-2'}`}>
        <button className="boton" disabled={guardando}>{guardando ? 'Guardando…' : respuesta ? 'Guardar cambios' : 'Crear respuesta'}</button>
        <Mensaje r={r} />
      </div>
    </form>
  )
}

export function FilaRespuesta({ respuesta, usada, puedeEditar, admin, asesores, miId, duenio }: {
  respuesta: RespuestaRapida
  /** La usa en su chat (no la ocultó) */
  usada: boolean
  /** Es suya o administra las respuestas */
  puedeEditar: boolean
  admin: boolean
  asesores: AsesorOpcion[]
  miId: string
  /** Nombre del dueño, para las personales de otros */
  duenio?: string
}) {
  const [editando, setEditando] = useState(false)
  const [r, setR] = useState<Resultado>({})
  const [pendiente, iniciar] = useTransition()
  const confirmar = useConfirmar()
  const ejecutar = (accion: () => Promise<Resultado>) => iniciar(async () => setR(await accion()))
  // La casilla cambia al instante; si falla, vuelve sola al valor del servidor
  const [usadaVista, setUsadaVista] = useOptimistic(usada)
  const deOtro = !!respuesta.asesor_id && respuesta.asesor_id !== miId

  return (
    <li className={`px-5 py-4 ${respuesta.activa && (usadaVista || deOtro) ? '' : 'bg-slate-50 opacity-70'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {respuesta.titulo}
            {!respuesta.activa && <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">Inactiva</span>}
            {duenio && <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-xs text-violet-700">👤 {duenio}</span>}
          </p>
          {!editando && <p className="mt-1 text-sm whitespace-pre-wrap text-slate-600">{respuesta.contenido}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
          {!deOtro && respuesta.activa && (
            <label className="flex cursor-pointer items-center gap-1.5 text-slate-700" title="Si la desmarcas, no sale en tu chat (⚡ y /)">
              <input
                type="checkbox" checked={usadaVista} disabled={pendiente}
                onChange={(e) => { const usar = e.target.checked; iniciar(async () => { setUsadaVista(usar); setR(await cambiarUso(respuesta.id, usar)) }) }}
                className="h-4 w-4 accent-marca-600"
              />
              La uso
            </label>
          )}
          {admin && (
            <select
              value={respuesta.asesor_id ?? 'todos'} disabled={pendiente} aria-label="Para quién"
              onChange={(e) => ejecutar(() => cambiarPara(respuesta.id, e.target.value))}
              className="rounded border border-slate-300 bg-superficie px-1.5 py-0.5 text-xs"
            >
              <option value="todos">👥 Para todos</option>
              <option value={miId}>👤 Personal (mía)</option>
              {asesores.filter((a) => a.id !== miId).map((a) => <option key={a.id} value={a.id}>👤 {a.nombre}</option>)}
            </select>
          )}
          {puedeEditar && (
            <>
              <button onClick={() => setEditando(!editando)} className="text-marca-700 hover:underline">{editando ? 'Cerrar' : 'Editar'}</button>
              {(admin || respuesta.asesor_id === miId) && (
                <button disabled={pendiente} onClick={() => ejecutar(() => cambiarActiva(respuesta.id, !respuesta.activa))} className="text-slate-500 hover:underline">
                  {respuesta.activa ? 'Desactivar' : 'Activar'}
                </button>
              )}
              <button
                disabled={pendiente} className="text-rose-600 hover:underline"
                onClick={async () => {
                  const mensaje = respuesta.asesor_id ? `"${respuesta.titulo}" se eliminará.` : `"${respuesta.titulo}" dejará de aparecer en el chat de todos.`
                  if (await confirmar({ titulo: '¿Eliminar esta respuesta rápida?', mensaje, confirmar: 'Eliminar', peligro: true })) {
                    ejecutar(() => eliminarRespuesta(respuesta.id))
                  }
                }}
              >
                Eliminar
              </button>
            </>
          )}
        </div>
      </div>
      {editando && (
        <div className="mt-3">
          <FormularioRespuesta respuesta={respuesta} alGuardar={() => setEditando(false)} admin={admin} asesores={asesores} miId={miId} />
        </div>
      )}
      <Mensaje r={r} />
    </li>
  )
}
