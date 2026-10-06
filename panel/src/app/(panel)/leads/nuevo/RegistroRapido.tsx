'use client'

// Registro rápido de fichas en papel: se queda en la pantalla, conserva los datos de la tanda,
// avisa de duplicados mientras se escribe y guarda con Enter.
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ORIGENES } from '@crm/db'
import { SelectorAsignacion, type PermisosAsignacion } from '@/components/SelectorAsignacion'
import { buscarExistente, registrarFicha, type DatosTanda, type Existente, type Ficha, type ResultadoFicha } from './acciones'

const CLAVE_TANDA = 'crm-fichas-tanda'
const GRADOS = ['5.° de secundaria', '4.° de secundaria', '3.° de secundaria o menos', 'Ya terminé el colegio', 'Universitario / traslado']

const fichaVacia = (tanda: { colegio: string; grado: string }): Ficha => ({
  nombre: '', celular: '', dni: '', carrera: '', colegio: tanda.colegio, grado: tanda.grado, observacion: '',
})

/** "ROSA MAMANI QUISPE" -> "Rosa Mamani Quispe" (las fichas suelen venir en mayúsculas) */
function nombrePropio(texto: string): string {
  const t = texto.replace(/\s+/g, ' ').trim()
  if (t !== t.toUpperCase() && t !== t.toLowerCase()) return t
  return t.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, letra: string) => sep + letra.toUpperCase())
    .replace(/\b(De|Del|La|Las|Los|Y)\b/g, (m) => m.toLowerCase()).replace(/^./, (c) => c.toUpperCase())
}

interface Registro extends ResultadoFicha { nombre: string; celular: string; hora: string }

const ESTILO: Record<string, string> = {
  nuevo: 'bg-emerald-50 text-emerald-700', actualizado: 'bg-marca-50 text-marca-700',
  omitido: 'bg-amber-50 text-amber-800', error: 'bg-rose-50 text-rose-700',
}

