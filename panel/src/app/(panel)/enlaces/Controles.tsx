'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import QRCode from 'qrcode'
import { ORIGENES } from '@crm/db'
import { useConfirmar } from '@/components/Confirmacion'
import { cambiarActivoEnlace, crearEnlace, eliminarEnlace, type Resultado } from './acciones'

export interface Enlace {
  id: number
  nombre: string
  origen: string
  codigo: string
  mensaje: string
  visitas: number
  activo: boolean
}

export interface ResultadoEnlace {
  leads: number
  registrados: number
  contactados: number
  inscritos: number
  matriculados: number
}

function Mensaje({ r }: { r: Resultado }) {
  if (r.error) return <p role="alert" className="text-sm text-rose-600">{r.error}</p>
  if (r.ok) return <p className="text-sm text-emerald-600">{r.ok}</p>
  return null
}

export function FormularioEnlace() {
  const [r, accion, guardando] = useActionState<Resultado, FormData>(crearEnlace, {})
  const [origen, setOrigen] = useState<string>(ORIGENES[0])
  return (
    <form action={accion} className="grid gap-3 md:grid-cols-2">
      <label className="text-sm text-slate-600">Nombre *
        <input name="nombre" required maxLength={80} placeholder="TikTok perfil, Flyer feria Juliaca…" className="campo mt-1" />
      </label>
      <label className="text-sm text-slate-600">Medio (&quot;Nos conoció por&quot;) *
        <select name="origen" value={origen} onChange={(e) => setOrigen(e.target.value)} className="campo mt-1">
          {ORIGENES.map((o) => <option key={o} value={o}>{o}</option>)}
          <option value="otro">Otro…</option>
        </select>
      </label>
      {origen === 'otro' && (
        <label className="text-sm text-slate-600">¿Cuál?
          <input name="origen_otro" required maxLength={60} placeholder="Flyers, Radio, Afiche…" className="campo mt-1" />
        </label>
      )}
      <label className="text-sm text-slate-600">Código <span className="text-xs text-slate-400">(opcional; letras y números)</span>
        <input name="codigo" maxLength={10} placeholder="Se arma solo con el nombre" className="campo mt-1 uppercase" />
      </label>
      <label className="text-sm text-slate-600 md:col-span-2">Mensaje con el que abre WhatsApp *
        <input name="mensaje" required maxLength={300} defaultValue="Hola, quiero información de Admisión de la Universidad Peruana Unión" className="campo mt-1" />
      </label>
      <div className="flex items-center gap-3 md:col-span-2">
        <button type="submit" disabled={guardando} className="boton">{guardando ? 'Creando…' : 'Crear enlace y QR'}</button>
        <Mensaje r={r} />
      </div>
    </form>
  )
}

