'use client'

import { useActionState } from 'react'
import { iniciarSesion, type EstadoLogin } from './acciones'

export function FormularioLogin() {
  const [estado, accion, enviando] = useActionState<EstadoLogin, FormData>(iniciarSesion, {})

  return (
    <form action={accion} className="space-y-4">
      <div>
        <label htmlFor="usuario" className="block text-sm font-medium text-slate-700">Usuario</label>
        <input
          id="usuario" name="usuario" autoComplete="username" autoCapitalize="none" required autoFocus
          defaultValue={estado.usuario} placeholder="nombre.apellido" className="campo mt-1"
        />
      </div>
      <div>
        <label htmlFor="clave" className="block text-sm font-medium text-slate-700">Contraseña</label>
        <input id="clave" name="clave" type="password" autoComplete="current-password" required className="campo mt-1" />
      </div>
      {estado.error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{estado.error}</p>
      )}
      <button type="submit" disabled={enviando} className="boton w-full py-2.5">
        {enviando ? 'Ingresando…' : 'Ingresar'}
      </button>
    </form>
  )
}
