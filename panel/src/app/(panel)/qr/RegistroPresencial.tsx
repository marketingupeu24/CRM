'use client'

// Paso 1: el asesor escribe los datos de quien atiende. Paso 2: la persona escanea el QR que
// aparece y envía el mensaje. Paso 3: el panel confirma que quedó registrada (con su celular).
import Link from 'next/link'
import { useActionState, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { GRADOS } from '@crm/db'
import { crearClienteNavegador } from '@/lib/supabase/client'
import { crearPrerregistro, type ResultadoPrerregistro } from './acciones'

interface Registrado {
  leadId: string
  telefono: string
}

export function RegistroPresencial({ carreras }: { carreras: string[] }) {
  const [resultado, accion, enviando] = useActionState<ResultadoPrerregistro, FormData>(crearPrerregistro, {})
  const [qr, setQr] = useState<string | null>(null)
  const [registrado, setRegistrado] = useState<Registrado | null>(null)
  const [mostrarQr, setMostrarQr] = useState(false)
  const formulario = useRef<HTMLFormElement>(null)

  // Nuevo QR para la persona recién escrita
  useEffect(() => {
    if (!resultado.url) return
    setRegistrado(null)
    setMostrarQr(true)
    QRCode.toDataURL(resultado.url, { width: 520, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#003865', light: '#ffffff' } }).then(setQr)
  }, [resultado.url])

  // Espera a que la persona envíe el mensaje (revisa cada 3 s)
  useEffect(() => {
    if (!resultado.id || !mostrarQr || registrado) return
    const supabase = crearClienteNavegador()
    let activo = true
    const revisar = async () => {
      const { data } = await supabase.from('prerregistros').select('usado_at, lead_id, lead:leads(telefono)').eq('id', resultado.id!).maybeSingle()
      if (activo && data?.usado_at && data.lead_id) {
        const lead = data.lead as unknown as { telefono: string } | null
        setRegistrado({ leadId: data.lead_id, telefono: lead?.telefono ?? '' })
      }
    }
    const intervalo = setInterval(revisar, 3000)
    return () => { activo = false; clearInterval(intervalo) }
  }, [resultado.id, mostrarQr, registrado])

  function otraPersona() {
    setMostrarQr(false)
    setRegistrado(null)
    setQr(null)
    formulario.current?.reset()
    setTimeout(() => formulario.current?.querySelector<HTMLInputElement>('input[name="nombre"]')?.focus(), 50)
  }

  const grados: readonly string[] = GRADOS
  return (
    <section className="no-imprimir tarjeta p-5">
      <h2 className="font-semibold">Registrar a quien atiendo ahora</h2>
      <p className="mb-4 text-sm text-slate-500">
        Escribe sus datos y muéstrale el QR que aparece: al escanearlo y enviar el mensaje, queda registrada con estos datos,
        con su celular real de WhatsApp y como tu lead.
      </p>

      {mostrarQr && resultado.url ? (
        <div className="flex flex-col items-center gap-3 text-center">
          {registrado ? (
            <>
              <p className="text-4xl">✅</p>
              <p className="text-lg font-semibold text-emerald-700">{resultado.nombre} quedó registrado(a)</p>
              <p className="text-sm text-slate-600">Celular: <b>{registrado.telefono}</b></p>
              <div className="flex flex-wrap justify-center gap-2">
                <Link href={`/leads/${registrado.leadId}`} className="boton-secundario">Ver ficha</Link>
                <button onClick={otraPersona} className="boton">Registrar a otra persona</button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600">Pídele a <b>{resultado.nombre}</b> que escanee este QR con la cámara y envíe el mensaje:</p>
              {/* eslint-disable-next-line @next/next/no-img-element -- QR generado en el navegador */}
              {qr ? <img src={qr} alt={`QR de registro de ${resultado.nombre}`} className="h-64 w-64 rounded-lg border border-slate-200" /> : <div className="h-64 w-64 animate-pulse rounded-lg bg-slate-100" />}
              <p className="flex items-center gap-2 text-sm text-marca-700"><span className="h-2 w-2 animate-pulse rounded-full bg-marca-600" /> Esperando su mensaje…</p>
              <button onClick={otraPersona} className="text-sm font-medium text-slate-500 hover:underline">Cancelar y registrar a otra persona</button>
            </>
          )}
        </div>
      ) : (
        <form ref={formulario} action={accion} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm text-slate-600 sm:col-span-2">
            Nombres y apellidos *
            <input name="nombre" required minLength={3} autoComplete="off" className="campo mt-1" />
          </label>
          <label className="text-sm text-slate-600">
            DNI (opcional)
            <input name="dni" inputMode="numeric" maxLength={12} autoComplete="off" className="campo mt-1" />
          </label>
          <label className="text-sm text-slate-600">
            Carrera de interés
            <input name="carrera" list="carreras-presencial" autoComplete="off" className="campo mt-1" />
            <datalist id="carreras-presencial">{carreras.map((c) => <option key={c} value={c} />)}<option value="CEPRE" /></datalist>
          </label>
          <label className="text-sm text-slate-600">
            Colegio
            <input name="colegio" autoComplete="off" className="campo mt-1" />
          </label>
          <label className="text-sm text-slate-600">
            Grado
            <select name="grado" defaultValue="" className="campo mt-1">
              <option value="">—</option>
              {grados.map((g) => <option key={g}>{g}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3">
            <button className="boton" disabled={enviando}>{enviando ? 'Generando…' : 'Generar su QR'}</button>
            {resultado.error && <p role="alert" className="text-sm text-rose-600">{resultado.error}</p>}
          </div>
        </form>
      )}
    </section>
  )
}
