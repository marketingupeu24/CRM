'use client'

// Proforma directa desde el chat: elegir carrera y beneficio y enviarla sin salir de la conversación.
// La hoja se dibuja fuera de pantalla solo para generar la imagen/PDF.
import Link from 'next/link'
import { useMemo, useRef, useState, useTransition } from 'react'
import {
  BENEFICIOS, calcularProforma, carreras, numeroProforma, soles2, type BeneficioId, type FormaPago, type Modalidad,
} from '@crm/db'
import { HojaProforma } from '@/components/proforma/HojaProforma'
import { enviarProformaPorChat, type TipoAdjunto } from '@/lib/proforma-cliente'

export interface DatosProformaRapida {
  leadId: string
  nombre: string | null
  dni: string | null
  asesor: string
  carreraSugerida: string | null
}

// En el chat solo los beneficios que no piden datos extra; el resto, en la página completa
const BENEFICIOS_RAPIDOS: BeneficioId[] = ['PROMO', 'NONE', 'B1CA', 'B2CA', 'B1IEA', 'B2IEA']

export function ProformaRapida({ datos, alEnviar }: { datos: DatosProformaRapida; alEnviar?: () => void }) {
  const [abierta, setAbierta] = useState(false)
  const [modalidad, setModalidad] = useState<Modalidad>('PRES')
  const [carrera, setCarrera] = useState(datos.carreraSugerida ?? 'Educación Inicial y Puericultura')
  const [beneficio, setBeneficio] = useState<BeneficioId>('PROMO')
  const [pago, setPago] = useState<FormaPago>('cuotas')
  const [adjunto, setAdjunto] = useState<TipoAdjunto>('imagen')
  const [estado, setEstado] = useState<{ texto: string; tipo?: 'ok' | 'error' } | null>(null)
  const [pendiente, iniciar] = useTransition()
  const hoja = useRef<HTMLElement>(null)
  const [emitida, setEmitida] = useState(() => new Date())

  const campus = modalidad === 'PRES' ? 'JUL' : 'LIM'
  const opciones = { modalidad, campus, carrera, beneficio, pago } as const
  const k = useMemo(() => calcularProforma(opciones), [modalidad, campus, carrera, beneficio, pago]) // eslint-disable-line react-hooks/exhaustive-deps
  const vence = useMemo(() => new Date(emitida.getTime() + 15 * 86_400_000), [emitida])
  const venceIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(vence)

  function enviar() {
    iniciar(async () => {
      const r = await enviarProformaPorChat({
        leadId: datos.leadId,
        datos: { opciones: k.opciones, nombre: datos.nombre ?? '', dni: datos.dni ?? '', leadId: datos.leadId, vence: venceIso },
        nodo: hoja.current, adjunto, alEstado: (texto) => setEstado({ texto }),
      })
      if (r.ok) {
        setEstado({ texto: `Proforma ${r.numero} enviada.`, tipo: 'ok' })
        alEnviar?.()
        setTimeout(() => { setAbierta(false); setEstado(null) }, 1500)
      } else setEstado({ texto: r.error, tipo: 'error' })
    })
  }

  const boton = (activo: boolean) => `rounded-md px-2 py-1 text-xs font-medium ${activo ? 'bg-marca-600 text-white' : 'text-slate-600 hover:bg-white'}`

  return (
    <>
      <button
        type="button" onClick={() => { setEmitida(new Date()); setAbierta(true) }}
        className="rounded-lg border border-slate-200 bg-superficie px-3 py-2 text-sm font-medium text-slate-700 hover:border-marca-600 hover:text-marca-700"
        title="Enviar la proforma de costos por este chat"
      >
        💰 Proforma
      </button>

      {abierta && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => !pendiente && setAbierta(false)}>
          <div role="dialog" aria-label="Enviar proforma" className="tarjeta w-full max-w-md space-y-3 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Enviar proforma{datos.nombre ? ` a ${datos.nombre.split(' ')[0]}` : ''}</h3>
              <button type="button" onClick={() => setAbierta(false)} aria-label="Cerrar" className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
              {([['PRES', 'Presencial · Juliaca'], ['EAD', 'A distancia'], ['SEMI', 'Semipresencial']] as [Modalidad, string][]).map(([v, t]) => (
                <button key={v} type="button" onClick={() => setModalidad(v)} className={`flex-1 ${boton(modalidad === v)}`}>{t}</button>
              ))}
            </div>
            <label className="block text-xs font-semibold tracking-wide text-slate-500 uppercase">Carrera
              <select value={k.opciones.carrera} onChange={(e) => setCarrera(e.target.value)} className="campo mt-1 normal-case">
                {carreras(modalidad, campus).map(([c, , , pct]) => <option key={c} value={c}>{c}{pct && modalidad === 'PRES' ? ` · ${pct} %` : ''}</option>)}
              </select>
            </label>
            <label className="block text-xs font-semibold tracking-wide text-slate-500 uppercase">Beneficio
              <select value={k.opciones.beneficio} disabled={modalidad !== 'PRES'} onChange={(e) => setBeneficio(e.target.value as BeneficioId)} className="campo mt-1 normal-case">
                {BENEFICIOS.filter((b) => BENEFICIOS_RAPIDOS.includes(b.id)).map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                {([['cuotas', 'En cuotas'], ['contado', 'Contado +5 %']] as [FormaPago, string][]).map(([v, t]) => (
                  <button key={v} type="button" disabled={v === 'contado' && k.cubre} onClick={() => setPago(v)} className={`flex-1 ${boton((k.contado ? 'contado' : 'cuotas') === v)}`}>{t}</button>
                ))}
              </div>
              <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                {([['imagen', 'Imagen'], ['pdf', 'PDF'], ['texto', 'Texto']] as [TipoAdjunto, string][]).map(([v, t]) => (
                  <button key={v} type="button" onClick={() => setAdjunto(v)} className={`flex-1 ${boton(adjunto === v)}`}>{t}</button>
                ))}
              </div>
            </div>
            <p className="rounded-lg bg-marca-50 px-3 py-2 text-sm tabular-nums">
              Al matricularse: <b>{soles2(k.inicial)}</b>
              {k.contado ? ' (pago único)' : k.cubre ? ' (la beca cubre la enseñanza)' : <> · luego {k.n - 1} cuotas de <b>{soles2(k.cuota)}</b></>}
              {k.ahorro > 0 && <span className="block text-xs text-emerald-700">Ahorro en el ciclo: {soles2(k.ahorro)}</span>}
            </p>
            <button type="button" onClick={enviar} disabled={pendiente} className="boton w-full bg-emerald-600">
              {pendiente ? 'Enviando…' : '📲 Enviar por WhatsApp'}
            </button>
            {estado && <p role="status" className={`text-sm ${estado.tipo === 'ok' ? 'text-emerald-700' : estado.tipo === 'error' ? 'text-rose-600' : 'text-slate-500'}`}>{estado.texto}</p>}
            <Link href={`/costos?lead=${datos.leadId}`} className="block text-center text-xs font-medium text-marca-700 hover:underline">
              Más opciones (descuentos institucionales, EXPLORE, otro campus) →
            </Link>
          </div>
          {/* Hoja fuera de pantalla: solo para generar la imagen o el PDF */}
          <div aria-hidden className="pointer-events-none fixed top-0 -left-[10000px]">
            <HojaProforma ref={hoja} k={k} numero={numeroProforma(k, emitida)} emitida={emitida} nombre={datos.nombre ?? ''} dni={datos.dni ?? ''} asesor={datos.asesor} vence={vence} />
          </div>
        </div>
      )}
    </>
  )
}
