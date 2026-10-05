'use client'

import { useActionState, useState, useTransition } from 'react'
import { CATEGORIAS_CONOCIMIENTO } from '@crm/db'
import { eliminarEntrada, guardarEntrada, type Resultado } from './acciones'

export interface Entrada {
  id: number
  categoria: string
  titulo: string
  contenido: string
  activo: boolean
  orden: number
}

function Mensaje({ r }: { r: Resultado }) {
  if (r.error) return <p role="alert" className="text-sm text-rose-600">{r.error}</p>
  if (r.ok) return <p role="status" className="text-sm text-emerald-600">{r.ok}</p>
  return null
}

export function FormularioEntrada(
  { entrada, inicial, alGuardar }: { entrada?: Entrada; inicial?: Partial<Entrada>; alGuardar?: () => void },
) {
  const [r, accion, guardando] = useActionState<Resultado, FormData>(async (previo, formData) => {
    const resultado = await guardarEntrada(entrada?.id ?? null, previo, formData)
    if (resultado.ok) alGuardar?.()
    return resultado
  }, {})
  const valor = entrada ?? inicial

  return (
    <form action={accion} className="grid gap-3 sm:grid-cols-[1fr_1fr_6rem]">
      <label className="text-sm text-slate-600">Sección
        <select name="categoria" defaultValue={valor?.categoria ?? 'costos'} className="campo mt-1">
          {Object.entries(CATEGORIAS_CONOCIMIENTO).map(([clave, nombre]) => <option key={clave} value={clave}>{nombre}</option>)}
        </select>
      </label>
      <label className="text-sm text-slate-600">Título
        <input name="titulo" required maxLength={120} defaultValue={valor?.titulo} placeholder="Ej.: Pensión de Enfermería" className="campo mt-1" />
      </label>
      <label className="text-sm text-slate-600">Orden
        <input name="orden" type="number" defaultValue={valor?.orden ?? 100} className="campo mt-1" />
      </label>
      <label className="text-sm text-slate-600 sm:col-span-3">Contenido (lo que Genesys debe saber o hacer)
        <textarea
          name="contenido" required maxLength={6000} rows={6} defaultValue={valor?.contenido}
          placeholder={'Ej.:\nMatrícula: S/ ...\nPensión mensual: S/ ... (5 cuotas por ciclo)'}
          className="campo mt-1 font-mono text-[13px]"
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-600 sm:col-span-3">
        <input type="checkbox" name="activo" defaultChecked={valor?.activo ?? true} className="h-4 w-4 accent-marca-600" />
        Incluir en el texto para Genesys (desmárcalo si aún está por completar)
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
        <button className="boton" disabled={guardando}>{guardando ? 'Guardando…' : entrada ? 'Guardar cambios' : 'Agregar'}</button>
        <Mensaje r={r} />
      </div>
    </form>
  )
}

export function TarjetaEntrada({ entrada, editable }: { entrada: Entrada; editable: boolean }) {
  const [editando, setEditando] = useState(false)
  const [r, setR] = useState<Resultado>({})
  const [pendiente, iniciar] = useTransition()

  return (
    <li className={`rounded-xl border p-4 ${entrada.activo ? 'border-slate-200' : 'border-dashed border-amber-300 bg-amber-50/40'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium">
          {entrada.titulo}
          {!entrada.activo && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Por completar</span>}
        </p>
        {editable && (
          <div className="flex gap-3 text-xs font-medium">
            <button onClick={() => setEditando(!editando)} className="text-marca-700 hover:underline">{editando ? 'Cerrar' : 'Editar'}</button>
            <button
              disabled={pendiente} className="text-rose-600 hover:underline"
              onClick={() => { if (confirm(`¿Eliminar "${entrada.titulo}"?`)) iniciar(async () => setR(await eliminarEntrada(entrada.id))) }}
            >
              Eliminar
            </button>
          </div>
        )}
      </div>
      {editando
        ? <div className="mt-3"><FormularioEntrada entrada={entrada} alGuardar={() => setEditando(false)} /></div>
        : <p className="mt-2 text-sm whitespace-pre-wrap text-slate-600">{entrada.contenido}</p>}
      <Mensaje r={r} />
    </li>
  )
}

export function CopiarTexto({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="boton"
          onClick={async () => {
            try { await navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 2500) } catch { /* sin portapapeles */ }
          }}
        >
          {copiado ? '✓ Copiado' : '📋 Copiar texto para Genesys'}
        </button>
        <span className="text-xs text-slate-500">{texto.length.toLocaleString('es-PE')} caracteres</span>
      </div>
      <textarea readOnly value={texto} rows={14} aria-label="Texto para Genesys" className="campo font-mono text-[12px] leading-relaxed" />
    </div>
  )
}
