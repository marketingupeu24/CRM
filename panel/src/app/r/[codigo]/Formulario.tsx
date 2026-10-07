'use client'

import { useActionState } from 'react'
import { registrarseEnActividad, type ResultadoRegistro } from './acciones'

const GRADOS = ['5.° de secundaria', '4.° de secundaria', '3.° de secundaria o menos', 'Ya terminé el colegio', 'Universitario / traslado', 'Otro']

type Enviar = (previo: ResultadoRegistro, formData: FormData) => Promise<ResultadoRegistro>

/**
 * Formulario público del QR. Por defecto registra en una actividad (feria, colegio); con `enviar`
 * y `asesor` sirve para el QR de un asesor (atención presencial).
 */
export function FormularioRegistro({ codigo, carreras, colegio, enviar, asesor }: {
  codigo: string; carreras: string[]; colegio: string | null; enviar?: Enviar; asesor?: string
}) {
  const [r, accion, enviando] = useActionState<ResultadoRegistro, FormData>(enviar ?? registrarseEnActividad.bind(null, codigo), {})

  if (r.ok) {
    return (
      <div className="space-y-4 py-4 text-center">
        <p className="text-5xl" aria-hidden>🎉</p>
        <h2 className="text-xl font-semibold text-slate-900">¡Listo{r.nombre ? `, ${r.nombre}` : ''}!</h2>
        {r.enlaceWhatsApp ? (
          <>
            <p className="text-sm text-slate-600">
              {asesor
                ? <>Tus datos ya quedaron registrados. Último paso: toca el botón y <b>envía el mensaje</b> para abrir tu chat con Admisión de la Universidad Peruana Unión; <b>{asesor}</b> te sigue atendiendo.</>
                : <>Último paso: toca el botón y <b>envía el mensaje</b>. Genesys, nuestra asesora virtual, te responde al instante con la información de <b>{r.tema}</b>.</>}
            </p>
            <a href={r.enlaceWhatsApp} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-4 text-base font-bold text-white shadow-sm transition hover:brightness-105">
              <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6 fill-current"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.3Z"/></svg>
              Escríbenos por WhatsApp
            </a>
            <p className="text-xs text-slate-500">Se abrirá WhatsApp con tu mensaje ya escrito. Tu asesor(a) también te contactará.</p>
          </>
        ) : (
          <p className="text-sm text-slate-600">Recibimos tus datos. Tu asesor(a) de admisión te contactará pronto con la información que necesitas.</p>
        )}
      </div>
    )
  }

  const campo = 'mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 focus:border-[#003865] focus:ring-2 focus:ring-[#003865]/20 focus:outline-none'
  return (
    <form action={accion} className="space-y-4">
      <label className="block text-sm font-medium text-slate-700">Nombres y apellidos *
        <input name="nombre" required minLength={3} maxLength={120} autoComplete="name" className={campo} />
      </label>
      <label className="block text-sm font-medium text-slate-700">Celular (WhatsApp) *
        <input name="celular" required inputMode="tel" autoComplete="tel" placeholder="987 654 321" className={campo} />
      </label>
      <label className="block text-sm font-medium text-slate-700">Carrera que te interesa
        <select name="carrera" defaultValue="" className={campo}>
          <option value="">Aún no lo decido</option>
          <option value="CEPRE">CEPRE (preuniversitario)</option>
          {carreras.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium text-slate-700">DNI
          <input name="dni" inputMode="numeric" pattern="[0-9]{8}" maxLength={8} title="8 dígitos" placeholder="Opcional" className={campo} />
        </label>
        <label className="block text-sm font-medium text-slate-700">Grado
          <select name="grado" defaultValue="" className={campo}>
            <option value="">—</option>
            {GRADOS.map((g) => <option key={g}>{g}</option>)}
          </select>
        </label>
      </div>
      <label className="block text-sm font-medium text-slate-700">Colegio
        <input name="colegio" maxLength={120} defaultValue={colegio ?? ''} placeholder="Nombre de tu colegio" className={campo} />
      </label>
      {/* Campo trampa para bots (oculto para las personas) */}
      <input name="sitio_web" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />
      <label className="flex items-start gap-3 text-sm text-slate-600">
        <input type="checkbox" name="acepto" required className="mt-1 h-5 w-5 shrink-0 accent-[#003865]" />
        Acepto que la Universidad Peruana Unión me contacte por WhatsApp o llamada para darme información de admisión.
      </label>
      {r.error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{r.error}</p>}
      <button disabled={enviando} className="w-full rounded-xl bg-[#003865] px-4 py-3.5 text-base font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-60">
        {enviando ? 'Enviando…' : asesor ? 'Enviar mis datos' : 'Quiero recibir información'}
      </button>
    </form>
  )
}
