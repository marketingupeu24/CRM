'use client'

// "📞 Llamé": registra una llamada o un WhatsApp del celular personal del asesor, con el resultado.
import { useActionState, useEffect, useState } from 'react'
import { registrarContacto, type Resultado } from '../acciones'

const RESULTADOS = [
  { valor: 'contesto', llamada: '✅ Contestó', whatsapp: '✅ Respondió' },
  { valor: 'no_contesto', llamada: '❌ No contestó', whatsapp: '❌ No respondió' },
  { valor: 'volver', llamada: '🔁 Volver a llamar', whatsapp: '🔁 Volver a escribir' },
] as const

/** Mañana a las 9:00 (hora de Perú), para "volver a llamar" */
function mananaNueve(): string {
  const d = new Date(Date.now() + 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(d) + 'T09:00'
}

export function RegistrarContacto({ leadId }: { leadId: string }) {
  const [abierto, setAbierto] = useState(false)
  const [medio, setMedio] = useState<'llamada' | 'whatsapp'>('llamada')
  const [resultado, setResultado] = useState<'contesto' | 'no_contesto' | 'volver'>('contesto')
  const [r, accion, guardando] = useActionState<Resultado, FormData>(registrarContacto.bind(null, leadId), {})

  // Guardado: se cierra y queda listo para el siguiente
  useEffect(() => { if (r.ok) { setAbierto(false); setResultado('contesto') } }, [r])

  if (!abierto) {
    return (
      <div className="space-y-1">
        <button type="button" onClick={() => setAbierto(true)} className="boton-secundario w-full">📞 Llamé / le escribí por mi WhatsApp</button>
        {r.ok && <p className="text-xs text-emerald-600">Contacto registrado.</p>}
      </div>
    )
  }
  return (
    <form action={accion} className="space-y-3">
      <div className="flex gap-1.5">
        {(['llamada', 'whatsapp'] as const).map((m) => (
          <label key={m} className={`flex-1 cursor-pointer rounded-lg border px-2 py-1.5 text-center text-xs font-medium ${medio === m ? 'border-marca-600 bg-marca-600 text-white' : 'border-slate-300 text-slate-700'}`}>
            <input type="radio" name="medio" value={m} checked={medio === m} onChange={() => setMedio(m)} className="sr-only" />
            {m === 'llamada' ? '📞 Llamada' : '💬 Mi WhatsApp'}
          </label>
        ))}
      </div>
      <div className="grid gap-1.5">
        {RESULTADOS.map((x) => (
          <label key={x.valor} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${resultado === x.valor ? 'border-marca-600 bg-marca-50 font-medium text-marca-700' : 'border-slate-200 text-slate-700'}`}>
            <input type="radio" name="resultado" value={x.valor} checked={resultado === x.valor} onChange={() => setResultado(x.valor)} className="sr-only" />
            {x[medio]}
          </label>
        ))}
      </div>
      {resultado === 'volver' && (
        <label className="block text-sm text-slate-600">¿Cuándo?
          <input type="datetime-local" name="volver" required defaultValue={mananaNueve()} className="campo mt-1" />
        </label>
      )}
      <textarea name="nota" rows={2} maxLength={1000} placeholder="¿Qué conversaron? (opcional)" className="campo" />
      {r.error && <p role="alert" className="text-sm text-rose-600">{r.error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={guardando} className="boton flex-1">{guardando ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" onClick={() => setAbierto(false)} className="boton-secundario">Cancelar</button>
      </div>
    </form>
  )
}
