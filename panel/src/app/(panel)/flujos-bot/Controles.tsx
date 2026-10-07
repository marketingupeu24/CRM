'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { useConfirmar } from '@/components/Confirmacion'
import { eliminarFlujo, guardarFlujo, type Resultado } from './acciones'

export interface Flujo {
  id: number
  nombre: string
  disparador: 'general' | 'accion' | 'palabras'
  palabras: string[]
  prompt: string
  prompt_mejorado: string
  notas: string
  updated_at: string
}

export const DISPARADOR: Record<Flujo['disparador'], { texto: string; estilo: string }> = {
  general: { texto: '💬 GENERAL (asistente IA)', estilo: 'bg-marca-50 text-marca-700' },
  accion: { texto: '⚡ ACCIÓN', estilo: 'bg-amber-50 text-amber-700' },
  palabras: { texto: '🔑 Palabras clave', estilo: 'bg-cyan-50 text-cyan-700' },
}

function Mensaje({ r }: { r: Resultado }) {
  if (r.error) return <p role="alert" className="text-sm text-rose-600">{r.error}</p>
  if (r.ok) return <p role="status" className="text-sm text-emerald-600">{r.ok}</p>
  return null
}

function Copiar({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  const [hecho, setHecho] = useState(false)
  return (
    <button
      type="button" className="boton"
      onClick={async () => { try { await navigator.clipboard.writeText(texto); setHecho(true); setTimeout(() => setHecho(false), 2000) } catch { /* sin portapapeles */ } }}
    >
      {hecho ? '✓ Copiado' : etiqueta}
    </button>
  )
}

export function FormularioFlujo({ flujo, alGuardar }: { flujo?: Flujo; alGuardar?: () => void }) {
  const [r, accion, guardando] = useActionState<Resultado, FormData>(guardarFlujo.bind(null, flujo?.id ?? null), {})
  const [disparador, setDisparador] = useState<Flujo['disparador']>(flujo?.disparador ?? 'palabras')
  useEffect(() => { if (r.ok) alGuardar?.() }, [r, alGuardar])
  return (
    <form action={accion} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-slate-600">Nombre del flujo (como en BuilderBot)
          <input name="nombre" required defaultValue={flujo?.nombre} className="campo mt-1" />
        </label>
        <label className="text-sm text-slate-600">Se activa con
          <select name="disparador" value={disparador} onChange={(e) => setDisparador(e.target.value as Flujo['disparador'])} className="campo mt-1">
            <option value="general">GENERAL — asistente de IA</option>
            <option value="accion">ACCIÓN — la IA lo dispara</option>
            <option value="palabras">Palabras clave</option>
          </select>
        </label>
      </div>
      {disparador === 'palabras' && (
        <label className="block text-sm text-slate-600">Palabras clave (separadas por coma)
          <textarea name="palabras" rows={2} defaultValue={flujo?.palabras.join(', ')} placeholder="costo, cuesta, mensualidad…" className="campo mt-1" />
        </label>
      )}
      <label className="block text-sm text-slate-600">Prompt o contenido actual en BuilderBot
        <textarea
          name="prompt" rows={12} defaultValue={flujo?.prompt} spellCheck={false}
          placeholder="Pega aquí el prompt del flujo, o el texto de cada paso (mensajes, petición HTTP, condiciones…)"
          className="campo mt-1 font-mono text-xs leading-relaxed"
        />
      </label>
      <label className="block text-sm text-slate-600">Notas (opcional)
        <textarea name="notas" rows={2} defaultValue={flujo?.notas} placeholder="Ej.: después del mensaje vuelve al inicio; la petición tiene 3 reintentos…" className="campo mt-1" />
      </label>
      <div className="flex items-center gap-3">
        <button className="boton" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        <Mensaje r={r} />
      </div>
    </form>
  )
}

export function TarjetaFlujo({ flujo }: { flujo: Flujo }) {
  const [editando, setEditando] = useState(!flujo.prompt)
  const [r, setR] = useState<Resultado>({})
  const [pendiente, iniciar] = useTransition()
  const confirmar = useConfirmar()
  const d = DISPARADOR[flujo.disparador]

  return (
    <li className="tarjeta p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold">{flujo.nombre}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${d.estilo}`}>{d.texto}</span>
            {flujo.palabras.slice(0, 12).map((p) => (
              <span key={p} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{p}</span>
            ))}
            {flujo.palabras.length > 12 && <span className="text-xs text-slate-500">+{flujo.palabras.length - 12}</span>}
          </div>
        </div>
        <div className="flex gap-3 text-xs font-medium">
          <button onClick={() => setEditando(!editando)} className="text-marca-700 hover:underline">{editando ? 'Cerrar' : 'Editar'}</button>
          <button
            disabled={pendiente} className="text-rose-600 hover:underline"
            onClick={async () => {
              if (await confirmar({ titulo: `¿Eliminar el flujo "${flujo.nombre}"?`, mensaje: 'Solo se borra la copia en el CRM; en BuilderBot no cambia nada.', confirmar: 'Eliminar', peligro: true })) {
                iniciar(async () => setR(await eliminarFlujo(flujo.id)))
              }
            }}
          >
            Eliminar
          </button>
        </div>
      </div>

      {flujo.notas && !editando && <p className="mt-2 text-sm text-slate-500">📝 {flujo.notas}</p>}
      <Mensaje r={r} />

      <div className="mt-4">
        {editando ? (
          <FormularioFlujo flujo={flujo} alGuardar={() => setEditando(false)} />
        ) : flujo.prompt ? (
          <details className="rounded-lg border border-slate-200">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-700">Prompt actual ({flujo.prompt.length.toLocaleString('es-PE')} caracteres)</summary>
            <pre className="max-h-80 overflow-auto border-t border-slate-200 bg-slate-50 p-3 text-xs whitespace-pre-wrap text-slate-700">{flujo.prompt}</pre>
          </details>
        ) : (
          <p className="text-sm text-amber-700">Falta pegar el prompt de este flujo.</p>
        )}
      </div>

      {flujo.prompt_mejorado && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-emerald-800">✨ Versión mejorada — pégala en BuilderBot</p>
            <Copiar texto={flujo.prompt_mejorado} etiqueta="📋 Copiar versión mejorada" />
          </div>
          <pre className="max-h-96 overflow-auto rounded-lg bg-superficie p-3 text-xs whitespace-pre-wrap text-slate-700">{flujo.prompt_mejorado}</pre>
        </div>
      )}
    </li>
  )
}
