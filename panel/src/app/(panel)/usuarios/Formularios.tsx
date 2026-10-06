'use client'

import { useActionState, useState, useTransition } from 'react'
import type { Asesor } from '@crm/db'
import { useConfirmar } from '@/components/Confirmacion'
import {
  actualizarAsesor, cambiarActivo, crearAsesor, crearCuenta, eliminarAsesor, restablecerClave, type Resultado,
} from './acciones'

/** "Danna Lima" -> "danna.lima" (primer nombre.primer apellido, sin tildes) */
export function sugerirUsuario(nombre: string): string {
  const partes = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean)
  return partes.length >= 2 ? `${partes[0]}.${partes[1]}` : (partes[0] ?? '')
}

function Mensaje({ r }: { r: Resultado }) {
  if (r.error) return <p role="alert" className="text-sm text-rose-600">{r.error}</p>
  if (r.ok) return <p className="text-sm text-emerald-600">{r.ok}</p>
  return null
}

/** Interruptor "Recibe leads": reparto por turnos, actividades y avisos por WhatsApp (cualquier rol). */
export function InterruptorRecibe({ asesor, editable }: { asesor: Asesor; editable: boolean }) {
  const [r, setR] = useState<Resultado>({})
  const [pendiente, iniciar] = useTransition()
  return (
    <div className="space-y-1">
      <button
        type="button" role="switch" aria-checked={asesor.activo} aria-label={`${asesor.nombre} recibe leads`}
        disabled={!editable || pendiente}
        onClick={() => iniciar(async () => setR(await cambiarActivo(asesor.id, !asesor.activo)))}
        className="inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${asesor.activo ? 'bg-emerald-500' : 'bg-slate-300'}`}>
          <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${asesor.activo ? 'left-4.5' : 'left-0.5'}`} />
        </span>
        <span className={`text-xs font-medium ${asesor.activo ? 'text-emerald-700' : 'text-slate-500'}`}>
          {pendiente ? 'Guardando…' : asesor.activo ? 'Recibe leads' : 'No recibe'}
        </span>
      </button>
      <Mensaje r={r} />
    </div>
  )
}

function CasillaCambioObligatorio() {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      <input type="checkbox" name="debe_cambiar" defaultChecked /> Obligar a cambiar la contraseña al ingresar
    </label>
  )
}

export function FormularioNuevoAsesor() {
  const [r, accion, enviando] = useActionState<Resultado, FormData>(crearAsesor, {})
  const [nombre, setNombre] = useState('')
  const [usuario, setUsuario] = useState('')
  const [usuarioEditado, setUsuarioEditado] = useState(false)

  return (
    <form action={accion} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="text-sm text-slate-600">Nombre completo *
        <input
          name="nombre" required value={nombre} className="campo mt-1"
          onChange={(e) => { setNombre(e.target.value); if (!usuarioEditado) setUsuario(sugerirUsuario(e.target.value)) }}
        />
      </label>
      <label className="text-sm text-slate-600">Celular (recibe los avisos)
        <input name="telefono" inputMode="tel" placeholder="951301920" className="campo mt-1" />
      </label>
      <label className="text-sm text-slate-600">Rol
        <select name="rol" className="campo mt-1">
          <option value="asesor">Asesor</option>
          <option value="admin">Administrador</option>
        </select>
      </label>
      <label className="text-sm text-slate-600">Carreras exclusivas (opcional)
        <input name="carreras" placeholder="CEPRE  ·  vacío = rotación general" className="campo mt-1" />
      </label>
      <label className="text-sm text-slate-600">Usuario del panel
        <input
          name="usuario" value={usuario} placeholder="nombre.apellido" className="campo mt-1 font-mono"
          onChange={(e) => { setUsuario(e.target.value); setUsuarioEditado(true) }}
        />
      </label>
      <label className="text-sm text-slate-600">Contraseña inicial (ej. DNI)
        <input name="clave" type="text" autoComplete="off" className="campo mt-1" />
      </label>
      <div className="flex flex-wrap items-center gap-4 sm:col-span-2 lg:col-span-3">
        <CasillaCambioObligatorio />
        <button className="boton" disabled={enviando}>{enviando ? 'Creando…' : 'Agregar asesor'}</button>
        <Mensaje r={r} />
      </div>
    </form>
  )
}

type Panel = 'cuenta' | 'clave' | 'editar' | null

export function AccionesAsesor({ asesor, esYo = false }: { asesor: Asesor; esYo?: boolean }) {
  const [abierto, setAbierto] = useState<Panel>(null)
  const [rActivo, setRActivo] = useState<Resultado>({})
  const [pendiente, iniciar] = useTransition()
  const confirmar = useConfirmar()
  const [rCuenta, accionCuenta, creando] = useActionState<Resultado, FormData>(crearCuenta.bind(null, asesor.id), {})
  const [rClave, accionClave, guardandoClave] = useActionState<Resultado, FormData>(restablecerClave.bind(null, asesor.id), {})
  const [rEditar, accionEditar, guardando] = useActionState<Resultado, FormData>(actualizarAsesor.bind(null, asesor.id), {})

  const alternar = (p: Panel) => setAbierto(abierto === p ? null : p)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs font-medium">
        {asesor.user_id
          ? <button onClick={() => alternar('clave')} className="text-marca-700 hover:underline">Restablecer contraseña</button>
          : <button onClick={() => alternar('cuenta')} className="text-marca-700 hover:underline">Crear usuario</button>}
        <button onClick={() => alternar('editar')} className="text-marca-700 hover:underline">Editar</button>
        {!esYo && (
          <button
            disabled={pendiente} className="text-rose-600 hover:underline"
            onClick={async () => {
              if (await confirmar({ titulo: `¿Enviar a ${asesor.nombre} a la papelera?`, mensaje: 'No podrá entrar al panel ni recibirá leads. Puedes restaurarlo desde la Papelera.', confirmar: 'Enviar a la papelera', peligro: true })) {
                iniciar(async () => setRActivo(await eliminarAsesor(asesor.id)))
              }
            }}
          >
            🗑 Papelera
          </button>
        )}
      </div>
      <Mensaje r={rActivo} />

      {abierto === 'cuenta' && (
        <form action={accionCuenta} className="space-y-2">
          <input name="usuario" required defaultValue={sugerirUsuario(asesor.nombre)} className="campo font-mono" aria-label="Usuario" />
          <input name="clave" required minLength={6} placeholder="Contraseña inicial (ej. DNI)" autoComplete="off" className="campo" />
          <CasillaCambioObligatorio />
          <button className="boton" disabled={creando}>{creando ? 'Creando…' : 'Crear usuario'}</button>
          <Mensaje r={rCuenta} />
        </form>
      )}
      {abierto === 'clave' && (
        <form action={accionClave} className="space-y-2">
          <input name="clave" required minLength={6} placeholder="Nueva contraseña" autoComplete="off" className="campo" />
          <CasillaCambioObligatorio />
          <button className="boton" disabled={guardandoClave}>{guardandoClave ? 'Guardando…' : 'Restablecer'}</button>
          <Mensaje r={rClave} />
        </form>
      )}
      {abierto === 'editar' && (
        <form action={accionEditar} className="space-y-2">
          <input name="nombre" required defaultValue={asesor.nombre} placeholder="Nombre completo" className="campo" aria-label="Nombre" />
          <input name="telefono" defaultValue={asesor.telefono ?? ''} placeholder="Celular" className="campo" aria-label="Celular" />
          <input name="carreras" defaultValue={asesor.carreras.join(', ')} placeholder="Carreras exclusivas (vacío = general)" className="campo" aria-label="Carreras" />
          <button className="boton" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          <Mensaje r={rEditar} />
        </form>
      )}
    </div>
  )
}
