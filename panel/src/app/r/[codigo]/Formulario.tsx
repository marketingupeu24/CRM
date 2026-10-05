'use client'

import { useActionState } from 'react'
import { registrarseEnActividad, type ResultadoRegistro } from './acciones'

const GRADOS = ['5.° de secundaria', '4.° de secundaria', '3.° de secundaria o menos', 'Ya terminé el colegio', 'Universitario / traslado', 'Otro']

export function FormularioRegistro({ codigo, carreras, colegio }: { codigo: string; carreras: string[]; colegio: string | null }) {
  const [r, accion, enviando] = useActionState<ResultadoRegistro, FormData>(registrarseEnActividad.bind(null, codigo), {})

  if (r.ok) {
    return (
      <div className="space-y-3 py-6 text-center">
        <p className="text-5xl" aria-hidden>🎉</p>
        <h2 className="text-xl font-semibold text-slate-900">¡Listo{r.nombre ? `, ${r.nombre}` : ''}!</h2>
        <p className="text-sm text-slate-600">Recibimos tus datos. En breve te escribiremos por WhatsApp desde el número de Admisión UPeU con la información que necesitas.</p>
        <p className="text-xs text-slate-500">Ya puedes cerrar esta página.</p>
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
          <input name="dni" inputMode="numeric" maxLength={12} placeholder="Opcional" className={campo} />
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
        {enviando ? 'Enviando…' : 'Quiero recibir información'}
      </button>
    </form>
  )
}
