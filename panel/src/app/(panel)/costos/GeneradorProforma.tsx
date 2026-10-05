'use client'

import Link from 'next/link'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
  ADICIONALES_EXPLORE, BENEFICIOS, calcularProforma, CAMPUS, carreras, INSTITUCIONALES, MODALIDADES, numeroProforma, soles0, soles2,
  textoWhatsApp, type BeneficioId, type CampusId, type ExtraId, type FormaPago, type InstId, type Modalidad,
} from '@crm/db'
import { HojaProforma } from '@/components/proforma/HojaProforma'
import { crearClienteNavegador } from '@/lib/supabase/client'
import { marcarEnviada, registrarProforma, verificarExplore } from './acciones'

export interface LeadProforma {
  id: string
  nombre: string | null
  dni: string | null
  telefono: string
  carrera: string | null
  esCepre: boolean
}

interface Props {
  lead: LeadProforma | null
  asesor: string
  carreraSugerida: string | null
  /** Fecha de emisión y vencimiento por defecto, calculadas en el servidor (evita diferencias al hidratar). */
  emitidaIso: string
  venceInicial: string
}

function Segmentos<T extends string>({ valor, opciones, alCambiar, deshabilitadas = [] }: {
  valor: T; opciones: [T, string][]; alCambiar: (v: T) => void; deshabilitadas?: T[]
}) {
  return (
    <div className="grid gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1" style={{ gridTemplateColumns: `repeat(${opciones.length}, 1fr)` }}>
      {opciones.map(([v, t]) => (
        <button
          key={v} type="button" aria-pressed={valor === v} disabled={deshabilitadas.includes(v)} onClick={() => alCambiar(v)}
          className={`rounded-md px-2 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${valor === v ? 'bg-marca-600 text-white shadow-theme-xs' : 'text-slate-700 hover:bg-white'}`}
        >
          {t}
        </button>
      ))}
    </div>
  )
}

type Adjunto = 'imagen' | 'pdf' | 'texto'

