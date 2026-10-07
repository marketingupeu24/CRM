'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import type { FichaGenesys, ParteGenesys } from '@crm/db'
import { useConfirmar } from '@/components/Confirmacion'
import type { Aviso } from '@/lib/genesys'
import { agregarFeriado, cambiarActivo, eliminarFeriado, eliminarFicha, guardarFicha, registrarVersion, type Resultado } from './acciones'

function Mensaje({ r }: { r: Resultado }) {
  if (r.error) return <p role="alert" className="text-sm text-rose-600">{r.error}</p>
  if (r.ok) return <p role="status" className="text-sm text-emerald-600">{r.ok}</p>
  return null
}

/** Formulario de una ficha: los campos salen de la definición de su parte. */
export function FormularioFicha({ parte, ficha, alGuardar }: { parte: ParteGenesys; ficha?: FichaGenesys; alGuardar?: () => void }) {
  const [r, accion, guardando] = useActionState<Resultado, FormData>(guardarFicha.bind(null, ficha?.id ?? null, parte.clave), {})
  useEffect(() => { if (r.ok) alGuardar?.() }, [r, alGuardar])
  const anchos = (tipo: string) => (tipo === 'area' || tipo === 'lista' ? 'sm:col-span-2' : '')
  return (
    <form action={accion} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm text-slate-600 sm:col-span-2">{parte.nombreFicha}
        <input name="titulo" required defaultValue={ficha?.titulo} className="campo mt-1" />
      </label>
      {parte.campos.map((c) => (
        <label key={c.clave} className={`text-sm text-slate-600 ${anchos(c.tipo)}`}>
          {c.etiqueta}{c.ayuda && <span className="text-xs text-slate-400"> · {c.ayuda}</span>}
          {c.tipo === 'opciones' ? (
            <select name={c.clave} defaultValue={ficha?.campos[c.clave] ?? ''} className="campo mt-1">
              <option value="">—</option>
              {c.opciones?.map((o) => <option key={o}>{o}</option>)}
            </select>
          ) : c.tipo === 'texto' ? (
            <input name={c.clave} defaultValue={ficha?.campos[c.clave] ?? ''} className="campo mt-1" />
          ) : (
            <textarea
              name={c.clave} defaultValue={ficha?.campos[c.clave] ?? ''}
              rows={Math.max(3, (ficha?.campos[c.clave] ?? '').split('\n').length + 1, c.tipo === 'lista' ? 0 : Math.ceil((ficha?.campos[c.clave] ?? '').length / 90) + 1)}
              className="campo mt-1"
            />
          )}
        </label>
      ))}
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="boton" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        <Mensaje r={r} />
      </div>
    </form>
  )
}

/** Resumen corto de la ficha cerrada: los primeros campos con datos. */
function resumen(parte: ParteGenesys, ficha: FichaGenesys): string {
  const valores = parte.campos.map((c) => (ficha.campos[c.clave] ?? '').split('\n')[0]?.trim()).filter(Boolean)
  return valores.slice(0, 3).join(' · ')
}

