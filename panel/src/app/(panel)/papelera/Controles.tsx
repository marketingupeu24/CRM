'use client'

import { useState, useTransition } from 'react'
import { useConfirmar } from '@/components/Confirmacion'
import { borrarAsesor, borrarLeads, restaurarAsesor, restaurarLeads, type Resultado } from './acciones'

function Mensaje({ r }: { r: Resultado }) {
  if (r.error) return <p role="alert" className="text-sm text-rose-600">{r.error}</p>
  if (r.ok) return <p role="status" className="text-sm text-emerald-600">{r.ok}</p>
  return null
}

/** Restaurar o borrar para siempre uno o varios leads (ids). */
export function AccionesLeads({ ids, texto, compacto = false }: { ids: string[]; texto: string; compacto?: boolean }) {
  const [r, setR] = useState<Resultado>({})
  const [pendiente, iniciar] = useTransition()
  const confirmar = useConfirmar()
  if (!ids.length) return null
  return (
    <div className={compacto ? 'flex flex-wrap items-center gap-3 text-xs font-medium' : 'flex flex-wrap items-center gap-2'}>
      <button
        disabled={pendiente} className={compacto ? 'text-marca-700 hover:underline' : 'boton-secundario'}
        onClick={() => iniciar(async () => setR(await restaurarLeads(ids)))}
      >
        ↩ Restaurar{compacto ? '' : ` ${texto}`}
      </button>
      <button
        disabled={pendiente} className={compacto ? 'text-rose-600 hover:underline' : 'rounded-lg px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50'}
        onClick={async () => {
          if (await confirmar({ titulo: `¿Borrar para siempre ${texto}?`, mensaje: 'Se pierden su conversación y su historial. No se puede deshacer.', confirmar: 'Borrar para siempre', peligro: true })) {
            iniciar(async () => setR(await borrarLeads(ids)))
          }
        }}
      >
        Borrar para siempre{compacto ? '' : ` ${texto}`}
      </button>
      <Mensaje r={r} />
    </div>
  )
}

export function AccionesUsuario({ id, nombre }: { id: string; nombre: string }) {
  const [r, setR] = useState<Resultado>({})
  const [pendiente, iniciar] = useTransition()
  const confirmar = useConfirmar()
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
      <button disabled={pendiente} className="text-marca-700 hover:underline" onClick={() => iniciar(async () => setR(await restaurarAsesor(id)))}>
        ↩ Restaurar
      </button>
      <button
        disabled={pendiente} className="text-rose-600 hover:underline"
        onClick={async () => {
          if (await confirmar({ titulo: `¿Borrar para siempre a ${nombre}?`, mensaje: 'También se borra su cuenta de acceso. No se puede deshacer.', confirmar: 'Borrar para siempre', peligro: true })) {
            iniciar(async () => setR(await borrarAsesor(id)))
          }
        }}
      >
        Borrar para siempre
      </button>
      <Mensaje r={r} />
    </div>
  )
}