export function GeneradorProforma({ lead, asesor, carreraSugerida, emitidaIso, venceInicial }: Props) {
  const [modalidad, setModalidad] = useState<Modalidad>('PRES')
  const [campus, setCampus] = useState<CampusId>('JUL')
  const [carrera, setCarrera] = useState(carreraSugerida ?? 'Educación Inicial y Puericultura')
  const [soloPromo, setSoloPromo] = useState(false)
  const [beneficio, setBeneficio] = useState<BeneficioId>('PROMO')
  const [inst, setInst] = useState<InstId[]>([])
  const [adic, setAdic] = useState<ExtraId[]>([])
  const [pago, setPago] = useState<FormaPago>('cuotas')
  const [nombre, setNombre] = useState(lead?.nombre ?? '')
  const [dni, setDni] = useState(lead?.dni ?? '')
  const [vence, setVence] = useState(venceInicial)
  const [celular, setCelular] = useState(lead?.telefono ?? '')
  const [explore, setExplore] = useState<'' | 'si' | 'no'>('')
  const [adjunto, setAdjunto] = useState<Adjunto>('imagen')
  const [estado, setEstado] = useState<{ texto: string; tipo?: 'ok' | 'error' } | null>(null)
  const [pendiente, iniciar] = useTransition()
  const hoja = useRef<HTMLElement>(null)
  const caja = useRef<HTMLDivElement>(null)
  const [escala, setEscala] = useState(1)
  const [alto, setAlto] = useState(1123)
  const [emitida] = useState(() => new Date(emitidaIso))

  // EXPLORE: el DNI se verifica en el servidor (la lista no viaja al navegador)
  useEffect(() => {
    const d = dni.replace(/\D/g, '')
    if (d.length < 8) { setExplore(''); return }
    let vigente = true
    const t = setTimeout(async () => {
      const ok = await verificarExplore(d)
      if (vigente) setExplore(ok ? 'si' : 'no')
    }, 400)
    return () => { vigente = false; clearTimeout(t) }
  }, [dni])
  useEffect(() => { if (beneficio === 'EXPLORE' && explore !== 'si') setBeneficio('PROMO') }, [explore, beneficio])

  const opciones = { modalidad, campus, carrera, beneficio, institucionales: inst, adicionales: adic, exploreVerificado: explore === 'si', pago }
  const k = useMemo(() => calcularProforma(opciones), [JSON.stringify(opciones)]) // eslint-disable-line react-hooks/exhaustive-deps
  const numero = numeroProforma(k, emitida)
  const venceFecha = vence ? new Date(`${vence}T12:00:00-05:00`) : null
  const lista = carreras(modalidad, campus).filter((c) => !(soloPromo && modalidad === 'PRES' && beneficio === 'PROMO') || c[3] > 0)
  const texto = textoWhatsApp(k, { nombre, asesor, vence: venceFecha })
  const conBeneficios = modalidad === 'PRES'

  // Si la carrera no existe en la nueva modalidad/campus, se ajusta (como el original)
  useEffect(() => { if (k.opciones.carrera !== carrera) setCarrera(k.opciones.carrera) }, [k.opciones.carrera, carrera])

  // Vista previa escalada al ancho disponible
  useLayoutEffect(() => {
    const ajustar = () => setEscala(Math.min(1, (caja.current?.clientWidth ?? 794) / 794))
    ajustar()
    window.addEventListener('resize', ajustar)
    const obs = new ResizeObserver(() => setAlto(hoja.current?.offsetHeight ?? 1123))
    if (hoja.current) obs.observe(hoja.current)
    return () => { window.removeEventListener('resize', ajustar); obs.disconnect() }
  }, [])

  const alternar = <T,>(lista: T[], v: T, max = 99) => (lista.includes(v) ? lista.filter((x) => x !== v) : lista.length < max ? [...lista, v] : lista)

  const nombreArchivo = () => `Proforma_2027-1_${k.cp.corto}_${k.name}${k.contado ? '_contado' : ''}_${nombre || 'postulante'}`
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 _.-]+/g, '').replace(/\s+/g, '_').slice(0, 150)

  async function generar(tipo: 'png' | 'pdf'): Promise<Blob> {
    const { toCanvas } = await import('html-to-image')
    const nodo = hoja.current!
    await document.fonts?.ready
    const lienzo = await toCanvas(nodo, { pixelRatio: 2.5, backgroundColor: '#ffffff', style: { transform: 'none', boxShadow: 'none' }, cacheBust: true })
    if (tipo === 'png') return await new Promise<Blob>((r) => lienzo.toBlob((b) => r(b!), 'image/png'))
    const { jsPDF } = await import('jspdf')
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
    const W = 210, H = 297
    let w = W, h = lienzo.height * W / lienzo.width
    if (h > H) { w = W * H / h; h = H }
    pdf.addImage(lienzo.toDataURL('image/jpeg', 0.93), 'JPEG', (W - w) / 2, 0, w, h)
    return pdf.output('blob')
  }

  const datos = () => ({ opciones, nombre, dni, leadId: lead?.id ?? null, vence })

  function descargar(tipo: 'png' | 'pdf') {
    setEstado({ texto: `Generando ${tipo === 'pdf' ? 'PDF' : 'imagen'}…` })
    iniciar(async () => {
      try {
        const [blob] = await Promise.all([generar(tipo), registrarProforma(datos())])
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `${nombreArchivo()}.${tipo}`; document.body.appendChild(a); a.click(); a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 4000)
        setEstado({ texto: 'Proforma descargada.', tipo: 'ok' })
      } catch {
        setEstado({ texto: 'No se pudo generar el archivo. Intenta de nuevo.', tipo: 'error' })
      }
    })
  }

  async function copiar() {
    try { await navigator.clipboard.writeText(texto); setEstado({ texto: 'Mensaje copiado.', tipo: 'ok' }) }
    catch { setEstado({ texto: 'Tu navegador no permitió copiar: usa la vista previa del mensaje.', tipo: 'error' }) }
  }

  /** Envía la proforma por el chat del CRM (WhatsApp de Genesys) con la imagen o el PDF adjunto. */
  function enviarPorChat() {
    if (!lead) return
    setEstado({ texto: 'Preparando la proforma…' })
    iniciar(async () => {
      const registro = await registrarProforma(datos())
      if (registro.error || !registro.id) { setEstado({ texto: registro.error ?? 'No se pudo guardar la proforma.', tipo: 'error' }); return }
      const supabase = crearClienteNavegador()
      let url: string | null = null
      if (adjunto !== 'texto') {
        try {
          setEstado({ texto: 'Subiendo el archivo…' })
          const tipo = adjunto === 'pdf' ? 'pdf' : 'png'
          const blob = await generar(tipo)
          const ruta = `${lead.id}/${crypto.randomUUID()}.${tipo}`
          const { error } = await supabase.storage.from('proformas').upload(ruta, blob, { contentType: tipo === 'pdf' ? 'application/pdf' : 'image/png' })
          if (error) throw error
          url = supabase.storage.from('proformas').getPublicUrl(ruta).data.publicUrl
        } catch {
          setEstado({ texto: 'No se pudo subir el archivo. Puedes enviar solo el texto.', tipo: 'error' }); return
        }
      }
      setEstado({ texto: 'Enviando por WhatsApp…' })
      const { data, error } = await supabase.functions.invoke('chat', { body: { lead_id: lead.id, texto: registro.texto, adjunto_url: url } })
      if (error || !data?.ok) {
        let detalle = data?.error as string | undefined
        if (!detalle && error && 'context' in error) {
          try { detalle = (await (error.context as Response).json()).error } catch { /* sin detalle */ }
        }
        setEstado({ texto: detalle ?? 'No se pudo enviar. Intenta de nuevo.', tipo: 'error' }); return
      }
      await marcarEnviada(registro.id, url, lead.id)
      setEstado({ texto: `Proforma ${registro.numero} enviada por el chat.`, tipo: 'ok' })
    })
  }

  const celularWa = (() => { let d = celular.replace(/\D/g, ''); if (d.length === 9 && d[0] === '9') d = '51' + d; return d.length >= 10 ? d : '' })()

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className="tarjeta space-y-4 p-5 xl:sticky xl:top-20">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Modalidad</p>
          <Segmentos valor={modalidad} alCambiar={(v) => { setModalidad(v); if (v !== 'PRES') setCampus('LIM') }}
            opciones={[['PRES', 'Presencial'], ['EAD', 'A distancia'], ['SEMI', 'Semipresencial']]} />
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Campus</p>
          <Segmentos valor={campus} alCambiar={setCampus} deshabilitadas={modalidad === 'PRES' ? [] : ['JUL', 'TAR']}
            opciones={(Object.keys(CAMPUS) as CampusId[]).map((c) => [c, CAMPUS[c].corto])} />
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Carrera · {MODALIDADES[modalidad].label.toLowerCase()}</span>
          <select value={k.opciones.carrera} onChange={(e) => setCarrera(e.target.value)} className="campo">
            {lista.map(([c, , , pct]) => <option key={c} value={c}>{c}{pct && beneficio === 'PROMO' && conBeneficios ? ` · ${pct} %` : ''}</option>)}
          </select>
          {conBeneficios && beneficio === 'PROMO' && (
            <span className="flex items-center gap-2 text-xs text-slate-500">
              <input type="checkbox" checked={soloPromo} onChange={(e) => setSoloPromo(e.target.checked)} className="accent-marca-600" /> Solo carreras con descuento
            </span>
          )}
          {lead?.carrera && <span className="block text-xs text-slate-500">El lead consultó por: {lead.carrera}</span>}
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Beneficio</span>
          <select value={conBeneficios ? beneficio : 'NONE'} disabled={!conBeneficios} onChange={(e) => setBeneficio(e.target.value as BeneficioId)} className="campo">
            {['', 'Excelencia académica', 'Convenios'].map((g) => {
              const items = BENEFICIOS.filter((b) => (b.grupo ?? '') === g)
              const opts = items.map((b) => (
                <option key={b.id} value={b.id} disabled={b.id === 'EXPLORE' && explore !== 'si'}>{b.label}</option>
              ))
              return g ? <optgroup key={g} label={g}>{opts}</optgroup> : opts
            })}
          </select>
          {beneficio === 'INST' && conBeneficios && (
            <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-2">
              {(Object.keys(INSTITUCIONALES) as InstId[]).map((key) => {
                const i = inst.indexOf(key)
                return (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={i >= 0} disabled={i < 0 && inst.length >= 2} onChange={() => setInst(alternar(inst, key, 2))} className="accent-marca-600" />
                    {INSTITUCIONALES[key].label} · {INSTITUCIONALES[key].pct} %
                    {i >= 0 && <span className="ml-auto rounded-full bg-marca-600 px-1.5 text-[11px] font-bold text-white">{i + 1}.°</span>}
                  </label>
                )
              })}
            </div>
          )}
          {beneficio === 'EXPLORE' && conBeneficios && (
            <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-2">
              {(Object.keys(ADICIONALES_EXPLORE) as ExtraId[]).map((key) => {
                const i = adic.indexOf(key)
                return (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={i >= 0} onChange={() => setAdic(alternar(adic, key))} className="accent-marca-600" />
                    {ADICIONALES_EXPLORE[key].label} · 10 % adicional
                    {i >= 0 && <span className="ml-auto rounded-full bg-marca-600 px-1.5 text-[11px] font-bold text-white">{i + 2}.°</span>}
                  </label>
                )
              })}
            </div>
          )}
          <span className="block text-xs text-slate-500">
            {!conBeneficios ? 'En a distancia y semipresencial no aplica ningún descuento; solo el 5 % por pago al contado.'
              : beneficio === 'PROMO' ? 'Solo modalidad presencial, carreras seleccionadas.'
              : beneficio === 'INST' ? `Marca hasta 2 descuentos (${inst.length} de 2). Además puede sumar el 5 % al contado.`
              : beneficio === 'EXPLORE' ? '25 % en cualquier carrera; los 10 % adicionales se aplican en cascada en el orden en que los marques.'
              : k.beca ? (k.cubre ? 'La beca cubre toda la enseñanza: solo paga la matrícula.' : 'No aplica otro descuento. Admite el 5 % al contado.')
              : 'Tarifa regular.'}
          </span>
        </label>

        <div className="space-y-1.5">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Forma de pago</p>
          <Segmentos valor={k.contado ? 'contado' : 'cuotas'} alCambiar={setPago} deshabilitadas={k.cubre ? ['contado'] : []}
            opciones={[['cuotas', 'En cuotas'], ['contado', 'Al contado (+5 %)']]} />
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Postulante</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombres y apellidos" className="campo" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">DNI</span>
            <input value={dni} onChange={(e) => setDni(e.target.value)} inputMode="numeric" placeholder="Opcional" className="campo" />
            {explore && (
              <span className={`block text-xs ${explore === 'si' ? 'font-semibold text-emerald-700' : 'text-slate-500'}`}>
                {explore === 'si' ? '✓ Participó en EXPLORE 2026' : 'No figura en EXPLORE 2026'}
              </span>
            )}
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Válida hasta</span>
            <input type="date" value={vence} onChange={(e) => setVence(e.target.value)} className="campo" />
          </label>
        </div>

        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 rounded-lg bg-marca-50 px-3 py-2.5 text-sm tabular-nums">
          {k.contado ? (
            <>
              <dt className="text-slate-500">Enseñanza al contado</dt><dd className="font-semibold">{soles0(k.neto)}</dd>
              <dt className="text-slate-500">Pago único al matricularse</dt><dd className="font-semibold">{soles2(k.inicial)}</dd>
              <dt className="text-slate-500">Ahorro total</dt><dd className="font-semibold">{soles0(k.ahorro)}</dd>
            </>
          ) : (
            <>
              <dt className="text-slate-500">Enseñanza{k.desc ? ' con descuento' : ''}</dt><dd className="font-semibold">{soles0(k.con)}</dd>
              <dt className="text-slate-500">Pago al matricularse</dt><dd className="font-semibold">{soles2(k.inicial)}</dd>
              <dt className="text-slate-500">{k.n - 1} cuotas restantes de</dt><dd className="font-semibold">{soles2(k.cuota)}</dd>
            </>
          )}
        </dl>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="boton" disabled={pendiente} onClick={() => descargar('pdf')}>⬇ PDF</button>
          <button type="button" className="boton-secundario" disabled={pendiente} onClick={() => descargar('png')}>⬇ Imagen</button>
        </div>

        {lead ? (
          <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
            <p className="text-sm font-semibold text-emerald-800">Enviar por el chat a {lead.nombre ?? lead.telefono}</p>
            <Segmentos valor={adjunto} alCambiar={setAdjunto} opciones={[['imagen', 'Con imagen'], ['pdf', 'Con PDF'], ['texto', 'Solo texto']]} />
            <button type="button" disabled={pendiente} onClick={enviarPorChat} className="boton w-full bg-emerald-600">
              {pendiente ? 'Enviando…' : '📲 Enviar proforma por el chat'}
            </button>
            <p className="text-xs text-slate-500">Sale por el WhatsApp de Genesys con el mensaje de costos y queda en el historial del lead.</p>
          </div>
        ) : (
          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Celular (WhatsApp)</span>
              <input value={celular} onChange={(e) => setCelular(e.target.value)} inputMode="tel" placeholder="987 654 321" className="campo" />
            </label>
            <a
              href={celularWa ? `https://wa.me/${celularWa}?text=${encodeURIComponent(texto)}` : undefined}
              target="_blank" rel="noreferrer" aria-disabled={!celularWa}
              className={`boton w-full bg-emerald-600 ${celularWa ? '' : 'pointer-events-none opacity-50'}`}
            >
              Abrir WhatsApp con el mensaje
            </a>
            <p className="text-xs text-slate-500">Para enviarla desde el chat del CRM, ábrela desde la ficha del lead (botón 💰 Proforma).</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={copiar} className="text-sm font-medium text-marca-700 hover:underline">📋 Copiar mensaje</button>
          {lead && <Link href={`/leads/${lead.id}#chat`} className="text-sm font-medium text-marca-700 hover:underline">Ir al chat del lead →</Link>}
        </div>
        {estado && (
          <p role="status" className={`text-sm ${estado.tipo === 'ok' ? 'text-emerald-700' : estado.tipo === 'error' ? 'text-rose-600' : 'text-slate-500'}`}>{estado.texto}</p>
        )}
        <details>
          <summary className="cursor-pointer text-xs text-slate-500">Ver mensaje de WhatsApp</summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs whitespace-pre-wrap">{texto}</pre>
        </details>
      </div>

      <div ref={caja} className="min-w-0">
        <div style={{ height: alto * escala }} className="overflow-hidden">
          <div style={{ width: 794, transform: `scale(${escala})`, transformOrigin: 'top left' }}>
            <HojaProforma ref={hoja} k={k} numero={numero} emitida={emitida} nombre={nombre.trim()} dni={dni.trim()} asesor={asesor} vence={venceFecha} />
          </div>
        </div>
      </div>
    </div>
  )
}
