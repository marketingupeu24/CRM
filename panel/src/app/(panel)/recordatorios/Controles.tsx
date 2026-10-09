'use client'

import { useActionState, useState, useTransition } from 'react'
import { useConfirmar } from '@/components/Confirmacion'
import { cambiarActivo, eliminarRecordatorio, guardarRecordatorio, type Resultado } from './acciones'

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
}

function Mensaje({ r }: { r: Resultado }) {
  if (r.error) return <p role="alert" className="text-sm text-rose-600">{r.error}</p>
  if (r.ok) return <p className="text-sm text-emerald-600">{r.ok}</p>
  return null
}

export function FormularioRecordatorio({ rec }: { rec?: Recordatorio }) {
  const [r, accion, guardando] = useActionState<Resultado, FormData>(guardarRecordatorio.bind(null, rec?.id ?? null), {})
  return (
    <form action={accion} className="grid gap-3 md:grid-cols-2">
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
      <label className="text-sm text-slate-600">Día de envío *
        <input type="date" name="enviar_el" required defaultValue={rec?.enviar_el} className="campo mt-1" />
      </label>
      <label className="text-sm text-slate-600">Desde la hora (solo en horario de atención)
        <input type="time" name="desde_hora" defaultValue={rec?.desde_hora?.slice(0, 5) ?? '09:00'} className="campo mt-1" />
      </label>
      <label className="text-sm text-slate-600">Solo estas carreras <span className="text-xs text-slate-400">(separadas por comas; vacío = todas)</span>
        <input name="carreras" defaultValue={rec?.carreras.join(', ')} placeholder="Enfermería, Psicología, Civil" className="campo mt-1" />
      </label>
      <label className="text-sm text-slate-600">Excepto estas carreras
        <input name="excluir_carreras" defaultValue={rec ? rec.excluir_carreras.join(', ') : 'Medicina'} placeholder="Medicina" className="campo mt-1" />
      </label>
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

  async function alternar() {
    if (!rec.activo) {
      const ok = await confirmar({
        titulo: '¿Activar este recordatorio?',
        mensaje: <>Se enviará por WhatsApp a <b>{resumen.pendientes}</b> alumno(s) el {fecha}, desde las {rec.desde_hora.slice(0, 5)}, en horario de atención y de a pocos. El número de Genesys está conectado por QR: envíos masivos pueden hacer que WhatsApp lo bloquee. Úsalo solo para avisos importantes.</>,
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
            {fecha} desde {rec.desde_hora.slice(0, 5)} · {rec.carreras.length ? rec.carreras.join(', ') : 'todas las carreras'}
            {rec.excluir_carreras.length ? ` (excepto ${rec.excluir_carreras.join(', ')})` : ''} · {rec.solo_registrados ? 'solo registrados' : 'todos los que escribieron'}
          </p>
          <p className="mt-1 text-xs">
            <b>{resumen.enviados}</b> enviados · <b>{resumen.pendientes}</b> por enviar{resumen.errores ? <> · <span className="text-rose-600">{resumen.errores} con error</span></> : null}
          </p>
          <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm whitespace-pre-wrap text-slate-700">{rec.mensaje}</p>
        </div>
        <div className="flex flex-col items-end gap-2 text-xs">
          <button type="button" onClick={alternar} disabled={pendiente} className={rec.activo ? 'boton-secundario' : 'boton'}>
            {pendiente ? 'Guardando…' : rec.activo ? 'Apagar' : 'Activar'}
          </button>
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
