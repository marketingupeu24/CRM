'use client'

// A quién van los leads que se registran: por defecto a nombre de quien registra;
// "repartir" (módulo Repartir) los reparte por igual; con "Asignar" se elige un asesor.
// Valor: "" = a mi nombre · "repartir" · uuid del asesor.

export interface PermisosAsignacion {
  /** El usuario recibe leads (es asesor activo): "A mi nombre" tiene sentido */
  recibeLeads: boolean
  puedeRepartir: boolean
  /** Asesores elegibles (solo con el módulo Asignar) */
  asesores: { id: string; nombre: string }[]
}

export function SelectorAsignacion({ valor, alCambiar, permisos, className = 'campo mt-1' }: {
  valor: string
  alCambiar: (v: string) => void
  permisos: PermisosAsignacion
  className?: string
}) {
  const { recibeLeads, puedeRepartir, asesores } = permisos
  // Sin opciones que elegir: queda a su nombre
  if (!puedeRepartir && !asesores.length) {
    return <p className={`${className} bg-slate-50 text-slate-500`}>A tu nombre</p>
  }
  return (
    <select value={valor} onChange={(e) => alCambiar(e.target.value)} className={className}>
      <option value="">{recibeLeads ? 'A mi nombre' : 'Repartir por igual (tú no recibes leads)'}</option>
      {puedeRepartir && recibeLeads && <option value="repartir">Repartir por igual entre los asesores</option>}
      {asesores.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
    </select>
  )
}
