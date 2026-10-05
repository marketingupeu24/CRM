// Hoja A4 de la proforma (mismo diseño que costos/Proformas_Admision_2027-1.html, con el logo oficial UPeU).
// Es "papel": colores fijos. Se usa para la vista previa y para generar la imagen/PDF.
/* eslint-disable @next/next/no-img-element -- el logo debe ir como <img> para que salga en la imagen generada */
import { forwardRef } from 'react'
import { Libre_Franklin, Spectral } from 'next/font/google'
import { condiciones, fechaLarga, INSTITUCIONALES, soles0, soles2, type Proforma } from '@crm/db'
import './hoja.css'

const sans = Libre_Franklin({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-pf-sans', display: 'swap' })
const serif = Spectral({ subsets: ['latin'], weight: ['500', '600', '700', '800'], variable: '--font-pf-serif', display: 'swap' })

interface Props {
  k: Proforma
  numero: string
  emitida: Date
  nombre: string
  dni: string
  asesor: string
  vence: Date | null
}

const ordA = (i: number) => ({ 1: '1ra', 2: '2da', 3: '3ra', 4: '4ta', 5: '5ta', 6: '6ta' } as Record<number, string>)[i] ?? `${i}ta`

function Linea({ a, b }: { a: string; b: string }) {
  return <div className="ln"><span>{a}</span><b>{b}</b></div>
}

function Fila({ l, v, c = '', sub = '' }: { l: string; v: string; c?: string; sub?: string }) {
  return <div className={`dp-r ${c}`}><span>{l}{sub && <small>{sub}</small>}</span><b>{v}</b></div>
}

function Disco({ k }: { k: Proforma }) {
  const tp = k.descs.reduce((a, x) => a + (Object.values(INSTITUCIONALES).find((it) => x.l.startsWith(it.label))?.pct ?? 0), 0)
  if (k.beca) {
    return (
      <div className="disc">
        <small>{k.beca.pct === 100 ? 'BECA' : 'MEDIA BECA'}</small><b style={{ fontSize: 27 }}>{soles0(k.desc)}</b>
        <i>{k.cubre ? 'cubre la enseñanza' : 'en la enseñanza'}</i><em>{k.beca.grp === 'Convenios' ? 'CONVENIO IEA' : 'EXCELENCIA'}</em>
      </div>
    )
  }
  if (k.benef === 'EXPLORE' && k.descs.length) {
    return (
      <div className="disc">
        <small>EXPLORE 2026</small><b>25<sup>%</sup></b>
        <i>{k.descs.length > 1 ? `+ ${(k.descs.length - 1) * 10} % adicional` : 'en la enseñanza'}</i><em>{k.contado ? '+5 % al contado' : 'PROMOCIÓN'}</em>
      </div>
    )
  }
  if (k.benef === 'INST' && k.descs.length) {
    return (
      <div className="disc">
        <small>DESCUENTO</small><b>{tp}<sup>%</sup></b><i>institucional</i>
        <em>{k.contado ? '+5 % al contado' : `${k.descs.length} BENEFICIO${k.descs.length > 1 ? 'S' : ''}`}</em>
      </div>
    )
  }
  if (k.pct) return <div className="disc"><small>DESCUENTO</small><b>{k.pct}<sup>%</sup></b><i>en la enseñanza</i><em>{k.contado ? '+5 % al contado' : 'POR 1 AÑO'}</em></div>
  if (k.descMat) return <div className="disc"><small>LANZAMIENTO</small><b style={{ fontSize: 30 }}>100<sup>%</sup></b><i>de la matrícula</i>{k.contado && <em>+5 % al contado</em>}</div>
  if (k.contado) return <div className="disc"><small>AL CONTADO</small><b>5<sup>%</sup></b><i>en la enseñanza</i></div>
  return <div className="disc reg"><small>TARIFA</small><b>Regular</b><i>sin descuento</i></div>
}

function TextoAnio({ k }: { k: Proforma }) {
  const contado = k.contado ? ' El 5 % adicional aplica al ciclo que se paga al contado.' : ''
  if (k.pct) return <p>El descuento del <b>{k.pct} %</b> rige por el <b>primer año</b>: ciclos <b>2027-1</b> y <b>2027-2</b>. En el 2027-2 se aplica sobre los créditos que lleves en ese ciclo.{contado}</p>
  if (k.beca) return <p><b>{k.beca.label}</b>. Vigencia: {k.beca.vig}. No se combina con otros descuentos.</p>
  if (k.benef === 'EXPLORE' && k.descs.length) return <p><b>Promoción EXPLORE 2026</b>: {k.descs.map((x) => x.w).join(' + ')}, aplicados en cascada.{contado}</p>
  if (k.benef === 'INST' && k.descs.length) return <p>Descuentos institucionales: <b>{k.descs.map((x) => x.w).join(' + ')}</b>. No se combinan con la promoción del 25 % / 15 %.{contado}</p>
  if (k.contado) return <p>El <b>5 % adicional</b> aplica al ciclo que se paga al contado, junto con la matrícula.</p>
  return null
}

export const HojaProforma = forwardRef<HTMLElement, Props>(function HojaProforma({ k, numero, emitida, nombre, dni, asesor, vence }, ref) {
  const tamCarrera = k.name.length > 60 ? 21 : k.name.length > 40 ? 24 : 30
  const anio = TextoAnio({ k })
  const icono = k.benef === 'EXPLORE' && k.descs.length ? 'EXP' : (k.beca || (k.benef === 'INST' && k.descs.length)) ? '★' : null

  return (
    <article ref={ref} className={`pf-hoja ${sans.variable} ${serif.variable}`}>
      <div className="hero">
        <div className="hbar">
          <div className="brand">
            <img src="/marca/logo-upeu-blanco.svg" alt="Universidad Peruana Unión" className="logo" />
          </div>
          <div className="docid">
            <div className="t">Proforma</div><div className="n">{numero}</div><div className="f">Emitida el {fechaLarga(emitida)}</div>
          </div>
        </div>
        <div className="hmain">
          <div>
            <div className="kick">Admisión 2027-1 · primer año</div>
            <div className="career" style={{ fontSize: tamCarrera, maxWidth: k.name.length > 40 ? 520 : 470 }}>{k.name}</div>
            <div className="chips">
              {[k.cp.nombre, k.modal, `${k.cr} créditos · ${soles0(k.costo)} c/u`, k.contado ? 'Pago al contado' : `${k.n} cuotas`].map((t) => <span key={t} className="chip">{t}</span>)}
            </div>
            <div className="who">Proforma para<b className={nombre ? '' : 'ph'}>{nombre || 'Nombre del postulante'}</b><span>{dni ? `DNI ${dni}` : ''}</span></div>
          </div>
          <Disco k={k} />
        </div>
      </div>

      <div className="body">
        <div className="kpis">
          <div className="kpi">
            <div className="k">Precio regular del ciclo</div>
            <div className="v">{k.ahorro ? <s>{soles0(k.regular)}</s> : soles0(k.regular)}</div>
            <Linea a="Enseñanza" b={soles0(k.ens)} /><Linea a="Matrícula" b={soles0(k.mat)} />
            {!!k.otrosT && <Linea a="Otros cobros" b={soles0(k.otrosT)} />}
          </div>
          {k.ahorro ? (
            <div className="kpi save">
              <div className="k">Tu ahorro en el ciclo</div><div className="v">{soles0(k.ahorro)}</div>
              {k.descs.map((x) => <Linea key={x.l} a={x.w} b={soles0(x.v)} />)}
              {!!k.desc5 && <Linea a="5 % adicional al contado" b={soles0(k.desc5)} />}
              {!!k.descMat && <Linea a="Lanzamiento · matrícula" b={soles0(k.descMat)} />}
            </div>
          ) : (
            <div className="kpi">
              <div className="k">Total del ciclo</div><div className="v">{soles0(k.total)}</div>
              <Linea a="Enseñanza" b={soles0(k.neto)} /><Linea a="Matrícula" b={soles0(k.matNeta)} />
              {!!k.otrosT && <Linea a="Otros cobros" b={soles0(k.otrosT)} />}
            </div>
          )}
          <div className="kpi hot">
            <div className="k">{k.contado ? 'Pago único al matricularte' : 'Pagas al matricularte'}</div>
            <div className="v">{soles2(k.inicial)}</div>
            <Linea a="Matrícula" b={soles0(k.matNeta)} />
            {!k.cubre && <Linea a={k.contado ? 'Enseñanza al contado' : '1.ª cuota'} b={soles2(k.cuota)} />}
            {k.otros.map((o) => <Linea key={o[0]} a={o[0]} b={soles0(o[1])} />)}
            {!k.contado && <div className="d" style={{ marginTop: 4 }}>{k.cubre ? 'la beca cubre toda la enseñanza' : `luego ${k.n - 1} cuotas de ${soles2(k.cuota)}`}</div>}
          </div>
        </div>

        <div className="dp">
          <div className="dp-h"><span className="dp-ic" />Detalle de pago</div>
          <div className="dp-g">
            <div className="dp-c">
              <div className="dp-t">Cobros</div>
              <div>
                <Fila l="Matrícula" v={soles2(k.mat)} />
                <Fila l="Enseñanza" v={soles2(k.ens)} sub={`${k.cr} créditos × ${soles0(k.costo)}`} />
                {k.otros.map((o) => <Fila key={o[0]} l={o[0]} v={soles2(o[1])} sub="se paga con la matrícula" />)}
                <div className="dp-sp" />
                <Fila l="Total de cobros" v={soles2(k.regular)} c="tot" />
              </div>
            </div>
            <div className="dp-c des">
              <div className="dp-t">Descuentos</div>
              <div>
                {k.descs.map((x) => <Fila key={x.l} l={x.l} v={'−' + soles2(x.v)} c="neg" sub={x.sub} />)}
                {!!k.desc5 && <Fila l="Descuento 5 % por pago al contado" v={'−' + soles2(k.desc5)} c="neg" sub={`sobre ${soles0(k.con)}`} />}
                {!!k.descMat && <Fila l="Lanzamiento de la carrera" v={'−' + soles2(k.descMat)} c="neg" sub="100 % de la matrícula, primer ciclo" />}
                {!k.descs.length && !k.desc5 && !k.descMat && <Fila l="Sin descuentos" v={soles2(0)} c="none" />}
                <div className="dp-sp" />
                <Fila l="Total de descuentos" v={(k.ahorro ? '−' : '') + soles2(k.ahorro)} c="tot" />
              </div>
            </div>
          </div>
        </div>

        <div className="imp">
          <div>Importe total de contrato académico: <b>{soles2(k.total)}</b></div>
          <div className="hl">
            {k.cubre ? 'Paga al matricularse · beca total' : k.contado ? 'Paga al matricularse · pago al contado' : `Paga al matricularse · Plan ${k.n} armadas`}: <b>{soles2(k.inicial)}</b>
          </div>
        </div>
        <div className="var"><b>SUJETO A VARIACIÓN</b><span>Los montos de esta proforma son referenciales y pueden variar.</span></div>

        <div>
          <div className="pp-t">Pagos pendientes</div>
          <table className="pp">
            <thead><tr><th>N.° de armada</th><th>Concepto</th><th>Monto</th></tr></thead>
            <tbody>
              {k.cubre
                ? <tr className="none"><td colSpan={3}>Sin pagos pendientes: la beca cubre toda la enseñanza del ciclo.</td></tr>
                : k.contado
                  ? <tr className="none"><td colSpan={3}>Sin pagos pendientes: la enseñanza del ciclo se paga completa al matricularse.</td></tr>
                  : Array.from({ length: k.n - 1 }, (_, i) => (
                    <tr key={i}><td>{ordA(i + 2)} armada</td><td>Cuota de enseñanza</td><td><b>{soles2(k.cuota)}</b></td></tr>
                  ))}
            </tbody>
          </table>
          <div className="pp-n">
            {k.cubre
              ? `* La beca cubre el 100 % de la enseñanza: solo se paga la matrícula${k.otros.length ? ' y los otros cobros' : ''}.`
              : k.contado
                ? '* Pago al contado: matrícula más la enseñanza del ciclo con el 5 % adicional, en un solo pago.'
                : `* Cronograma referencial para pago en ${k.n} armadas. La 1ra armada se paga con la matrícula. Las fechas de pago se comunicarán al matricularse.`}
          </div>
        </div>

        <div className="split">
          <div className="cond"><div className="sec-t">Condiciones</div><ol>{condiciones(k).map((t) => <li key={t}>{t}</li>)}</ol></div>
          <div>
            {anio && (
              <div className="year">
                <div className="ic">{icono ?? <>1<br />AÑO</>}</div>
                {anio}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="foot">
        <div>{vence ? `Válida hasta el ${fechaLarga(vence)}` : 'Admisión 2027-1'}<br />Proforma referencial por alumno, concepto enseñanza. No constituye comprobante de pago.</div>
        <div className="sign"><b>{asesor || ' '}</b>Asesor de admisión</div>
      </div>
    </article>
  )
})
