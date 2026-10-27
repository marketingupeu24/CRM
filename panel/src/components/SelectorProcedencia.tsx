'use client'

// "¿De dónde es?": país y, en el Perú, un solo buscador de distrito, provincia o departamento (UBIGEO del INEI).
// Un buscador con sugerencias es más rápido que tres listas seguidas (1 893 distritos) y permite quedarse en el
// nivel que se sepa ("Puno" o "Juliaca"). Envía los campos ocultos "ubigeo" y (si se pide) "pais".
import { useEffect, useId, useMemo, useState } from 'react'
import { PAISES, buscarUbigeos, cargarUbigeos, nivelUbigeo, nombrePais, rutaUbigeo, type FilaUbigeo } from '@/lib/ubigeos'

const NIVEL = { 1: 'Departamento', 2: 'Provincia', 3: 'Distrito' } as const

export function SelectorProcedencia({ ubigeo, pais, paisDelCelular, conPais = true, claseCampo = 'campo', etiqueta = '¿De dónde es?', ayuda, alCambiar, nombre = 'ubigeo' }: {
  ubigeo: string | null
  /** País guardado (null = el del celular) */
  pais?: string | null
  paisDelCelular?: string | null
  /** Mostrar la lista de países (en los formularios públicos el país sale del celular) */
  conPais?: boolean
  claseCampo?: string
  etiqueta?: string
  ayuda?: string
  /** Para formularios con estado propio (además del campo oculto) */
  alCambiar?: (ubigeo: string) => void
  /** Nombre del campo oculto con el código (por defecto "ubigeo") */
  nombre?: string
}) {
  const id = useId()
  const [filas, setFilas] = useState<FilaUbigeo[] | null>(null)
  const [error, setError] = useState(false)
  const [codigo, setCodigo] = useState(ubigeo ?? '')
  const [paisElegido, setPaisElegido] = useState(pais ?? '')
  const [consulta, setConsulta] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [activo, setActivo] = useState(0)

  useEffect(() => {
    let vigente = true
    cargarUbigeos().then((f) => { if (vigente) setFilas(f) }).catch(() => { if (vigente) setError(true) })
    return () => { vigente = false }
  }, [])

  const paisFinal = paisElegido || paisDelCelular || 'PE'
  const enPeru = paisFinal === 'PE'
  const mapa = useMemo(() => (filas ? new Map(filas) : null), [filas])
  const sugerencias = filas && abierto ? buscarUbigeos(consulta, filas) : []

  const cambiar = (c: string) => { setCodigo(c); alCambiar?.(c) }
  const elegir = (f: FilaUbigeo) => { cambiar(f[0]); setConsulta(''); setAbierto(false) }
  const teclas = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!sugerencias.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActivo((a) => (a + 1) % sugerencias.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo((a) => (a - 1 + sugerencias.length) % sugerencias.length) }
    else if (e.key === 'Enter') { e.preventDefault(); elegir(sugerencias[activo] ?? sugerencias[0]!) }
    else if (e.key === 'Escape') setAbierto(false)
  }

  return (
    <div className="space-y-2">
      {conPais && (
        <label className="block text-sm text-slate-600">
          País
          <select name="pais" value={paisElegido} onChange={(e) => setPaisElegido(e.target.value)} className={`${claseCampo} mt-1`}>
            <option value="">{paisDelCelular ? `${nombrePais(paisDelCelular)} (según su celular)` : 'Sin dato'}</option>
            {PAISES.filter((p) => p !== paisDelCelular).map((p) => <option key={p} value={p}>{nombrePais(p)}</option>)}
            {pais && !(PAISES as readonly string[]).includes(pais) && pais !== paisDelCelular && <option value={pais}>{nombrePais(pais)}</option>}
          </select>
        </label>
      )}
      {/* Fuera del Perú no hay UBIGEO: se guarda vacío */}
      <input type="hidden" name={nombre} value={enPeru ? codigo : ''} />
      {enPeru && (
        <div className="relative text-sm text-slate-600">
          <label htmlFor={`${id}-buscar`}>{etiqueta}</label>
          {codigo ? (
            <div className={`${claseCampo} mt-1 flex items-center justify-between gap-2`}>
              <span className="min-w-0 truncate text-slate-800">
                📍 {mapa ? rutaUbigeo(codigo, mapa) : '…'}
              </span>
              <button type="button" onClick={() => cambiar('')} className="shrink-0 text-xs font-medium text-marca-700 hover:underline">Cambiar</button>
            </div>
          ) : (
            <input
              id={`${id}-buscar`} value={consulta} autoComplete="off" disabled={error}
              placeholder={error ? 'No se pudo cargar la lista de lugares' : 'Escribe el distrito, provincia o departamento'}
              role="combobox" aria-expanded={sugerencias.length > 0} aria-controls={`${id}-lista`} aria-autocomplete="list"
              aria-activedescendant={sugerencias.length ? `${id}-op-${activo}` : undefined}
              onChange={(e) => { setConsulta(e.target.value); setAbierto(true); setActivo(0) }}
              onFocus={() => setAbierto(true)}
              onBlur={() => setTimeout(() => setAbierto(false), 150)}
              onKeyDown={teclas}
              className={`${claseCampo} mt-1`}
            />
          )}
          {sugerencias.length > 0 && (
            <ul id={`${id}-lista`} role="listbox" className="absolute inset-x-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-superficie py-1 shadow-lg">
              {sugerencias.map((f, i) => (
                <li
                  key={f[0]} id={`${id}-op-${i}`} role="option" aria-selected={i === activo}
                  onMouseDown={(e) => { e.preventDefault(); elegir(f) }}
                  onMouseEnter={() => setActivo(i)}
                  className={`cursor-pointer px-3 py-2 ${i === activo ? 'bg-marca-50' : ''}`}
                >
                  <span className="block font-medium text-slate-800">{f[1]}</span>
                  <span className="block text-xs text-slate-500">
                    {NIVEL[nivelUbigeo(f[0])]}{nivelUbigeo(f[0]) > 1 && mapa ? ` · ${rutaUbigeo(f[0], mapa).split(' · ').slice(1).join(', ')}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {abierto && consulta.trim().length >= 2 && filas && !sugerencias.length && (
            <p className="mt-1 text-xs text-slate-500">No encontramos «{consulta}». Prueba con el distrito o la provincia.</p>
          )}
          {ayuda && !codigo && <p className="mt-1 text-xs text-slate-500">{ayuda}</p>}
        </div>
      )}
    </div>
  )
}
