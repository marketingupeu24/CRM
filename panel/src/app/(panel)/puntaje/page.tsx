import type { Metadata } from 'next'
import Link from 'next/link'
import { PuntajeInteres } from '@/components/PuntajeInteres'
import { InsigniaEstado } from '@/components/InsigniaEstado'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Puntaje de interés' }

/** Igual que public.calcular_puntaje (migración 20261009000006): si cambia allá, cambia aquí. */
const REGLAS = [
  { puntos: '+15', regla: 'Carrera o programa definido', ejemplo: 'Ya dijo qué quiere estudiar (o eligió CEPRE).' },
  { puntos: '+15', regla: 'Registrado', ejemplo: 'Dio su DNI, carnet de extranjería o pasaporte.' },
  { puntos: '+20', regla: 'Preguntó costos', ejemplo: '"¿Cuánto cuesta?", "mensualidad", "pagos", "cuotas", "pensión".' },
  { puntos: '+15', regla: 'Preguntó por inscripción', ejemplo: '"¿Cómo me inscribo?", "examen", "requisitos", "vacantes", "matrícula".' },
  { puntos: '+10', regla: 'Volvió a escribir', ejemplo: 'Escribió en 2 días distintos o más.' },
  { puntos: '+15', regla: 'Vino en persona', ejemplo: 'Se registró con un QR (feria, colegio, asesor) o lo atendieron en la oficina.' },
  { puntos: '+10', regla: 'Respondió al asesor', ejemplo: 'Contestó un mensaje del asesor o la llamada ("📞 Llamé" → contestó).' },
  { puntos: '+10', regla: 'Recibió proforma', ejemplo: 'Se le envió una proforma de costos.' },
  { puntos: '−15', regla: 'No escribe hace más de 14 días', ejemplo: 'Se enfrió: conviene volver a contactarlo.' },
]

export default async function PaginaPuntaje() {
  await exigirPermiso('leads')
  const supabase = await crearClienteServidor()
  const [{ data: todos }, { data: top }] = await Promise.all([
    supabase.from('leads').select('puntaje').not('estado', 'in', '(lead_inscrito,lead_matriculado,lead_perdido,lead_no_interesado)').limit(5000),
    supabase.from('leads').select('id, nombre, telefono, estado, puntaje, puntaje_motivos, carrera_interes')
      .not('estado', 'in', '(lead_inscrito,lead_matriculado,lead_perdido,lead_no_interesado)')
      .order('puntaje', { ascending: false }).order('ultimo_contacto', { ascending: false }).limit(10),
  ])
  const p = (todos ?? []).map((x) => x.puntaje)
  const grupos = [
    { texto: '🔥 Muy interesados (70 o más)', n: p.filter((x) => x >= 70).length, estilo: 'bg-rose-100 text-rose-700' },
    { texto: '⭐ Interesados (40 a 69)', n: p.filter((x) => x >= 40 && x < 70).length, estilo: 'bg-amber-100 text-amber-800' },
    { texto: '· Poco interés (menos de 40)', n: p.filter((x) => x < 40).length, estilo: 'bg-slate-100 text-slate-600' },
  ]

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">🔥 Puntaje de interés</h1>
        <p className="text-sm text-slate-500">
          Un número de 0 a 100 que el CRM calcula solo para cada lead con lo que el alumno hizo, para que atiendas primero a los más interesados.
          Se actualiza cada 10 minutos. Lo ves junto al nombre en <Link href="/leads" className="text-marca-700 hover:underline">Leads</Link> (pasa el mouse para ver los motivos)
          y en la ficha de cada lead; en Leads puedes ordenar por &quot;🔥 más interesados&quot;.
        </p>
      </div>

      <section className="tarjeta overflow-x-auto p-0">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <tr><th className="px-4 py-3">Puntos</th><th className="px-4 py-3">Qué hizo el alumno</th><th className="px-4 py-3">Ejemplo</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {REGLAS.map((r) => (
              <tr key={r.regla}>
                <td className={`px-4 py-2 font-semibold ${r.puntos.startsWith('−') ? 'text-rose-600' : 'text-emerald-700'}`}>{r.puntos}</td>
                <td className="px-4 py-2 font-medium">{r.regla}</td>
                <td className="px-4 py-2 text-slate-600">{r.ejemplo}</td>
              </tr>
            ))}
            <tr className="bg-slate-50"><td className="px-4 py-2 font-semibold">100</td><td className="px-4 py-2 font-medium">Inscrito o matriculado</td><td className="px-4 py-2 text-slate-600">Ya logró el objetivo.</td></tr>
            <tr className="bg-slate-50"><td className="px-4 py-2 font-semibold">0</td><td className="px-4 py-2 font-medium">Perdido o no interesado</td><td className="px-4 py-2 text-slate-600">Se marcó así en el CRM.</td></tr>
          </tbody>
        </table>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="tarjeta space-y-2 p-4 text-sm">
          <h2 className="font-semibold">Cómo leerlo</h2>
          <p><b>Ejemplo:</b> un alumno registrado (+15) que preguntó costos (+20) y volvió a escribir otro día (+10) tiene <b>45</b> ⭐.</p>
          <p>Si además vino a la oficina (+15) y le enviaste la proforma (+10), sube a <b>70</b> 🔥: es de los primeros a llamar.</p>
          <p>El máximo es 100 y el mínimo 0. Es una guía para ordenar el trabajo, no reemplaza tu criterio.</p>
        </div>
        <div className="tarjeta space-y-2 p-4 text-sm">
          <h2 className="font-semibold">Tus leads en seguimiento ahora</h2>
          {grupos.map((g) => (
            <p key={g.texto} className="flex items-center justify-between gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${g.estilo}`}>{g.texto}</span>
              <b>{g.n}</b>
            </p>
          ))}
          <p className="text-xs text-slate-500">Sin contar inscritos, matriculados, perdidos ni no interesados.</p>
        </div>
      </section>

      <section className="tarjeta p-4">
        <h2 className="mb-3 font-semibold">Los 10 más interesados (en seguimiento)</h2>
        <ul className="divide-y divide-slate-100 text-sm">
          {(top ?? []).map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-2 py-2">
              <Link href={`/leads/${l.id}`} className="font-medium text-marca-700 hover:underline">{l.nombre ?? l.telefono}</Link>
              <InsigniaEstado estado={l.estado} />
              <span className="text-xs text-slate-500">{l.carrera_interes ?? ''}</span>
              <span className="ml-auto"><PuntajeInteres puntaje={l.puntaje} motivos={l.puntaje_motivos} detalle /></span>
            </li>
          ))}
          {!top?.length && <li className="py-2 text-slate-500">Sin leads en seguimiento.</li>}
        </ul>
      </section>
    </div>
  )
}
