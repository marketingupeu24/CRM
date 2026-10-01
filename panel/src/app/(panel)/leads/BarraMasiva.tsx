'use client'

// Acciones masivas de la lista de leads. Las casillas las pinta la tabla (servidor) con
// data-lead-sel; esta barra las lee, y aparece cuando hay alguna marcada.
import { useEffect, useState, useTransition } from 'react'
import { ESTADOS_LEAD, ETIQUETAS_ESTADO, MOTIVOS_PERDIDA, type LeadEstado } from '@crm/db'
import { accionMasiva, enviarAPapelera } from './acciones'

const SELECTOR = 'input[data-lead-sel]'

function casillas() {
  return [...document.querySelectorAll<HTMLInputElement>(SELECTOR)]
}

export function BarraMasiva({ asesores, esAdmin = false }: { asesores: { id: string; nombre: string }[]; esAdmin?: boolean }) {
  const [ids, setIds] = useState<string[]>([])
  const [estado, setEstado] = useState<LeadEstado | ''>('')
  const [motivo, setMotivo] = useState('')
  const [asesorId, setAsesorId] = useState('')
  const [aviso, setAviso] = useState<{ texto: string; error?: boolean } | null>(null)
  const [pendiente, iniciar] = useTransition()

  useEffect(() => {
    const leer = () => setIds(casillas().filter((c) => c.checked).map((c) => c.value))
    const alCambiar = (e: Event) => {
      const t = e.target as HTMLInputElement
      if (t.matches?.('input[data-lead-todos]')) casillas().forEach((c) => { c.checked = t.checked })
      if (t.matches?.(`${SELECTOR}, input[data-lead-todos]`)) leer()
    }
    document.addEventListener('change', alCambiar)
    leer()
    return () => document.removeEventListener('change', alCambiar)
  }, [])

  const limpiar = () => {
    casillas().forEach((c) => { c.checked = false })
    const todos = document.querySelector<HTMLInputElement>('input[data-lead-todos]')
    if (todos) todos.checked = false
    setIds([])
  }

  const ejecutar = (accion: Parameters<typeof accionMasiva>[1] | 'papelera') => {
    setAviso(null)
    iniciar(async () => {
      const r = accion === 'papelera' ? await enviarAPapelera(ids) : await accionMasiva(ids, accion)
      if (r.error) return setAviso({ texto: r.error, error: true })
      setAviso({ texto: `Listo: ${r.cambiados} ${r.cambiados === 1 ? 'lead actualizado' : 'leads actualizados'}.` })
      setEstado(''); setMotivo(''); setAsesorId('')
      limpiar()
    })
  }

  const conMotivo = estado === 'lead_perdido' || estado === 'lead_no_interesado'

  if (!ids.length) {
    return aviso ? (
      <p role="status" className={`rounded-lg px-4 py-2 text-sm ${aviso.error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
        {aviso.texto}
      </p>
    ) : null
  }

  return (
    <div className="tarjeta sticky top-20 z-20 flex flex-wrap items-center gap-2 border-marca-200 bg-marca-50 p-3 text-sm">
      <span className="font-semibold text-marca-700">{ids.length} seleccionado{ids.length === 1 ? '' : 's'}</span>
      <button type="button" onClick={limpiar} className="text-slate-500 underline hover:text-slate-700">Quitar selección</button>

      <span className="mx-1 hidden h-6 border-l border-marca-200 sm:block" />
      <select value={estado} onChange={(e) => setEstado(e.target.value as LeadEstado)} className="campo w-auto" aria-label="Nuevo estado">
        <option value="">Cambiar estado…</option>
        {ESTADOS_LEAD.map((e) => <option key={e} value={e}>{ETIQUETAS_ESTADO[e]}</option>)}
      </select>
      {conMotivo && (
        <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className="campo w-auto" aria-label="Motivo">
          <option value="">Motivo…</option>
          {MOTIVOS_PERDIDA.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      )}
      <button
        type="button" className="boton" disabled={!estado || (conMotivo && !motivo) || pendiente}
        onClick={() => estado && ejecutar({ tipo: 'estado', estado, motivo })}
      >
        Aplicar
      </button>

      {asesores.length > 0 && (
        <>
          <span className="mx-1 hidden h-6 border-l border-marca-200 sm:block" />
          <select value={asesorId} onChange={(e) => setAsesorId(e.target.value)} className="campo w-auto" aria-label="Asignar a">
            <option value="">Asignar a…</option>
            {asesores.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
          <button type="button" className="boton-secundario" disabled={!asesorId || pendiente} onClick={() => ejecutar({ tipo: 'asesor', asesorId })}>
            Asignar
          </button>
        </>
      )}
      {esAdmin && (
        <>
          <span className="mx-1 hidden h-6 border-l border-marca-200 sm:block" />
          <button
            type="button" disabled={pendiente} className="rounded-lg px-3 py-2 font-medium text-rose-600 hover:bg-rose-50"
            onClick={() => { if (confirm(`¿Enviar ${ids.length} lead(s) a la papelera? Puedes restaurarlos desde la Papelera.`)) ejecutar('papelera') }}
          >
            🗑 Papelera
          </button>
        </>
      )}
      {pendiente && <span className="text-slate-500">Guardando…</span>}
      {aviso?.error && <span className="text-rose-700">{aviso.texto}</span>}
    </div>
  )
}
