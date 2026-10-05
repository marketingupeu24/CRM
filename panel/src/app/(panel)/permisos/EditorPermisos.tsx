'use client'

import { useState, useTransition } from 'react'
import { CLAVES_MODULOS, MODULOS, PERMISOS_ASESOR, type Modulo } from '@crm/db'
import { guardarPermisos, type Resultado } from './acciones'

export interface UsuarioPermisos {
  id: string
  nombre: string
  usuario: string | null
  rol: string
  activo: boolean
  superadmin: boolean
  permisos: string[]
}

const PLANTILLAS: { nombre: string; descripcion: string; permisos: readonly Modulo[] }[] = [
  { nombre: 'Asesor', descripcion: 'Sus leads, chats y seguimiento', permisos: PERMISOS_ASESOR },
  {
    nombre: 'Supervisor',
    descripcion: 'Ve todo el equipo, sin administrar',
    permisos: ['pendientes', 'chats', 'leads', 'kanban', 'dashboard', 'campanas', 'exportar', 'ver_todos'],
  },
  { nombre: 'Coordinador', descripcion: 'Todos los módulos', permisos: CLAVES_MODULOS },
  { nombre: 'Ninguno', descripcion: 'Sin acceso a módulos', permisos: [] },
]

const GRUPOS = [...new Set(MODULOS.map((m) => m.grupo))]

export function EditorPermisos({ usuario, esYo }: { usuario: UsuarioPermisos; esYo: boolean }) {
  const [abierto, setAbierto] = useState(false)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set(usuario.permisos))
  const [superadmin, setSuperadmin] = useState(usuario.superadmin)
  const [r, setR] = useState<Resultado>({})
  const [pendiente, iniciar] = useTransition()

  const total = superadmin ? MODULOS.length : MODULOS.filter((m) => seleccion.has(m.clave)).length
  const alternar = (clave: string) => {
    const nueva = new Set(seleccion)
    if (nueva.has(clave)) nueva.delete(clave)
    else nueva.add(clave)
    setSeleccion(nueva)
  }
  const cambiado = superadmin !== usuario.superadmin
    || seleccion.size !== usuario.permisos.length || usuario.permisos.some((p) => !seleccion.has(p))

  return (
    <li className="tarjeta p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            {usuario.nombre}
            {superadmin && <span className="ml-2 rounded-full bg-dorado-50 px-2 py-0.5 text-xs font-semibold text-dorado-700">Super admin</span>}
            {esYo && <span className="ml-2 text-xs font-normal text-slate-500">(tú)</span>}
          </p>
          <p className="text-xs text-slate-500">
            {usuario.usuario ?? 'Sin usuario'} · {usuario.rol === 'admin' ? 'Administrador' : 'Asesor'}{usuario.activo ? ' (recibe leads)' : ' (no recibe leads)'} ·{' '}
            {superadmin ? 'acceso total' : `${total} de ${MODULOS.length} módulos`}
          </p>
        </div>
        <button onClick={() => setAbierto(!abierto)} className="boton-secundario">{abierto ? 'Cerrar' : 'Editar permisos'}</button>
      </div>

      {abierto && (
        <div className="mt-5 space-y-5 border-t border-slate-100 pt-5">
          <label className={`flex items-start gap-3 rounded-xl border p-3 ${superadmin ? 'border-dorado-400 bg-dorado-50' : 'border-slate-200'}`}>
            <input
              type="checkbox" checked={superadmin} disabled={esYo} onChange={(e) => setSuperadmin(e.target.checked)}
              className="mt-1 h-4 w-4 accent-marca-600"
            />
            <span>
              <span className="block text-sm font-semibold">Super admin</span>
              <span className="block text-xs text-slate-500">
                Acceso a todo, incluido este módulo de permisos.{esYo ? ' No puedes quitártelo a ti mismo.' : ''}
              </span>
            </span>
          </label>

          {!superadmin && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500">Plantillas:</span>
                {PLANTILLAS.map((p) => (
                  <button
                    key={p.nombre} type="button" title={p.descripcion}
                    onClick={() => setSeleccion(new Set(p.permisos))}
                    className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:border-marca-600 hover:text-marca-700"
                  >
                    {p.nombre}
                  </button>
                ))}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {GRUPOS.map((grupo) => (
                  <fieldset key={grupo} className="rounded-xl border border-slate-200 p-4">
                    <legend className="px-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">{grupo}</legend>
                    <div className="space-y-2">
                      {MODULOS.filter((m) => m.grupo === grupo).map((m) => (
                        <label key={m.clave} className="flex cursor-pointer items-start gap-3 rounded-lg p-1.5 hover:bg-slate-50">
                          <input
                            type="checkbox" checked={seleccion.has(m.clave)} onChange={() => alternar(m.clave)}
                            className="mt-0.5 h-4 w-4 accent-marca-600"
                          />
                          <span>
                            <span className="block text-sm font-medium">{m.titulo}</span>
                            <span className="block text-xs text-slate-500">{m.descripcion}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
            </>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              className="boton" disabled={!cambiado || pendiente}
              onClick={() => iniciar(async () => setR(await guardarPermisos(usuario.id, [...seleccion], superadmin)))}
            >
              {pendiente ? 'Guardando…' : 'Guardar permisos'}
            </button>
            {r.error && <p role="alert" className="text-sm text-rose-600">{r.error}</p>}
            {r.ok && <p role="status" className="text-sm text-emerald-600">{r.ok}</p>}
          </div>
        </div>
      )}
    </li>
  )
}
