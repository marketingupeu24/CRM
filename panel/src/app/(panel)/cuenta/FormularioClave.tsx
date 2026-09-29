'use client'

import { useActionState } from 'react'
import { cambiarMiClave, type EstadoClave } from './acciones'

export function FormularioClave() {
  const [estado, accion, enviando] = useActionState<EstadoClave, FormData>(cambiarMiClave, {})

  return (
    <form action={accion} className="space-y-4">
      <div>
        <label htmlFor="nueva" className="block text-sm font-medium text-slate-700">Nueva contraseña</label>
        <input id="nueva" name="nueva" type="password" autoComplete="new-password" required minLength={8} className="campo mt-1" />
        <p className="mt-1 text-xs text-slate-500">Mínimo 8 caracteres, con letras y números.</p>
      </div>
      <div>
        <label htmlFor="repetir" className="block text-sm font-medium text-slate-700">Repite la contraseña</label>
        <input id="repetir" name="repetir" type="password" autoComplete="new-password" required className="campo mt-1" />
      </div>
      {estado.error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{estado.error}</p>}
      {estado.ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Contraseña actualizada.</p>}
      <button type="submit" disabled={enviando} className="boton">
        {enviando ? 'Guardando…' : 'Cambiar contraseña'}
      </button>
    </form>
  )
}