export function RegistroRapido({ carreras, actividades, asignacion, convocatorias }: {
  carreras: string[]
  actividades: { id: number; nombre: string; lugar: string | null; tipo: string }[]
  asignacion: PermisosAsignacion
  convocatorias: string[]
}) {
  const [tanda, setTanda] = useState<DatosTanda & { colegio: string; grado: string }>({ actividadId: '', asesorId: '', origen: '', convocatoria: '', colegio: '', grado: '' })
  const [verTanda, setVerTanda] = useState(false)
  const [ficha, setFicha] = useState<Ficha>(fichaVacia({ colegio: '', grado: '' }))
  const [existente, setExistente] = useState<Existente | null>(null)
  const [registros, setRegistros] = useState<Registro[]>([])
  const [aviso, setAviso] = useState<{ texto: string; error?: boolean } | null>(null)
  // Estado propio (no useTransition): así el botón se libera apenas responde el servidor,
  // sin esperar a que Next refresque la página en segundo plano
  const [pendiente, setPendiente] = useState(false)
  const nombreRef = useRef<HTMLInputElement>(null)

  // Datos de la tanda: se recuerdan en este navegador
  useEffect(() => {
    try {
      const guardada = JSON.parse(localStorage.getItem(CLAVE_TANDA) ?? 'null')
      if (guardada) { setTanda((t) => ({ ...t, ...guardada })); setFicha((f) => ({ ...f, colegio: guardada.colegio ?? '', grado: guardada.grado ?? '' })) }
    } catch { /* sin almacenamiento */ }
    nombreRef.current?.focus()
  }, [])
  const cambiarTanda = (cambios: Partial<typeof tanda>) => {
    setTanda((t) => {
      const nueva = { ...t, ...cambios }
      try { localStorage.setItem(CLAVE_TANDA, JSON.stringify(nueva)) } catch { /* sin almacenamiento */ }
      return nueva
    })
    if ('colegio' in cambios || 'grado' in cambios) setFicha((f) => ({ ...f, ...('colegio' in cambios ? { colegio: cambios.colegio! } : {}), ...('grado' in cambios ? { grado: cambios.grado! } : {}) }))
  }
  // Al elegir una visita a colegio, el colegio de la tanda es el lugar de la actividad
  const elegirActividad = (id: string) => {
    const act = actividades.find((a) => String(a.id) === id)
    cambiarTanda({ actividadId: id, ...(act?.tipo === 'colegio' && act.lugar ? { colegio: act.lugar } : {}) })
  }

  // ¿Ya existe? (se consulta mientras se escribe el celular o el DNI)
  useEffect(() => {
    const tel = ficha.celular.replace(/\D/g, ''), dni = ficha.dni.replace(/\D/g, '')
    if (tel.length < 9 && dni.length < 8) { setExistente(null); return }
    let vigente = true
    const t = setTimeout(async () => { const r = await buscarExistente(tel, dni); if (vigente) setExistente(r) }, 350)
    return () => { vigente = false; clearTimeout(t) }
  }, [ficha.celular, ficha.dni])

  const tel = ficha.celular.replace(/\D/g, '')
  const celularValido = /^9\d{8}$/.test(tel) || /^\d{10,15}$/.test(tel)
  const puedeGuardar = ficha.nombre.trim().length >= 3 && celularValido && !pendiente

  function guardar(e?: React.FormEvent) {
    e?.preventDefault()
    if (!puedeGuardar) {
      setAviso({ texto: ficha.nombre.trim().length < 3 ? 'Escribe el nombre.' : 'Revisa el celular (9 dígitos).', error: true })
      return
    }
    const datos = { ...ficha, nombre: nombrePropio(ficha.nombre) }
    setPendiente(true)
    void (async () => {
      const r = await registrarFicha(datos, tanda).catch(() => ({ error: 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.' }) as ResultadoFicha)
      setPendiente(false)
      const hora = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
      if (r.error) { setAviso({ texto: r.error, error: true }); return }
      setRegistros((rs) => [{ ...r, nombre: datos.nombre, celular: datos.celular, hora }, ...rs])
      if (r.estado === 'error' || r.estado === 'omitido') {
        setAviso({ texto: `${datos.nombre}: ${r.mensaje}`, error: true })
        return
      }
      setAviso({ texto: `✓ ${datos.nombre} ${r.estado === 'nuevo' ? 'registrado' : 'actualizado'} · ${r.mensaje}` })
      setFicha(fichaVacia(tanda))
      setExistente(null)
      nombreRef.current?.focus()
    })()
  }

  const campo = 'campo mt-1'
  const actividad = actividades.find((a) => String(a.id) === tanda.actividadId)
  const resumenTanda = [
    actividad?.nombre, tanda.colegio, tanda.grado, tanda.origen,
    tanda.asesorId === 'repartir' || (!tanda.asesorId && !asignacion.recibeLeads) ? 'Reparto por igual'
      : tanda.asesorId ? asignacion.asesores.find((a) => a.id === tanda.asesorId)?.nombre : 'A mi nombre',
    tanda.convocatoria && `Conv. ${tanda.convocatoria}`,
  ].filter(Boolean)
  const nuevos = registros.filter((r) => r.estado === 'nuevo').length

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-4">
        {/* Datos que se repiten en todas las fichas de la tanda */}
        <section className="tarjeta p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">Datos de la tanda</span>
            {resumenTanda.length
              ? resumenTanda.map((t) => <span key={t} className="rounded-full bg-dorado-50 px-2.5 py-0.5 text-xs font-medium text-dorado-700">{t}</span>)
              : <span className="text-xs text-slate-500">Ninguno (cada ficha por separado)</span>}
            <button type="button" onClick={() => setVerTanda(!verTanda)} className="ml-auto text-sm font-medium text-marca-700 hover:underline">
              {verTanda ? 'Listo' : 'Cambiar'}
            </button>
          </div>
          {verTanda && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-sm text-slate-600">Actividad
                <select value={tanda.actividadId} onChange={(e) => elegirActividad(e.target.value)} className={campo}>
                  <option value="">Ninguna</option>
                  {actividades.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
              </label>
              <label className="text-sm text-slate-600">Colegio (para todas)
                <input value={tanda.colegio} onChange={(e) => cambiarTanda({ colegio: e.target.value })} placeholder="Opcional" className={campo} />
              </label>
              <label className="text-sm text-slate-600">Grado (para todas)
                <select value={tanda.grado} onChange={(e) => cambiarTanda({ grado: e.target.value })} className={campo}>
                  <option value="">—</option>
                  {GRADOS.map((g) => <option key={g}>{g}</option>)}
                </select>
              </label>
              <label className="text-sm text-slate-600">¿Cómo nos conocieron?
                <select value={tanda.origen} onChange={(e) => cambiarTanda({ origen: e.target.value })} className={campo}>
                  <option value="">{tanda.actividadId ? 'Feria / colegio' : 'Sin dato'}</option>
                  {ORIGENES.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
              <label className="text-sm text-slate-600">Asignar a
                <SelectorAsignacion valor={tanda.asesorId} alCambiar={(v) => cambiarTanda({ asesorId: v })} permisos={asignacion} />
              </label>
              <label className="text-sm text-slate-600">Convocatoria
                <input value={tanda.convocatoria} onChange={(e) => cambiarTanda({ convocatoria: e.target.value })} list="convocatorias-fichas" placeholder="2027-1" className={campo} />
                <datalist id="convocatorias-fichas">{convocatorias.map((c) => <option key={c} value={c} />)}</datalist>
              </label>
            </div>
          )}
        </section>

        {/* La ficha */}
        <form onSubmit={guardar} className="tarjeta grid gap-3 p-5 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">Nombres y apellidos *
            <input
              ref={nombreRef} value={ficha.nombre} required autoComplete="off"
              onChange={(e) => setFicha({ ...ficha, nombre: e.target.value })}
              onBlur={(e) => setFicha((f) => ({ ...f, nombre: nombrePropio(e.target.value) }))}
              className={`${campo} text-base`}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">Celular *
            <input value={ficha.celular} onChange={(e) => setFicha({ ...ficha, celular: e.target.value })} inputMode="tel" autoComplete="off" placeholder="951 234 567"
              className={`${campo} text-base ${ficha.celular && !celularValido ? 'border-amber-400' : ''}`} />
          </label>
          <label className="text-sm font-medium text-slate-700">DNI <span className="font-normal text-slate-400">(opcional)</span>
            <input value={ficha.dni} onChange={(e) => setFicha({ ...ficha, dni: e.target.value })} inputMode="numeric" maxLength={12} autoComplete="off" className={`${campo} text-base`} />
          </label>
          {existente && (
            <p className={`rounded-lg px-3 py-2 text-sm sm:col-span-2 ${existente.de_otro_asesor ? 'bg-amber-50 text-amber-800' : 'bg-marca-50 text-marca-700'}`}>
              {existente.de_otro_asesor
                ? `Este ${existente.por === 'dni' ? 'DNI' : 'celular'} ya es de otro asesor: no se registrará de nuevo.`
                : <>Ya está registrado por su {existente.por === 'dni' ? 'DNI' : 'celular'}{existente.nombre ? <>: <b>{existente.nombre}</b></> : ''}{existente.asesor ? ` (asesor: ${existente.asesor})` : ''}. Se actualizarán sus datos, sin duplicar.{existente.en_papelera ? ' Volverá de la papelera.' : ''}
                  {existente.lead_id && <> <Link href={`/leads/${existente.lead_id}`} target="_blank" className="font-medium underline">Ver</Link></>}</>}
            </p>
          )}
          <label className="text-sm font-medium text-slate-700">Carrera
            <input value={ficha.carrera} onChange={(e) => setFicha({ ...ficha, carrera: e.target.value })} list="carreras-fichas" autoComplete="off" placeholder="Escribe y elige" className={campo} />
            <datalist id="carreras-fichas"><option value="CEPRE" />{carreras.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <label className="text-sm font-medium text-slate-700">Colegio
            <input value={ficha.colegio} onChange={(e) => setFicha({ ...ficha, colegio: e.target.value })} autoComplete="off" className={campo} />
          </label>
          <label className="text-sm font-medium text-slate-700">Grado
            <select value={ficha.grado} onChange={(e) => setFicha({ ...ficha, grado: e.target.value })} className={campo}>
              <option value="">—</option>
              {GRADOS.map((g) => <option key={g}>{g}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">Observación
            <input value={ficha.observacion} onChange={(e) => setFicha({ ...ficha, observacion: e.target.value })} autoComplete="off" placeholder="Opcional" className={campo} />
          </label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button className="boton" disabled={pendiente}>{pendiente ? 'Guardando…' : 'Guardar y siguiente ↵'}</button>
            <span className="text-xs text-slate-500">Enter guarda · Tab pasa al siguiente campo</span>
          </div>
          {aviso && <p role="status" className={`text-sm sm:col-span-2 ${aviso.error ? 'text-rose-600' : 'text-emerald-700'}`}>{aviso.texto}</p>}
        </form>
      </div>

      {/* Lo registrado en esta tanda */}
      <aside className="tarjeta p-4 xl:sticky xl:top-20">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-semibold">En esta tanda</h2>
          <span className="text-sm text-slate-500">{registros.length} {registros.length === 1 ? 'ficha' : 'fichas'}{nuevos ? ` · ${nuevos} nuevas` : ''}</span>
        </div>
        {registros.length ? (
          <ol className="max-h-[60vh] space-y-1.5 overflow-y-auto text-sm">
            {registros.map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                <span className="min-w-0">
                  {r.leadId ? <Link href={`/leads/${r.leadId}`} className="block truncate font-medium text-marca-700 hover:underline">{r.nombre}</Link> : <span className="block truncate font-medium">{r.nombre}</span>}
                  <span className="block truncate text-xs text-slate-500">{r.hora} · {r.mensaje}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {r.leadId && <Link href={`/leads/${r.leadId}#editar`} target="_blank" className="text-xs font-medium text-marca-700 hover:underline" title="Corregir los datos de esta ficha">✏️ Editar</Link>}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTILO[r.estado ?? 'error']}`}>{r.estado}</span>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-slate-500">Aquí aparecerán las fichas que vayas guardando.</p>
        )}
        <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
          Los asesores reciben un resumen por WhatsApp cada 3 minutos con sus leads nuevos (no un mensaje por ficha). A los alumnos no se les escribe.
        </p>
      </aside>
    </div>
  )
}
