'use client'

import Link from 'next/link'
import { useActionState, useEffect, useState, useTransition } from 'react'
import QRCode from 'qrcode'
import { cambiarActiva, guardarActividad, type Resultado } from './acciones'

export interface Actividad {
  id: number
  codigo: string
  nombre: string
  tipo: string
  lugar: string | null
  fecha: string | null
  activa: boolean
  asignacion: string
  bienvenida: boolean
  responsable_id: string | null
  responsable: string | null
  responsableRecibe: boolean
  registrados: number
  contactados: number
  matriculados: number
  editable: boolean
}

export const TIPOS: Record<string, string> = { feria: 'Feria', colegio: 'Visita a colegio', charla: 'Charla', otro: 'Otro' }

function Mensaje({ r }: { r: Resultado }) {
  if (r.error) return <p role="alert" className="text-sm text-rose-600">{r.error}</p>
  if (r.ok) return <p role="status" className="text-sm text-emerald-600">{r.ok}</p>
  return null
}

export function FormularioActividad({ actividad, asesores, alGuardar }: {
  actividad?: Actividad; asesores: { id: string; nombre: string }[]; alGuardar?: () => void
}) {
  const [r, accion, guardando] = useActionState<Resultado, FormData>(async (previo, formData) => {
    const res = await guardarActividad(actividad?.id ?? null, previo, formData)
    if (res.ok) alGuardar?.()
    return res
  }, {})
  return (
    <form action={accion} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm text-slate-600 sm:col-span-2">Nombre de la actividad *
        <input name="nombre" required maxLength={120} defaultValue={actividad?.nombre} placeholder="Ej.: Feria vocacional – Colegio Las Mercedes" className="campo mt-1" />
      </label>
      <label className="text-sm text-slate-600">Tipo
        <select name="tipo" defaultValue={actividad?.tipo ?? 'feria'} className="campo mt-1">
          {Object.entries(TIPOS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
      </label>
      <label className="text-sm text-slate-600">Fecha
        <input type="date" name="fecha" defaultValue={actividad?.fecha ?? ''} className="campo mt-1" />
      </label>
      <label className="text-sm text-slate-600 sm:col-span-2">Lugar o colegio
        <input name="lugar" maxLength={120} defaultValue={actividad?.lugar ?? ''} placeholder="Ej.: I.E. San Martín – Juliaca" className="campo mt-1" />
      </label>
      <label className="text-sm text-slate-600">Los registros se asignan a
        <select name="asignacion" defaultValue={actividad?.asignacion ?? 'responsable'} className="campo mt-1">
          <option value="responsable">El responsable</option>
          <option value="rotacion">Rotación de asesores</option>
        </select>
      </label>
      {asesores.length > 0 ? (
        <label className="text-sm text-slate-600">Responsable
          <select name="responsable_id" defaultValue={actividad?.responsable_id ?? ''} className="campo mt-1">
            <option value="">Yo (si no recibo leads, va por rotación)</option>
            {asesores.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </label>
      ) : <span />}
      <label className="flex items-center gap-2 text-sm text-slate-600 sm:col-span-2 lg:col-span-4">
        <input type="checkbox" name="bienvenida" defaultChecked={actividad?.bienvenida ?? true} className="h-4 w-4 accent-marca-600" />
        Genesys envía un saludo por WhatsApp a cada alumno que se registra (deja abierta la conversación)
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
        <button className="boton" disabled={guardando}>{guardando ? 'Guardando…' : actividad ? 'Guardar cambios' : 'Crear actividad y QR'}</button>
        <Mensaje r={r} />
      </div>
    </form>
  )
}

/** Imagen del QR lista para compartir o imprimir: logo, nombre de la actividad, QR y enlace. */
async function imagenQr(url: string, actividad: Actividad): Promise<Blob> {
  const W = 1200, H = 1560
  const lienzo = document.createElement('canvas')
  lienzo.width = W; lienzo.height = H
  const c = lienzo.getContext('2d')!
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H)
  c.fillStyle = '#003865'; c.fillRect(0, 0, W, 300)
  c.fillStyle = '#f7a800'; c.fillRect(0, 300, W, 14)
  const logo = new Image()
  logo.src = '/marca/logo-upeu-blanco.svg'
  await logo.decode().catch(() => undefined)
  if (logo.naturalWidth) { const h = 120; c.drawImage(logo, (W - h * 4.15) / 2, 50, h * 4.15, h) }
  c.fillStyle = '#ffffff'; c.font = '600 40px system-ui, sans-serif'; c.textAlign = 'center'
  c.fillText('Admisión 2027 · Regístrate aquí', W / 2, 250)
  const qr = document.createElement('canvas')
  await QRCode.toCanvas(qr, url, { width: 820, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#003865', light: '#ffffff' } })
  c.drawImage(qr, (W - 820) / 2, 370)
  c.fillStyle = '#003865'; c.font = '700 54px Georgia, serif'
  const palabras = actividad.nombre.split(' ')
  const lineas: string[] = []; let linea = ''
  for (const p of palabras) { const t = linea ? `${linea} ${p}` : p; if (c.measureText(t).width > W - 140) { lineas.push(linea); linea = p } else linea = t }
  lineas.push(linea)
  lineas.slice(0, 2).forEach((l, i) => c.fillText(l, W / 2, 1290 + i * 66))
  c.fillStyle = '#5b6b7b'; c.font = '400 30px system-ui, sans-serif'
  c.fillText('Escanea con la cámara de tu celular y deja tus datos', W / 2, 1450)
  c.fillText(url.replace(/^https?:\/\//, ''), W / 2, 1500)
  return await new Promise<Blob>((r) => lienzo.toBlob((b) => r(b!), 'image/png'))
}

export function TarjetaActividad({ actividad, base, asesores }: { actividad: Actividad; base: string; asesores: { id: string; nombre: string }[] }) {
  const url = `${base}/r/${actividad.codigo}`
  const [qr, setQr] = useState('')
  const [editando, setEditando] = useState(false)
  const [r, setR] = useState<Resultado>({})
  const [pendiente, iniciar] = useTransition()
  useEffect(() => {
    QRCode.toDataURL(url, { width: 360, margin: 1, color: { dark: '#003865', light: '#ffffff' } }).then(setQr)
  }, [url])

  const descargar = async () => {
    const blob = await imagenQr(url, actividad)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `QR_${actividad.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').slice(0, 60)}.png`
    document.body.appendChild(a); a.click(); a.remove()
  }

  return (
    <li className={`tarjeta p-5 ${actividad.activa ? '' : 'opacity-70'}`}>
      <div className="flex flex-wrap gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element -- QR generado en el navegador */}
        {qr ? <img src={qr} alt={`QR de ${actividad.nombre}`} className="h-36 w-36 rounded-lg border border-slate-200" /> : <div className="h-36 w-36 animate-pulse rounded-lg bg-slate-100" />}
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-lg font-semibold">
              {actividad.nombre}
              {!actividad.activa && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Cerrada</span>}
            </p>
            <p className="text-sm text-slate-500">
              {TIPOS[actividad.tipo] ?? actividad.tipo}{actividad.lugar ? ` · ${actividad.lugar}` : ''}{actividad.fecha ? ` · ${actividad.fecha.split('-').reverse().join('/')}` : ''}
              {' · '}{actividad.asignacion === 'rotacion' ? 'asignación por rotación' : `responsable: ${actividad.responsable ?? '—'}`}
            </p>
            {actividad.asignacion === 'responsable' && !actividad.responsableRecibe && (
              <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800">
                {actividad.responsable ?? 'El responsable'} no recibe leads (es administrador o está inactivo): los registros se reparten por rotación entre los asesores. Edítala y elige a un asesor si quieres que vayan a una persona.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-marca-50 px-3 py-1 font-semibold text-marca-700">{actividad.registrados} registrados</span>
            <span className="rounded-full bg-slate-100 px-3 py-1">{actividad.contactados} contactados o más</span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">{actividad.matriculados} matriculados</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={descargar} className="boton">⬇ Descargar QR</button>
            <Link href={`/actividades/${actividad.id}/cartel`} target="_blank" className="boton-secundario">🖨 Cartel para imprimir</Link>
            <button
              className="boton-secundario"
              onClick={async () => { try { await navigator.clipboard.writeText(url); setR({ ok: 'Enlace copiado.' }) } catch { setR({ error: url }) } }}
            >
              🔗 Copiar enlace
            </button>
            <a href={url} target="_blank" rel="noreferrer" className="text-sm font-medium text-marca-700 hover:underline">Ver formulario ↗</a>
            <Link href={`/leads?actividad=${actividad.id}`} className="text-sm font-medium text-marca-700 hover:underline">Ver leads →</Link>
          </div>
          {actividad.editable && (
            <div className="flex flex-wrap gap-3 text-xs font-medium">
              <button onClick={() => setEditando(!editando)} className="text-marca-700 hover:underline">{editando ? 'Cerrar' : 'Editar'}</button>
              <button disabled={pendiente} onClick={() => iniciar(async () => setR(await cambiarActiva(actividad.id, !actividad.activa)))} className="text-slate-500 hover:underline">
                {actividad.activa ? 'Cerrar formulario' : 'Volver a abrir'}
              </button>
            </div>
          )}
          <Mensaje r={r} />
        </div>
      </div>
      {editando && <div className="mt-4 border-t border-slate-100 pt-4"><FormularioActividad actividad={actividad} asesores={asesores} alGuardar={() => setEditando(false)} /></div>}
    </li>
  )
}