/** Imagen del QR para imprimir o publicar: logo, nombre, QR y enlace. */
async function imagenQr(url: string, titulo: string): Promise<Blob> {
  const W = 1200, H = 1500
  const lienzo = document.createElement('canvas')
  lienzo.width = W; lienzo.height = H
  const c = lienzo.getContext('2d')!
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H)
  c.fillStyle = '#003865'; c.fillRect(0, 0, W, 280)
  c.fillStyle = '#f7a800'; c.fillRect(0, 280, W, 14)
  const logo = new Image()
  logo.src = '/marca/logo-upeu-blanco.svg'
  await logo.decode().catch(() => undefined)
  if (logo.naturalWidth) { const h = 120; c.drawImage(logo, (W - h * 4.15) / 2, 45, h * 4.15, h) }
  c.fillStyle = '#ffffff'; c.font = '600 40px system-ui, sans-serif'; c.textAlign = 'center'
  c.fillText('Admisión 2027 · Escríbenos por WhatsApp', W / 2, 235)
  const qr = document.createElement('canvas')
  await QRCode.toCanvas(qr, url, { width: 820, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#003865', light: '#ffffff' } })
  c.drawImage(qr, (W - 820) / 2, 340)
  c.fillStyle = '#003865'; c.font = '700 50px Georgia, serif'
  c.fillText(titulo.slice(0, 40), W / 2, 1260)
  c.fillStyle = '#5b6b7b'; c.font = '400 30px system-ui, sans-serif'
  c.fillText('Escanea con la cámara de tu celular', W / 2, 1360)
  c.fillText(url.replace(/^https?:\/\//, ''), W / 2, 1410)
  return await new Promise<Blob>((r) => lienzo.toBlob((b) => r(b!), 'image/png'))
}

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : '—')

export function TarjetaEnlace({ enlace, base, resultado, editable }: { enlace: Enlace; base: string; resultado: ResultadoEnlace; editable: boolean }) {
  const url = `${base}/e/${enlace.codigo}`
  const [qr, setQr] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [r, setR] = useState<Resultado>({})
  const [pendiente, iniciar] = useTransition()
  const confirmar = useConfirmar()
  useEffect(() => { QRCode.toDataURL(url, { width: 320, margin: 1, color: { dark: '#003865', light: '#ffffff' } }).then(setQr) }, [url])

  const descargar = async () => {
    const blob = await imagenQr(url, enlace.nombre)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = `qr-${enlace.codigo.toLowerCase()}.png`; a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  }

  return (
    <li className={`tarjeta flex flex-wrap gap-4 p-4 ${enlace.activo ? '' : 'opacity-60'}`}>
      {qr && <img src={qr} alt={`QR de ${enlace.nombre}`} className="h-32 w-32 rounded-lg border border-slate-200" />}
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-semibold">{enlace.nombre} <span className="ml-1 rounded-full bg-marca-50 px-2 py-0.5 text-xs font-medium text-marca-700">{enlace.origen}</span>{!enlace.activo && <span className="ml-1 text-xs text-slate-500">(desactivado)</span>}</p>
        <p className="font-mono text-xs break-all text-slate-600">{url}</p>
        <p className="text-xs text-slate-500">Abre WhatsApp con: &quot;{enlace.mensaje} (Cód. O-{enlace.codigo})&quot;</p>
        <p className="pt-1 text-sm">
          <b>{enlace.visitas}</b> visitas · <b>{resultado.leads}</b> leads · {resultado.registrados} registrados · {resultado.contactados} contactados · {resultado.inscritos} inscritos · <b>{resultado.matriculados}</b> matriculados
          <span className="ml-1 text-xs text-slate-500">({pct(resultado.leads, enlace.visitas)} de las visitas escribió)</span>
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <button type="button" className="boton-secundario" onClick={async () => { await navigator.clipboard.writeText(url); setCopiado(true); setTimeout(() => setCopiado(false), 2000) }}>
            {copiado ? '✓ Copiado' : '📋 Copiar enlace'}
          </button>
          <button type="button" className="boton-secundario" onClick={descargar}>⬇ Descargar QR</button>
          {editable && (
            <button type="button" disabled={pendiente} className="boton-secundario" onClick={async () => {
              if (enlace.activo && !(await confirmar({ titulo: '¿Desactivar este enlace?', mensaje: 'El enlace y el QR dejarán de abrir WhatsApp. Los leads que ya llegaron se mantienen.', confirmar: 'Desactivar' }))) return
              iniciar(async () => setR(await cambiarActivoEnlace(enlace.id, !enlace.activo)))
            }}>{enlace.activo ? 'Desactivar' : 'Activar'}</button>
          )}
          {editable && (resultado.leads === 0 ? (
            <button type="button" disabled={pendiente} className="boton-secundario text-rose-600" onClick={async () => {
              if (!(await confirmar({
                titulo: '¿Borrar este enlace y su QR?',
                mensaje: <>Se borra <b>{enlace.nombre}</b>. Si ya imprimiste o publicaste el QR, dejará de funcionar.</>,
                confirmar: 'Borrar', peligro: true,
              }))) return
              iniciar(async () => setR(await eliminarEnlace(enlace.id)))
            }}>🗑 Borrar</button>
          ) : (
            <span className="self-center text-xs text-slate-500" title="Se perdería de dónde vinieron esos leads">
              Ya trajo {resultado.leads} lead(s): no se puede borrar, solo desactivar.
            </span>
          ))}
        </div>
        <Mensaje r={r} />
      </div>
    </li>
  )
}
