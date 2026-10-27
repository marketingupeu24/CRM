'use client'

// Lugar con listas desplegables encadenadas: departamento → provincia → distrito (UBIGEO del INEI).
// Para los formularios públicos del QR. Envía en el campo oculto `nombre` el código más preciso elegido.
import { useEffect, useMemo, useState } from 'react'
import { cargarUbigeos, nivelUbigeo, type FilaUbigeo } from '@/lib/ubigeos'

export function SelectorLugar({ nombre, etiqueta, hasta = 'distrito', obligatorio = false, claseCampo = 'campo' }: {
  /** Campo oculto con el código (ej. "ubigeo" o "pl_p3") */
  nombre: string
  etiqueta: string
  /** Hasta qué nivel se pide */
  hasta?: 'provincia' | 'distrito'
  obligatorio?: boolean
  claseCampo?: string
}) {
  const [filas, setFilas] = useState<FilaUbigeo[] | null>(null)
  const [error, setError] = useState(false)
  const [dep, setDep] = useState('')
  const [prov, setProv] = useState('')
  const [dist, setDist] = useState('')

  useEffect(() => {
    let vigente = true
    cargarUbigeos().then((f) => { if (vigente) setFilas(f) }).catch(() => { if (vigente) setError(true) })
    return () => { vigente = false }
  }, [])

  const { departamentos, provincias, distritos } = useMemo(() => {
    const ordenar = (a: FilaUbigeo, b: FilaUbigeo) => a[1].localeCompare(b[1], 'es')
    const lista = filas ?? []
    return {
      departamentos: lista.filter((f) => nivelUbigeo(f[0]) === 1).sort(ordenar),
      provincias: dep ? lista.filter((f) => nivelUbigeo(f[0]) === 2 && f[0].startsWith(dep.slice(0, 2))).sort(ordenar) : [],
      distritos: prov ? lista.filter((f) => nivelUbigeo(f[0]) === 3 && f[0].startsWith(prov.slice(0, 4))).sort(ordenar) : [],
    }
  }, [filas, dep, prov])

  const sufijo = obligatorio ? ' *' : ''
  const cargando = !filas && !error
  return (
    <fieldset className="text-sm">
      <legend className="font-medium text-slate-700">{etiqueta}</legend>
      <input type="hidden" name={nombre} value={dist || prov || dep} />
      {error && <p className="mt-1 text-xs text-rose-600">No se pudo cargar la lista de lugares. Revisa tu conexión y vuelve a abrir el formulario.</p>}
      <div className={`grid gap-2 ${hasta === 'distrito' ? 'sm:grid-cols-3' : 'grid-cols-2'}`}>
        <label className="block text-xs text-slate-500">Departamento{sufijo}
          <select value={dep} required={obligatorio} disabled={cargando} onChange={(e) => { setDep(e.target.value); setProv(''); setDist('') }} className={claseCampo}>
            <option value="">{cargando ? 'Cargando…' : 'Elige'}</option>
            {departamentos.map((f) => <option key={f[0]} value={f[0]}>{f[1]}</option>)}
          </select>
        </label>
        <label className="block text-xs text-slate-500">Provincia{sufijo}
          <select value={prov} required={obligatorio} disabled={!dep} onChange={(e) => { setProv(e.target.value); setDist('') }} className={claseCampo}>
            <option value="">{dep ? 'Elige' : '—'}</option>
            {provincias.map((f) => <option key={f[0]} value={f[0]}>{f[1]}</option>)}
          </select>
        </label>
        {hasta === 'distrito' && (
          <label className="block text-xs text-slate-500">Distrito{sufijo}
            <select value={dist} required={obligatorio} disabled={!prov} onChange={(e) => setDist(e.target.value)} className={claseCampo}>
              <option value="">{prov ? 'Elige' : '—'}</option>
              {distritos.map((f) => <option key={f[0]} value={f[0]}>{f[1]}</option>)}
            </select>
          </label>
        )}
      </div>
    </fieldset>
  )
}
