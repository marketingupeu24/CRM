'use client'

import Link from 'next/link'
import { useActionState, useState, useTransition } from 'react'
import { CARRERAS_OFICIALES } from '@crm/db'
import { useAviso, useConfirmar } from '@/components/Confirmacion'
import { cambiarActivo, eliminarRecordatorio, guardarRecordatorio, guardarSeleccion, listarCandidatos, type Candidato, type Resultado } from './acciones'

const OPCIONES_CARRERA = [...CARRERAS_OFICIALES, 'CEPRE']

export interface Recordatorio {
  id: number
  titulo: string
  mensaje: string
  enviar_el: string
  desde_hora: string
  carreras: string[]
  excluir_carreras: string[]
  solo_registrados: boolean
  activo: boolean
  completado_at: string | null
  /** Automático: a quien lleva estos días sin contacto (una sola vez por alumno) */
  dias_sin_contacto: number | null
  dias_maximo: number
  /** null = a todos los que cumplan los filtros; con ids = solo a esos alumnos */
  solo_leads: string[] | null
}

function Mensaje({ r }: { r: Resultado }) {
  if (r.error) return <p role="alert" className="text-sm text-rose-600">{r.error}</p>
  if (r.ok) return <p className="text-sm text-emerald-600">{r.ok}</p>
  return null
}

