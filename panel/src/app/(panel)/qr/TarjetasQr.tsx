'use client'

// Tarjetas con el QR personal de cada asesor (63 × 88 mm, tamaño naipe: 9 por hoja A4).
// Se descargan una por una (PNG), todas en una hoja (PDF A4) o se imprimen directo.
import { useRef, useState } from 'react'

export interface TarjetaQr {
  id: string
  nombre: string
  url: string
  svg: string
}

const ANCHO_MM = 63
const ALTO_MM = 88
const AZUL = '#003865'
const DORADO = '#f7a800'

function nombreArchivo(nombre: string) {
  return nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** Nombre y primer apellido: entra en la tarjeta sin achicar la letra. */
function nombreCorto(nombre: string) {
  return nombre.trim().split(/\s+/).slice(0, 2).join(' ')
}

async function capturar(nodo: HTMLElement) {
  const { toCanvas } = await import('html-to-image')
  await document.fonts?.ready
  return toCanvas(nodo, { pixelRatio: 4, backgroundColor: '#ffffff', cacheBust: true })
}

function Tarjeta({ t, refNodo }: { t: TarjetaQr; refNodo: (n: HTMLDivElement | null) => void }) {
  return (
    <div
      ref={refNodo}
      className="tarjeta-qr flex flex-col items-center overflow-hidden text-center"
      style={{ width: `${ANCHO_MM}mm`, height: `${ALTO_MM}mm`, background: '#ffffff', color: AZUL, border: '0.3mm solid #cbd5e1', borderRadius: '3mm' }}
    >
      <div className="w-full" style={{ background: AZUL, borderBottom: `1.2mm solid ${DORADO}`, padding: '2.6mm 3mm 2.2mm' }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- logo en SVG, nítido al imprimir */}
        <img src="/marca/logo-upeu-blanco.svg" alt="Universidad Peruana Unión" style={{ height: '7mm', margin: '0 auto' }} />
        <p style={{ color: '#ffffff', fontSize: '2.6mm', marginTop: '1mm', fontWeight: 600, letterSpacing: '0.2mm' }}>ADMISIÓN 2027 · CAMPUS JULIACA</p>
      </div>
      <p style={{ fontSize: '3.4mm', fontWeight: 700, marginTop: '2.6mm', lineHeight: 1.15 }}>Escanéame y déjanos<br />tus datos</p>
      <div className="[&_svg]:h-full [&_svg]:w-full" style={{ width: '36mm', height: '36mm', marginTop: '2mm' }} dangerouslySetInnerHTML={{ __html: t.svg }} />
      <p style={{ fontSize: '4mm', fontWeight: 800, marginTop: '2.4mm', lineHeight: 1.1, padding: '0 3mm' }}>{nombreCorto(t.nombre)}</p>
      <p style={{ fontSize: '2.7mm', color: '#475569', marginTop: '0.6mm' }}>Tu asesor(a) de Admisión</p>
      <div className="mt-auto w-full" style={{ height: '2mm', background: DORADO }} />
    </div>
  )
}

export function TarjetasQr({ tarjetas, variosAsesores }: { tarjetas: TarjetaQr[]; variosAsesores: boolean }) {
  const nodos = useRef(new Map<string, HTMLDivElement>())
  const [elegidas, setElegidas] = useState<Set<string>>(() => new Set(tarjetas.map((t) => t.id)))
  const [estado, setEstado] = useState<string | null>(null)
  const seleccion = tarjetas.filter((t) => elegidas.has(t.id))

  async function descargarPng(t: TarjetaQr) {
    const nodo = nodos.current.get(t.id)
    if (!nodo) return
    setEstado(`Preparando el QR de ${nombreCorto(t.nombre)}…`)
    try {
      const lienzo = await capturar(nodo)
      const a = document.createElement('a')
      a.href = lienzo.toDataURL('image/png')
      a.download = `QR-${nombreArchivo(t.nombre)}.png`
      a.click()
      setEstado(null)
    } catch {
      setEstado('No se pudo generar la imagen. Intenta de nuevo.')
    }
  }

  /** Hoja A4 con 9 tarjetas por página (3 × 3) y líneas de corte. */
  async function descargarHoja() {
    if (!seleccion.length) return
    setEstado('Preparando la hoja…')
    try {
      const { jsPDF } = await import('jspdf')
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
      const columnas = 3, filas = 3, espacio = 3
      const x0 = (210 - (columnas * ANCHO_MM + (columnas - 1) * espacio)) / 2
      const y0 = (297 - (filas * ALTO_MM + (filas - 1) * espacio)) / 2
      for (let i = 0; i < seleccion.length; i++) {
        const t = seleccion[i]!
        const nodo = nodos.current.get(t.id)
        if (!nodo) continue
        setEstado(`Preparando la hoja… (${i + 1} de ${seleccion.length})`)
        if (i > 0 && i % (columnas * filas) === 0) pdf.addPage()
        const pos = i % (columnas * filas)
        const x = x0 + (pos % columnas) * (ANCHO_MM + espacio)
        const y = y0 + Math.floor(pos / columnas) * (ALTO_MM + espacio)
        const lienzo = await capturar(nodo)
        pdf.addImage(lienzo.toDataURL('image/png'), 'PNG', x, y, ANCHO_MM, ALTO_MM)
      }
      pdf.save(seleccion.length === 1 ? `QR-${nombreArchivo(seleccion[0]!.nombre)}.pdf` : 'QR-asesores.pdf')
      setEstado(null)
    } catch {
      setEstado('No se pudo generar la hoja. Intenta de nuevo.')
    }
  }

  function alternar(id: string) {
    setElegidas((previas) => {
      const nuevas = new Set(previas)
      if (nuevas.has(id)) nuevas.delete(id)
      else nuevas.add(id)
      return nuevas
    })
  }

  if (!tarjetas.length) return <p className="text-sm text-slate-500">No hay asesores con QR.</p>

  return (
    <div className="space-y-4">
      <style>{`@media print {
        aside, header, .no-imprimir { display: none !important }
        main { padding: 0 !important }
        .md\\:ml-\\[270px\\] { margin: 0 !important }
        @page { size: A4; margin: 8mm }
        .hoja-qr { display: grid !important; grid-template-columns: repeat(3, ${ANCHO_MM}mm); gap: 3mm; justify-content: center }
        .hoja-qr > .fuera { display: none !important }
        .hoja-qr .tarjeta-qr { break-inside: avoid; -webkit-print-color-adjust: exact; print-color-adjust: exact }
      }`}</style>

      <div className="no-imprimir flex flex-wrap items-center gap-2">
        <button onClick={descargarHoja} disabled={!seleccion.length || !!estado} className="boton">
          ⬇ Descargar {seleccion.length > 1 ? `hoja con ${seleccion.length} QR` : 'hoja'} (PDF)
        </button>
        <button onClick={() => window.print()} disabled={!seleccion.length} className="boton-secundario">🖨 Imprimir</button>
        {variosAsesores && (
          <>
            <button onClick={() => setElegidas(new Set(tarjetas.map((t) => t.id)))} className="text-sm font-medium text-marca-700 hover:underline">Elegir todos</button>
            <button onClick={() => setElegidas(new Set())} className="text-sm font-medium text-slate-500 hover:underline">Ninguno</button>
          </>
        )}
        <span className="text-sm text-slate-500">Tamaño tarjeta: {ANCHO_MM / 10} × {ALTO_MM / 10} cm (9 por hoja A4)</span>
        {estado && <span role="status" className="text-sm text-marca-700">{estado}</span>}
      </div>

      <div className="hoja-qr flex flex-wrap gap-5">
        {tarjetas.map((t) => (
          <div key={t.id} className={`space-y-2 ${elegidas.has(t.id) ? '' : 'fuera'}`}>
            <Tarjeta t={t} refNodo={(n) => { if (n) nodos.current.set(t.id, n); else nodos.current.delete(t.id) }} />
            <div className="no-imprimir flex items-center justify-between gap-2 text-xs" style={{ width: `${ANCHO_MM}mm` }}>
              {variosAsesores
                ? (
                  <label className="flex items-center gap-1.5 text-slate-600">
                    <input type="checkbox" checked={elegidas.has(t.id)} onChange={() => alternar(t.id)} aria-label={`Incluir a ${t.nombre} en la hoja`} />
                    En la hoja
                  </label>
                )
                : <span />}
              <button onClick={() => descargarPng(t)} disabled={!!estado} className="font-medium text-marca-700 hover:underline">⬇ PNG</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