export function TarjetaFicha({ parte, ficha, editable }: { parte: ParteGenesys; ficha: FichaGenesys; editable: boolean }) {
  const [abierta, setAbierta] = useState(false)
  const [r, setR] = useState<Resultado>({})
  const [pendiente, iniciar] = useTransition()
  const confirmar = useConfirmar()
  const texto = resumen(parte, ficha)

  return (
    <li className={`rounded-xl border p-4 ${ficha.activo ? 'border-slate-200 bg-superficie' : 'border-dashed border-amber-300 bg-amber-50/40'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <button type="button" onClick={() => setAbierta(!abierta)} className="min-w-0 flex-1 text-left">
          <p className="font-medium text-slate-900">
            {ficha.titulo}
            {!ficha.activo && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">No va en el prompt</span>}
          </p>
          {texto && <p className="mt-0.5 truncate text-xs text-slate-500">{texto}</p>}
        </button>
        {editable && (
          <div className="flex shrink-0 gap-3 text-xs font-medium">
            <button onClick={() => setAbierta(!abierta)} className="text-marca-700 hover:underline">{abierta ? 'Cerrar' : 'Editar'}</button>
            <button disabled={pendiente} onClick={() => iniciar(async () => setR(await cambiarActivo(ficha.id, !ficha.activo)))} className="text-slate-500 hover:underline">
              {ficha.activo ? 'Desactivar' : 'Activar'}
            </button>
            <button
              disabled={pendiente} className="text-rose-600 hover:underline"
              onClick={async () => {
                if (await confirmar({ titulo: `¿Eliminar "${ficha.titulo}"?`, mensaje: 'Deja de ir en el prompt de Genesys. Si solo quieres sacarla un tiempo, usa "Desactivar".', confirmar: 'Eliminar', peligro: true })) {
                  iniciar(async () => setR(await eliminarFicha(ficha.id)))
                }
              }}
            >
              Eliminar
            </button>
          </div>
        )}
      </div>
      <Mensaje r={r} />
      {abierta && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          {editable ? <FormularioFicha parte={parte} ficha={ficha} alGuardar={() => setAbierta(false)} /> : (
            <dl className="space-y-2 text-sm">
              {parte.campos.filter((c) => ficha.campos[c.clave]).map((c) => (
                <div key={c.clave}><dt className="text-xs text-slate-500">{c.etiqueta}</dt><dd className="whitespace-pre-wrap">{ficha.campos[c.clave]}</dd></div>
              ))}
            </dl>
          )}
        </div>
      )}
    </li>
  )
}

/** Días sin atención: no hay reasignación ni resumen de apertura y Genesys sabe que la oficina está cerrada. */
export function Feriados({ feriados, editable }: { feriados: { fecha: string; nombre: string }[]; editable: boolean }) {
  const [r, accion, guardando] = useActionState<Resultado, FormData>(agregarFeriado, {})
  const [rEliminar, setREliminar] = useState<Resultado>({})
  const [pendiente, iniciar] = useTransition()
  const confirmar = useConfirmar()
  const fecha = (f: string) => new Intl.DateTimeFormat('es-PE', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${f}T00:00:00Z`))
  return (
    <section className="tarjeta space-y-3 p-4">
      <div>
        <h2 className="text-sm font-semibold">🗓️ Feriados (sin atención)</h2>
        <p className="text-xs text-slate-500">Ese día no hay reasignación ni resumen de apertura, y Genesys sabe que la oficina está cerrada.</p>
      </div>
      <ul className="max-h-56 space-y-1 overflow-y-auto text-sm">
        {feriados.map((f) => (
          <li key={f.fecha} className="flex items-center justify-between gap-2">
            <span><span className="font-medium">{fecha(f.fecha)}</span> <span className="text-slate-500">· {f.nombre}</span></span>
            {editable && (
              <button
                disabled={pendiente} className="text-xs text-rose-600 hover:underline" aria-label={`Quitar ${f.nombre}`}
                onClick={async () => {
                  if (await confirmar({ titulo: `¿Quitar el feriado del ${fecha(f.fecha)}?`, mensaje: `"${f.nombre}" volverá a ser un día con atención normal.`, confirmar: 'Quitar', peligro: true })) {
                    iniciar(async () => setREliminar(await eliminarFeriado(f.fecha)))
                  }
                }}
              >
                Quitar
              </button>
            )}
          </li>
        ))}
        {!feriados.length && <li className="text-xs text-slate-500">No hay feriados próximos.</li>}
      </ul>
      <Mensaje r={rEliminar} />
      {editable && (
        <form action={accion} className="space-y-2 border-t border-slate-100 pt-3">
          <input type="date" name="fecha" required className="campo" aria-label="Fecha del feriado" />
          <input name="nombre" required placeholder="Ej.: Fiestas Patrias" className="campo" aria-label="Nombre del feriado" />
          <button className="boton w-full" disabled={guardando}>{guardando ? 'Guardando…' : '+ Agregar feriado'}</button>
          <Mensaje r={r} />
        </form>
      )}
    </section>
  )
}

const ESTILO_AVISO: Record<Aviso['nivel'], string> = {
  error: 'border-rose-200 bg-rose-50 text-rose-800',
  aviso: 'border-amber-200 bg-amber-50 text-amber-800',
  info: 'border-slate-200 bg-slate-50 text-slate-600',
}

/** Prompt armado: revisión, copiar y registrar que se pegó en BuilderBot. */
export function PanelPrompt({ prompt, avisos, cambios, ultima, editable }: {
  prompt: string; avisos: Aviso[]; cambios: boolean; ultima: string | null; editable: boolean
}) {
  const [copiado, setCopiado] = useState(false)
  const [r, setR] = useState<Resultado>({})
  const [pendiente, iniciar] = useTransition()
  const errores = avisos.filter((a) => a.nivel === 'error').length

  async function copiar() {
    try { await navigator.clipboard.writeText(prompt); setCopiado(true); setTimeout(() => setCopiado(false), 2500) } catch { /* sin portapapeles */ }
  }

  return (
    <section className="tarjeta space-y-4 p-5">
      <div>
        <h2 className="font-semibold">Prompt para BuilderBot</h2>
        <p className="text-xs text-slate-500">
          Se arma solo con las fichas activas y los costos del tarifario · {prompt.length.toLocaleString('es-PE')} caracteres.
          Va en el asistente <b>INFORMACIÓN</b> (reemplaza todo su texto).
        </p>
      </div>
      <p className={`rounded-lg px-3 py-2 text-sm font-medium ${cambios ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
        {cambios
          ? `⚠️ Hay cambios que aún no están en BuilderBot${ultima ? ` (última vez pegado: ${ultima})` : ''}.`
          : `✓ BuilderBot tiene la versión actual${ultima ? ` (pegada el ${ultima})` : ''}.`}
      </p>
      {avisos.length > 0 && (
        <ul className="space-y-2">
          {avisos.map((a, i) => <li key={i} className={`rounded-lg border px-3 py-2 text-xs ${ESTILO_AVISO[a.nivel]}`}>{a.texto}</li>)}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="boton" onClick={copiar} disabled={errores > 0} title={errores ? 'Corrige los errores primero' : undefined}>
          {copiado ? '✓ Copiado' : '📋 Copiar prompt'}
        </button>
        {editable && cambios && (
          <button
            className="boton-secundario" disabled={pendiente}
            onClick={() => iniciar(async () => setR(await registrarVersion(prompt, '')))}
          >
            ✓ Ya lo pegué en BuilderBot
          </button>
        )}
      </div>
      <Mensaje r={r} />
      <details>
        <summary className="cursor-pointer text-sm font-medium text-marca-700">Ver el prompt completo</summary>
        <pre className="mt-2 max-h-[32rem] overflow-auto rounded-lg bg-slate-50 p-3 text-xs whitespace-pre-wrap text-slate-700">{prompt}</pre>
      </details>
    </section>
  )
}
