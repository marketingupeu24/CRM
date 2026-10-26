'use client'

// Editor del formulario de una actividad: qué campos pide (no / opcional / obligatorio) y preguntas propias.
// Envía todo como JSON en el campo oculto "formulario" del formulario de la actividad.
import { useState } from 'react'
import {
  CAMPOS_FORMULARIO, TIPOS_PREGUNTA, modoDe,
  type FormularioActividad, type ModoCampo, type PreguntaActividad, type TipoPregunta,
} from '@/lib/formulario-actividad'

const MODOS: { valor: ModoCampo; texto: string }[] = [
  { valor: 'oculto', texto: 'No pedir' },
  { valor: 'opcional', texto: 'Opcional' },
  { valor: 'obligatorio', texto: 'Obligatorio' },
]

/** Opciones escritas una por línea (se guardan sin vacías ni repetidas). */
const opcionesDe = (texto: string) => [...new Set(texto.split('\n').map((o) => o.trim()).filter(Boolean))]

export function EditorFormulario({ inicial }: { inicial: FormularioActividad }) {
  const [form, setForm] = useState<FormularioActividad>(inicial)
  // Texto de las opciones tal como se escribe (con líneas en blanco mientras se edita)
  const [textoOpciones, setTextoOpciones] = useState<Record<string, string>>(
    () => Object.fromEntries(inicial.preguntas.map((p) => [p.id, (p.opciones ?? []).join('\n')])),
  )

  const cambiarCampo = (campo: string, modo: ModoCampo) => setForm((f) => ({ ...f, campos: { ...f.campos, [campo]: modo } }))
  const cambiarPregunta = (id: string, cambios: Partial<PreguntaActividad>) =>
    setForm((f) => ({ ...f, preguntas: f.preguntas.map((p) => (p.id === id ? { ...p, ...cambios } : p)) }))
  const agregar = () => {
    const n = Math.max(0, ...form.preguntas.map((p) => Number(p.id.slice(1)))) + 1
    setForm((f) => ({ ...f, preguntas: [...f.preguntas, { id: `p${n}`, texto: '', tipo: 'texto', obligatoria: false }] }))
  }
  const quitar = (id: string) => setForm((f) => ({ ...f, preguntas: f.preguntas.filter((p) => p.id !== id) }))
  const mover = (i: number, paso: -1 | 1) => setForm((f) => {
    const lista = [...f.preguntas]
    const j = i + paso
    if (j < 0 || j >= lista.length) return f
    ;[lista[i], lista[j]] = [lista[j]!, lista[i]!]
    return { ...f, preguntas: lista }
  })

  // Lo que se guarda: solo las opciones de las preguntas que las usan
  const paraGuardar: FormularioActividad = {
    campos: form.campos,
    preguntas: form.preguntas.map((p) => ({
      ...p,
      opciones: p.tipo === 'opcion' || p.tipo === 'varias' ? opcionesDe(textoOpciones[p.id] ?? '') : undefined,
    })),
  }

  return (
    <fieldset className="space-y-4 rounded-xl border border-slate-200 p-4">
      <legend className="px-1 text-sm font-semibold text-slate-700">Formulario del QR</legend>
      <input type="hidden" name="formulario" value={JSON.stringify(paraGuardar)} />

      <div>
        <p className="text-sm text-slate-600">Nombre y celular siempre se piden. Los demás datos:</p>
        <ul className="mt-2 divide-y divide-slate-100">
          {CAMPOS_FORMULARIO.map((c) => (
            <li key={c.clave} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
              <span className="text-sm text-slate-700">{c.etiqueta}</span>
              <div role="radiogroup" aria-label={c.etiqueta} className="flex overflow-hidden rounded-lg border border-slate-300 text-xs">
                {MODOS.map((m) => {
                  const activo = modoDe(form, c.clave) === m.valor
                  return (
                    <button
                      key={m.valor} type="button" role="radio" aria-checked={activo}
                      onClick={() => cambiarCampo(c.clave, m.valor)}
                      className={`border-r border-slate-300 px-2.5 py-1 last:border-r-0 ${activo ? 'bg-marca-600 text-white' : 'bg-superficie text-slate-600 hover:bg-slate-50'}`}
                    >
                      {m.texto}
                    </button>
                  )
                })}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3">
        <p className="text-sm text-slate-600">Preguntas propias de esta actividad {form.preguntas.length > 0 && <span className="text-slate-400">({form.preguntas.length})</span>}</p>
        {form.preguntas.map((p, i) => (
          <div key={p.id} className="space-y-2 rounded-lg bg-slate-50 p-3">
            <div className="flex items-start gap-2">
              <span className="mt-2 text-xs font-semibold text-slate-400">{i + 1}.</span>
              <input
                value={p.texto} maxLength={200} placeholder="Ej.: ¿Asistirás al simulacro del sábado?"
                onChange={(e) => cambiarPregunta(p.id, { texto: e.target.value })}
                aria-label={`Texto de la pregunta ${i + 1}`} className="campo flex-1"
              />
              <div className="flex shrink-0 gap-1 pt-1">
                <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} title="Subir" aria-label="Subir" className="rounded px-1.5 text-slate-500 hover:bg-slate-200 disabled:opacity-30">↑</button>
                <button type="button" onClick={() => mover(i, 1)} disabled={i === form.preguntas.length - 1} title="Bajar" aria-label="Bajar" className="rounded px-1.5 text-slate-500 hover:bg-slate-200 disabled:opacity-30">↓</button>
                <button type="button" onClick={() => quitar(p.id)} title="Quitar pregunta" aria-label="Quitar pregunta" className="rounded px-1.5 text-rose-600 hover:bg-rose-50">✕</button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 pl-5">
              <select
                value={p.tipo} onChange={(e) => cambiarPregunta(p.id, { tipo: e.target.value as TipoPregunta })}
                aria-label="Tipo de respuesta" className="campo w-auto py-1.5 text-sm"
              >
                {Object.entries(TIPOS_PREGUNTA).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-sm text-slate-600">
                <input type="checkbox" checked={p.obligatoria} onChange={(e) => cambiarPregunta(p.id, { obligatoria: e.target.checked })} className="h-4 w-4 accent-marca-600" />
                Obligatoria
              </label>
            </div>
            {(p.tipo === 'opcion' || p.tipo === 'varias') && (
              <label className="block pl-5 text-xs text-slate-500">
                Opciones (una por línea)
                <textarea
                  rows={3} value={textoOpciones[p.id] ?? ''} placeholder={'Mañana\nTarde'}
                  onChange={(e) => setTextoOpciones((t) => ({ ...t, [p.id]: e.target.value }))}
                  className="campo mt-1 text-sm"
                />
              </label>
            )}
          </div>
        ))}
        {form.preguntas.length < 15 && (
          <button type="button" onClick={agregar} className="text-sm font-medium text-marca-700 hover:underline">+ Agregar pregunta</button>
        )}
      </div>
    </fieldset>
  )
}