/** Carreras con casillas: "Todas (excepto las marcadas)" o "Solo las marcadas". */
function SelectorCarreras({ rec }: { rec?: Recordatorio }) {
  const [modo, setModo] = useState<'todas' | 'solo'>(rec?.carreras.length ? 'solo' : 'todas')
  // Los recordatorios antiguos guardaban texto libre ("Medicina"): se marca la carrera oficial que lo contiene
  const guardadas = rec ? (rec.carreras.length ? rec.carreras : rec.excluir_carreras) : ['Medicina Humana']
  const marcada = (c: string) => guardadas.some((g) => c.toLowerCase().includes(g.toLowerCase()))
  const [marcadas, setMarcadas] = useState<string[]>(OPCIONES_CARRERA.filter(marcada))
  const alternar = (c: string) => setMarcadas((m) => (m.includes(c) ? m.filter((x) => x !== c) : [...m, c]))
  const chip = 'flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 has-checked:border-marca-600 has-checked:bg-marca-50'
  return (
    <fieldset className="md:col-span-2">
      <legend className="text-sm text-slate-600">Carreras</legend>
      <div className="mt-1 flex flex-wrap gap-2 text-sm">
        <label className={chip}><input type="radio" name="modo_carreras" value="todas" checked={modo === 'todas'} onChange={() => setModo('todas')} /> 👥 Todas las carreras</label>
        <label className={chip}><input type="radio" name="modo_carreras" value="solo" checked={modo === 'solo'} onChange={() => setModo('solo')} /> 🎯 Solo las que marque</label>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {modo === 'solo'
          ? `Le llega solo a quienes tienen como carrera de interés una de las marcadas (${marcadas.length}).`
          : marcadas.length ? `A todas, excepto las marcadas (${marcadas.length}).` : 'A todas las carreras. Marca alguna si quieres excluirla.'}
        <button type="button" className="ml-2 text-marca-700 hover:underline" onClick={() => setMarcadas([])}>Desmarcar todas</button>
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {OPCIONES_CARRERA.map((c) => (
          <label key={c} className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${marcadas.includes(c)
            ? modo === 'solo' ? 'border-marca-600 bg-marca-50 text-marca-800' : 'border-rose-300 bg-rose-50 text-rose-700 line-through'
            : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
            <input type="checkbox" name="carrera" value={c} checked={marcadas.includes(c)} onChange={() => alternar(c)} className="sr-only" />
            {marcadas.includes(c) ? (modo === 'solo' ? '✓' : '✕') : '+'} {c}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** Lista de alumnos que cumplen los filtros: elegir a quiénes se manda (o a todos). */
function Destinatarios({ rec }: { rec: Recordatorio }) {
  const [abierto, setAbierto] = useState(false)
  const [lista, setLista] = useState<Candidato[] | null>(null)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [buscar, setBuscar] = useState('')
  const [r, setR] = useState<Resultado>({})
  const [cargando, iniciar] = useTransition()
  const avisar = useAviso()

  const abrir = () => {
    setAbierto(!abierto)
    if (lista || abierto) return
    iniciar(async () => {
      const res = await listarCandidatos(rec.id)
      if (res.error) { void avisar(res.error); return }
      setLista(res.candidatos ?? [])
      setMarcados(new Set((res.candidatos ?? []).filter((c) => c.marcado).map((c) => c.id)))
    })
  }
  const normal = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const q = normal(buscar.trim())
  const visibles = (lista ?? []).filter((c) => !q || normal(`${c.nombre ?? ''} ${c.telefono} ${c.carrera ?? ''} ${c.asesor ?? ''}`).includes(q))
  const todos = !!lista && marcados.size === lista.length
  const poner = (ids: string[], valor: boolean) => setMarcados((m) => { const n = new Set(m); for (const id of ids) { if (valor) n.add(id); else n.delete(id) } return n })
  // En fecha la lista queda fija (se envía una sola vez a esos); los automáticos con todos marcados siguen sumando a los nuevos
  const automatico = rec.dias_sin_contacto !== null
  const guardar = () => iniciar(async () => setR(await guardarSeleccion(rec.id, todos && automatico ? null : [...marcados])))

  return (
    <div className="mt-3">
      <button type="button" onClick={abrir} className="text-sm font-medium text-marca-700 hover:underline">
        👥 {abierto ? 'Ocultar' : 'Elegir'} a quiénes se manda{rec.solo_leads ? ` · ${rec.solo_leads.length} elegidos` : ' · a todos los que cumplen'}
      </button>
      {abierto && (
        <div className="mt-2 rounded-lg border border-slate-200 p-3">
          {!lista ? <p className="text-sm text-slate-500">Cargando…</p> : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="⌕ Buscar nombre, celular, carrera o asesor" className="campo min-w-0 flex-1 basis-56 py-1.5" />
                <button type="button" className="boton-secundario py-1.5" onClick={() => poner(visibles.map((c) => c.id), true)}>✓ Todos{q ? ' (filtrados)' : ''}</button>
                <button type="button" className="boton-secundario py-1.5" onClick={() => poner(visibles.map((c) => c.id), false)}>Ninguno{q ? ' (filtrados)' : ''}</button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                <b>{marcados.size}</b> de {lista.length} marcados{todos && automatico ? ' · a todos (también a los que cumplan los filtros más adelante)' : ''}. Solo aparecen los que cumplen los filtros y aún no lo recibieron.
              </p>
              <ul className="mt-2 max-h-80 divide-y divide-slate-100 overflow-y-auto text-sm">
                {visibles.map((c) => (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-1 py-1.5 hover:bg-slate-50">
                      <input type="checkbox" checked={marcados.has(c.id)} onChange={(e) => poner([c.id], e.target.checked)} />
                      <span className="min-w-0 flex-1 truncate"><b className="font-medium">{c.nombre ?? c.telefono}</b> <span className="text-xs text-slate-500">· {c.carrera ?? 'sin carrera'}{c.asesor ? ` · ${c.asesor}` : ''}</span></span>
                    </label>
                  </li>
                ))}
                {!visibles.length && <li className="py-4 text-center text-slate-500">Nadie cumple los filtros.</li>}
              </ul>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="button" onClick={guardar} disabled={cargando || !marcados.size} className="boton">{cargando ? 'Guardando…' : 'Guardar selección'}</button>
                <Mensaje r={r} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function FormularioRecordatorio({ rec }: { rec?: Recordatorio }) {
  const [r, accion, guardando] = useActionState<Resultado, FormData>(guardarRecordatorio.bind(null, rec?.id ?? null), {})
  const [tipo, setTipo] = useState<'fecha' | 'inactividad'>(rec?.dias_sin_contacto ? 'inactividad' : 'fecha')
  return (
    <form action={accion} className="grid gap-3 md:grid-cols-2">
      <fieldset className="md:col-span-2">
        <legend className="text-sm text-slate-600">¿Cuándo se envía?</legend>
        <div className="mt-1 flex flex-wrap gap-2 text-sm">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 has-checked:border-marca-600 has-checked:bg-marca-50">
            <input type="radio" name="tipo" value="fecha" checked={tipo === 'fecha'} onChange={() => setTipo('fecha')} /> 📅 En una fecha
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 has-checked:border-marca-600 has-checked:bg-marca-50">
            <input type="radio" name="tipo" value="inactividad" checked={tipo === 'inactividad'} onChange={() => setTipo('inactividad')} /> 🔁 Automático: días sin contacto
          </label>
        </div>
      </fieldset>
      <label className="text-sm text-slate-600 md:col-span-2">Título (solo para el CRM) *
        <input name="titulo" required maxLength={120} defaultValue={rec?.titulo} placeholder="Cierre de inscripciones" className="campo mt-1" />
      </label>
      <label className="text-sm text-slate-600 md:col-span-2">Mensaje *
        <textarea name="mensaje" required rows={5} maxLength={1500} defaultValue={rec?.mensaje}
          placeholder={'¡Hola, {nombre}! 👋 Te recuerda Admisión de la Universidad Peruana Unión 🎓\n📝 Las inscripciones para *{carrera}* cierran el *13 de noviembre*'} className="campo mt-1 font-mono text-xs" />
        <span className="mt-1 block text-xs text-slate-500">
          Variables: <code>{'{nombre}'}</code> (primer nombre), <code>{'{carrera}'}</code>, <code>{'{asesor}'}</code>. Al final se agrega: &quot;Si no deseas recibir estos avisos, responde NO&quot;.
        </span>
      </label>
      {tipo === 'fecha' ? (
        <label className="text-sm text-slate-600">Día de envío *
          <input type="date" name="enviar_el" required defaultValue={rec?.enviar_el} className="campo mt-1" />
        </label>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm text-slate-600">Días sin contacto *
            <input type="number" name="dias_sin_contacto" min={2} max={90} required defaultValue={rec?.dias_sin_contacto ?? 7} className="campo mt-1" />
          </label>
          <label className="text-sm text-slate-600" title="No le escribe a quien lleva más días sin contacto (evita escribir a contactos muy antiguos)">Hasta (días)
            <input type="number" name="dias_maximo" min={3} max={365} defaultValue={rec?.dias_maximo ?? 30} className="campo mt-1" />
          </label>
          <p className="col-span-2 text-xs text-slate-500">
            Le escribe <b>una sola vez</b> a cada alumno que cumpla esos días sin contacto (aunque no responda), si tiene asesor, ya nos escribió, no está inscrito ni matriculado
            y su asesor no le agendó una tarea a futuro.
          </p>
        </div>
      )}
      <label className="text-sm text-slate-600">Desde la hora (solo en horario de atención)
        <input type="time" name="desde_hora" defaultValue={rec?.desde_hora?.slice(0, 5) ?? '09:00'} className="campo mt-1" />
      </label>
      <SelectorCarreras rec={rec} />
      <label className="flex items-center gap-2 text-sm text-slate-600 md:col-span-2">
        <input type="checkbox" name="solo_registrados" defaultChecked={rec?.solo_registrados ?? true} /> Solo alumnos registrados (que dieron su documento)
      </label>
      <div className="flex items-center gap-3 md:col-span-2">
        <button type="submit" disabled={guardando} className="boton">{guardando ? 'Guardando…' : 'Guardar'}</button>
        <Mensaje r={r} />
      </div>
    </form>
  )
}

export function TarjetaRecordatorio({ rec, resumen }: { rec: Recordatorio; resumen: { pendientes: number; enviados: number; errores: number } }) {
  const confirmar = useConfirmar()
  const [editando, setEditando] = useState(false)
  const [r, setR] = useState<Resultado>({})
  const [pendiente, iniciar] = useTransition()
  const fecha = new Intl.DateTimeFormat('es-PE', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${rec.enviar_el}T12:00:00Z`))
  const automatico = rec.dias_sin_contacto !== null

  async function alternar() {
    if (!rec.activo) {
      const ok = await confirmar({
        titulo: '¿Activar este recordatorio?',
        mensaje: automatico
          ? <>Desde hoy, cada alumno que cumpla <b>{rec.dias_sin_contacto} días sin contacto</b> recibirá este mensaje <b>una sola vez</b>. Ahora mismo cumplen la condición <b>{resumen.pendientes}</b> alumno(s): se les escribirá en horario de atención y de a pocos (4 cada 10 minutos). El número de Genesys está conectado por QR: envíos masivos pueden hacer que WhatsApp lo bloquee.</>
          : <>Se enviará por WhatsApp a <b>{resumen.pendientes}</b> alumno(s) marcados, el {fecha} desde las {rec.desde_hora.slice(0, 5)}, en horario de atención y de a pocos (4 cada 10 minutos). Se envía <b>una sola vez</b> y solo a ellos; al terminar se apaga solo. El número de Genesys está conectado por QR: envíos masivos pueden hacer que WhatsApp lo bloquee. Úsalo solo para avisos importantes.</>,
        confirmar: 'Activar',
      })
      if (!ok) return
    }
    iniciar(async () => setR(await cambiarActivo(rec.id, !rec.activo)))
  }

  return (
    <li className="tarjeta p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {rec.completado_at ? '✅' : rec.activo ? '🟢' : '⏸'} {rec.titulo}
          </p>
          <p className="text-xs text-slate-500">
            {automatico ? <>🔁 Automático: a los <b>{rec.dias_sin_contacto} días sin contacto</b> (hasta {rec.dias_maximo}) · una sola vez por alumno</> : <>{fecha} desde {rec.desde_hora.slice(0, 5)}</>} · {rec.carreras.length ? rec.carreras.join(', ') : 'todas las carreras'}
            {rec.excluir_carreras.length ? ` (excepto ${rec.excluir_carreras.join(', ')})` : ''} · {rec.solo_registrados ? 'solo registrados' : 'todos los que escribieron'}
          </p>
          <p className="mt-1 text-xs">
            <Link href={`/recordatorios/${rec.id}`} className="hover:underline"><b>{resumen.enviados}</b> enviados</Link> · <b>{resumen.pendientes}</b> {automatico ? 'cumplen la condición ahora' : 'por enviar'}{resumen.errores ? <> · <span className="text-rose-600">{resumen.errores} con error</span></> : null}
          </p>
          <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm whitespace-pre-wrap text-slate-700">{rec.mensaje}</p>
          {!rec.completado_at && <Destinatarios rec={rec} />}
        </div>
        <div className="flex flex-col items-end gap-2 text-xs">
          {rec.completado_at
            ? <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-700" title="Se envía una sola vez: crea uno nuevo si necesitas otro aviso">✅ Terminado · se apagó solo</span>
            : (
              <button type="button" onClick={alternar} disabled={pendiente} className={rec.activo ? 'boton-secundario' : 'boton'}>
                {pendiente ? 'Guardando…' : rec.activo ? 'Apagar' : 'Activar'}
              </button>
            )}
          {(resumen.enviados > 0 || resumen.errores > 0 || rec.activo) && (
            <Link href={`/recordatorios/${rec.id}`} className="font-medium text-marca-700 hover:underline">📊 Ver envíos</Link>
          )}
          <button type="button" className="text-slate-600 hover:underline" onClick={() => setEditando(!editando)}>{editando ? 'Cerrar' : 'Editar'}</button>
          <button type="button" className="text-rose-600 hover:underline" onClick={async () => {
            if (await confirmar({ titulo: '¿Eliminar este recordatorio?', mensaje: rec.titulo, peligro: true, confirmar: 'Eliminar' })) {
              iniciar(async () => setR(await eliminarRecordatorio(rec.id)))
            }
          }}>Eliminar</button>
        </div>
      </div>
      <Mensaje r={r} />
      {editando && <div className="mt-4 border-t border-slate-100 pt-4"><FormularioRecordatorio rec={rec} /></div>}
    </li>
  )
}
