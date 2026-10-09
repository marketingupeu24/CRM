'use client'

import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useConfirmar } from '@/components/Confirmacion'
import { eliminarPrueba, guardarPrueba, probarPregunta, refrescarPruebas, type ResultadoPrueba } from './acciones'

export interface FilaPrueba {
  id: number
  pregunta: string
  debe_incluir: string[]
  no_debe_incluir: string[]
  ultima_respuesta: string | null
  ultimo_resultado: boolean | null
  ultimo_detalle: string | null
}

export function FormularioPrueba({ prueba, alGuardar }: { prueba?: FilaPrueba; alGuardar?: () => void }) {
  const [r, accion, guardando] = useActionState<ResultadoPrueba, FormData>(async (previo, fd) => {
    const res = await guardarPrueba(prueba?.id ?? null, previo, fd)
    if (res.ok) alGuardar?.()
    return res
  }, {})
  return (
    <form action={accion} className="grid gap-3 md:grid-cols-3">
      <label className="text-sm text-slate-600 md:col-span-3">Pregunta del alumno *
        <input name="pregunta" required maxLength={500} defaultValue={prueba?.pregunta} placeholder="¿Hasta cuándo me puedo inscribir?" className="campo mt-1" />
      </label>
      <label className="text-sm text-slate-600">Debe incluir <span className="text-xs text-slate-400">(uno por línea)</span>
        <textarea name="debe_incluir" rows={3} defaultValue={prueba?.debe_incluir.join('\n')} placeholder="13 de noviembre" className="campo mt-1" />
      </label>
      <label className="text-sm text-slate-600">No debe decir <span className="text-xs text-slate-400">(uno por línea)</span>
        <textarea name="no_debe_incluir" rows={3} defaultValue={prueba?.no_debe_incluir.join('\n')} placeholder="es virtual" className="campo mt-1" />
      </label>
      <div className="flex items-end gap-2">
        <button type="submit" disabled={guardando} className="boton">{guardando ? 'Guardando…' : 'Guardar'}</button>
        {r.error && <p role="alert" className="text-sm text-rose-600">{r.error}</p>}
        {r.ok && !prueba && <p className="text-sm text-emerald-600">Agregada.</p>}
      </div>
    </form>
  )
}

/** Prueba todas las preguntas con IA, una por una, mostrando el avance. */
export function ProbarTodas({ ids }: { ids: number[] }) {
  const router = useRouter()
  const [avance, setAvance] = useState<{ hechas: number; malas: number; terminado: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, iniciar] = useTransition()
  const probando = avance !== null && !avance.terminado

  async function probar() {
    setError(null)
    let malas = 0
    let hechas = 0
    setAvance({ hechas: 0, malas: 0, terminado: false })
    for (const id of ids) {
      const r = await probarPregunta(id)
      if (r.error) { setError(r.error); break }
      if (!r.ok) malas++
      hechas++
      setAvance({ hechas, malas, terminado: false })
    }
    setAvance({ hechas, malas, terminado: true })
    await refrescarPruebas()
    iniciar(() => router.refresh())
  }

  return (
    <div className="mt-3 space-y-1">
      <button type="button" onClick={probar} disabled={probando} className="boton">
        {probando ? `Probando ${avance!.hechas + 1} de ${ids.length}…` : '▶ Probar todas con IA'}
      </button>
      {avance?.terminado && !error && <p className="text-sm text-slate-600">Listo: {avance.hechas - avance.malas} correctas, {avance.malas} con problemas.</p>}
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
    </div>
  )
}

export function TarjetaPrueba({ prueba, faltanEnPrompt, conIA, probado }: {
  prueba: FilaPrueba; faltanEnPrompt: string[]; conIA: boolean; probado: string | null
}) {
  const confirmar = useConfirmar()
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoPrueba | null>(null)
  const [pendiente, iniciar] = useTransition()
  const estado = prueba.ultimo_resultado

  return (
    <li className="tarjeta p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{estado === true ? '✅' : estado === false ? '❌' : '⚪'} {prueba.pregunta}</p>
          <p className="mt-1 text-xs text-slate-500">
            {prueba.debe_incluir.length ? <>Debe incluir: <b>{prueba.debe_incluir.join(' · ')}</b></> : 'Sin dato obligatorio'}
            {prueba.no_debe_incluir.length ? <> · No debe decir: <b>{prueba.no_debe_incluir.join(' · ')}</b></> : null}
          </p>
          {faltanEnPrompt.length > 0 && <p className="mt-1 text-xs text-amber-700">⚠️ El prompt no tiene: {faltanEnPrompt.join(', ')}</p>}
          {prueba.ultimo_detalle && estado === false && <p className="mt-1 text-xs text-rose-600">{prueba.ultimo_detalle}{probado ? ` (${probado})` : ''}</p>}
        </div>
        <div className="flex gap-3 text-xs">
          {conIA && (
            <button type="button" disabled={pendiente} className="font-medium text-marca-700 hover:underline disabled:opacity-60"
              onClick={() => iniciar(async () => { setResultado(await probarPregunta(prueba.id)); router.refresh() })}>
              {pendiente ? 'Probando…' : '▶ Probar'}
            </button>
          )}
          <button type="button" className="text-slate-600 hover:underline" onClick={() => setEditando(!editando)}>{editando ? 'Cerrar' : 'Editar'}</button>
          <button type="button" className="text-rose-600 hover:underline" onClick={async () => {
            if (await confirmar({ titulo: '¿Eliminar esta pregunta de prueba?', mensaje: prueba.pregunta, peligro: true, confirmar: 'Eliminar' })) {
              iniciar(async () => { await eliminarPrueba(prueba.id) })
            }
          }}>Eliminar</button>
        </div>
      </div>
      {editando && <div className="mt-4"><FormularioPrueba prueba={prueba} alGuardar={() => setEditando(false)} /></div>}
      {(resultado?.respuesta ?? prueba.ultima_respuesta) && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-slate-500">Ver la respuesta de la IA</summary>
          <p className="mt-1 rounded-lg bg-slate-50 p-3 text-sm whitespace-pre-wrap text-slate-700">{resultado?.respuesta ?? prueba.ultima_respuesta}</p>
        </details>
      )}
      {resultado?.error && <p role="alert" className="mt-1 text-xs text-rose-600">{resultado.error}</p>}
    </li>
  )
}
