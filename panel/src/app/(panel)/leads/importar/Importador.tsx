'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { ORIGENES } from '@crm/db'
import { SelectorAsignacion, type PermisosAsignacion } from '@/components/SelectorAsignacion'
import { COLUMNAS, filaVacia, leerTabla, PLANTILLA_CSV, problemaFila, type FilaImportar } from '@/lib/importar'
import { importarLeads, type ResultadoFila } from './acciones'

const TITULOS: Record<keyof FilaImportar, string> = {
  nombre: 'Nombres y apellidos *', celular: 'Celular *', dni: 'DNI', carrera: 'Carrera', colegio: 'Colegio', grado: 'Grado',
}

const ESTILO_ESTADO: Record<ResultadoFila['estado'], string> = {
  nuevo: 'bg-emerald-50 text-emerald-700',
  actualizado: 'bg-marca-50 text-marca-700',
  omitido: 'bg-amber-50 text-amber-800',
  error: 'bg-rose-50 text-rose-700',
}

export function Importador({ carreras, actividades, asignacion }: {
  carreras: string[]
  actividades: { id: number; nombre: string }[]
  asignacion: PermisosAsignacion
}) {
  const [filas, setFilas] = useState<FilaImportar[]>(() => Array.from({ length: 5 }, filaVacia))
  const [pegado, setPegado] = useState('')
  const [vista, setVista] = useState<'planilla' | 'pegar'>('planilla')
  const [actividadId, setActividadId] = useState('')
  const [asesorId, setAsesorId] = useState('')
  const [origen, setOrigen] = useState('')
  const [resultados, setResultados] = useState<ResultadoFila[] | null>(null)
  const [aviso, setAviso] = useState<{ texto: string; error?: boolean } | null>(null)
  const [pendiente, iniciar] = useTransition()

  const llenas = filas.filter((f) => f.nombre.trim() || f.celular.trim())
  const conProblema = llenas.filter((f) => problemaFila(f)).length

  const cargar = (nuevas: FilaImportar[], origenTexto: string) => {
    if (!nuevas.length) { setAviso({ texto: `No encontré alumnos en ${origenTexto}.`, error: true }); return }
    setFilas([...nuevas, filaVacia()])
    setResultados(null)
    setVista('planilla')
    setAviso({ texto: `${nuevas.length} ${nuevas.length === 1 ? 'alumno cargado' : 'alumnos cargados'} desde ${origenTexto}. Revisa la planilla y pulsa Importar.` })
  }

  const cambiar = (i: number, col: keyof FilaImportar, valor: string) => {
    setFilas((fs) => {
      const copia = fs.map((f, j) => (j === i ? { ...f, [col]: valor } : f))
      // Siempre queda una fila vacía al final para seguir escribiendo
      if (i === copia.length - 1 && valor.trim()) copia.push(filaVacia())
      return copia
    })
  }

  /** Pegar varias celdas de Excel directamente en la planilla */
  const alPegarEnCelda = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const texto = e.clipboardData.getData('text')
    if (!texto.includes('\t') && !texto.includes('\n')) return
    e.preventDefault()
    cargar(leerTabla(texto), 'lo pegado')
  }

  const subirArchivo = async (archivo: File | undefined) => {
    if (!archivo) return
    if (!/\.(csv|txt)$/i.test(archivo.name)) {
      setAviso({ texto: 'Sube un archivo .csv (en Excel: Archivo → Guardar como → CSV). O copia las celdas y pégalas.', error: true }); return
    }
    cargar(leerTabla(await archivo.text()), archivo.name)
  }

  const descargarPlantilla = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([PLANTILLA_CSV], { type: 'text/csv;charset=utf-8' }))
    a.download = 'plantilla_alumnos.csv'
    document.body.appendChild(a); a.click(); a.remove()
  }

  const importar = () => {
    setAviso(null)
    iniciar(async () => {
      const r = await importarLeads(llenas, {
        actividadId: actividadId ? Number(actividadId) : null,
        asesorId: asesorId || null,
        origen: origen || null,
      })
      if (r.error) { setAviso({ texto: r.error, error: true }); return }
      setResultados(r.resultados ?? [])
      const n = (e: ResultadoFila['estado']) => (r.resultados ?? []).filter((x) => x.estado === e).length
      setAviso({ texto: `Listo: ${n('nuevo')} nuevos, ${n('actualizado')} actualizados${n('omitido') ? `, ${n('omitido')} omitidos` : ''}${n('error') ? `, ${n('error')} con error` : ''}.`, error: n('error') > 0 })
    })
  }

  const resultadoDe = (i: number) => resultados?.find((r) => r.fila === i + 1)

  return (
    <div className="space-y-5">
      <div className="tarjeta grid gap-3 p-5 sm:grid-cols-3">
        <label className="text-sm text-slate-600">Actividad (opcional)
          <select value={actividadId} onChange={(e) => setActividadId(e.target.value)} className="campo mt-1">
            <option value="">Ninguna</option>
            {actividades.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
          <span className="text-xs text-slate-500">Para fichas en papel de una feria o colegio: se cuentan en esa actividad.</span>
        </label>
        <label className="text-sm text-slate-600">Asignar a
          <SelectorAsignacion valor={asesorId} alCambiar={setAsesorId} permisos={asignacion} />
        </label>
        <label className="text-sm text-slate-600">¿Cómo nos conocieron? (opcional)
          <select value={origen} onChange={(e) => setOrigen(e.target.value)} className="campo mt-1">
            <option value="">{actividadId ? 'Feria / colegio' : 'Sin dato'}</option>
            {ORIGENES.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
      </div>

      <div className="tarjeta overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <div className="flex rounded-lg bg-slate-100 p-1 text-sm">
            <button type="button" onClick={() => setVista('planilla')} className={`rounded-md px-3 py-1.5 ${vista === 'planilla' ? 'bg-superficie font-semibold shadow-theme-xs' : 'text-slate-600'}`}>✏️ Planilla</button>
            <button type="button" onClick={() => setVista('pegar')} className={`rounded-md px-3 py-1.5 ${vista === 'pegar' ? 'bg-superficie font-semibold shadow-theme-xs' : 'text-slate-600'}`}>📋 Pegar desde Excel</button>
          </div>
          <label className="boton-secundario cursor-pointer">
            ⬆ Subir CSV
            <input type="file" accept=".csv,.txt,text/csv" className="hidden" onChange={(e) => { subirArchivo(e.target.files?.[0]); e.target.value = '' }} />
          </label>
          <button type="button" onClick={descargarPlantilla} className="text-sm font-medium text-marca-700 hover:underline">Descargar plantilla</button>
          <span className="ml-auto text-sm text-slate-500">{llenas.length} {llenas.length === 1 ? 'alumno' : 'alumnos'}{conProblema ? ` · ${conProblema} por revisar` : ''}</span>
        </div>

        {vista === 'pegar' ? (
          <div className="space-y-3 p-4">
            <p className="text-sm text-slate-600">
              En Excel o Google Sheets selecciona las celdas (con o sin la fila de títulos) y pégalas aquí. Orden sugerido:
              <b> nombre, celular, DNI, carrera, colegio, grado</b>.
            </p>
            <textarea value={pegado} onChange={(e) => setPegado(e.target.value)} rows={10} placeholder={'Rosa Mamani Quispe\t951234567\t71234567\tEnfermería\nJuan Pérez\t987654321\t\tDerecho'} className="campo font-mono text-xs" />
            <button type="button" className="boton" disabled={!pegado.trim()} onClick={() => { cargar(leerTabla(pegado), 'lo pegado'); setPegado('') }}>Pasar a la planilla</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <tr>
                  <th className="w-8 px-2 py-2 text-center">#</th>
                  {COLUMNAS.map((c) => <th key={c} className="px-1 py-2">{TITULOS[c]}</th>)}
                  <th className="px-2 py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => {
                  const problema = problemaFila(f)
                  const r = resultadoDe(i)
                  return (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-2 text-center text-xs text-slate-400">{i + 1}</td>
                      {COLUMNAS.map((c) => (
                        <td key={c} className="px-1 py-1">
                          <input
                            value={f[c]} onChange={(e) => cambiar(i, c, e.target.value)} onPaste={alPegarEnCelda}
                            list={c === 'carrera' ? 'carreras-importar' : undefined}
                            inputMode={c === 'celular' || c === 'dni' ? 'numeric' : undefined}
                            aria-label={`${TITULOS[c]} fila ${i + 1}`}
                            className={`w-full ${c === 'nombre' ? 'min-w-56' : c === 'colegio' || c === 'carrera' ? 'min-w-40' : 'min-w-28'} rounded-md border px-2 py-1.5 text-sm ${problema && (f.nombre || f.celular) ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 bg-superficie'}`}
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1 text-xs whitespace-nowrap">
                        {r ? (
                          <span className={`rounded-full px-2 py-0.5 font-medium ${ESTILO_ESTADO[r.estado]}`} title={r.mensaje}>
                            {r.lead_id ? <Link href={`/leads/${r.lead_id}`} className="hover:underline">{r.estado}</Link> : r.estado}
                            {r.estado !== 'nuevo' && r.estado !== 'actualizado' ? ` · ${r.mensaje}` : ''}
                          </span>
                        ) : problema && (f.nombre || f.celular) ? <span className="text-amber-700">{problema}</span> : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <datalist id="carreras-importar">
              <option value="CEPRE" />
              {carreras.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="boton" disabled={pendiente || !llenas.length} onClick={importar}>
          {pendiente ? 'Importando…' : `Importar ${llenas.length || ''} ${llenas.length === 1 ? 'alumno' : 'alumnos'}`}
        </button>
        {(resultados || llenas.length > 0) && (
          <button type="button" className="boton-secundario" disabled={pendiente} onClick={() => { setFilas(Array.from({ length: 5 }, filaVacia)); setResultados(null); setAviso(null) }}>
            Empezar de nuevo
          </button>
        )}
        {aviso && <p role="status" className={`text-sm ${aviso.error ? 'text-rose-600' : 'text-emerald-700'}`}>{aviso.texto}</p>}
      </div>
      <p className="text-xs text-slate-500">
        No se duplican: si un alumno ya existe (mismo DNI o celular) se actualizan sus datos. A los alumnos no se les envía ningún mensaje;
        los asesores reciben un solo aviso con sus leads nuevos.
      </p>
    </div>
  )
}
