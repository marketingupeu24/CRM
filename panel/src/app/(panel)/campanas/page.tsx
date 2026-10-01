import type { Metadata } from 'next'
import Link from 'next/link'
import { num, pct } from '@/lib/formato'
import { fechaCorta, type Campana } from '@/lib/periodos'
import { obtenerSesion } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'
import { AccionesCampana, FormularioCampana } from './Formularios'

export const metadata: Metadata = { title: 'Campañas' }

interface ResumenCampana extends Campana {
  total: number
  contactados: number
  matriculados: number
  perdidos: number
}

export default async function PaginaCampanas() {
  const { esAdmin } = await obtenerSesion()
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc('resumen_campanas')
  const campanas = (data ?? []) as unknown as ResumenCampana[]
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Campañas</h1>
        <p className="text-sm text-slate-500">
          Cada campaña agrupa los leads registrados entre su fecha de inicio y fin (hora de Lima) y, si tiene origen,
          solo los que nos conocieron por ese medio. {esAdmin ? 'Todos los leads.' : 'Cifras de tus leads.'}
        </p>
      </div>

      {esAdmin && (
        <section className="tarjeta p-6">
          <h2 className="mb-4 font-semibold">Nueva campaña</h2>
          <FormularioCampana />
        </section>
      )}

      {error && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error.message}</p>}

      <ul className="space-y-4">
        {campanas.map((c) => {
          const enCurso = c.inicio <= hoy && hoy <= c.fin
          const filtro = `campana=${c.id}`
          return (
            <li key={c.id} className={`tarjeta p-5 ${c.activa ? '' : 'opacity-70'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-lg font-semibold">
                    {c.nombre}
                    {enCurso && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">En curso</span>}
                    {!c.activa && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Archivada</span>}
                  </p>
                  <p className="text-sm text-slate-500">
                    {fechaCorta(c.inicio)} – {fechaCorta(c.fin)} · {c.origen ? `Origen: ${c.origen}` : 'Todos los orígenes'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link href={`/leads?${filtro}`} className="boton-secundario">Ver leads</Link>
                  <a href={`/leads/exportar?${filtro}`} className="boton" download>⬇ Excel</a>
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Leads', num(c.total), ''],
                  ['Contactados o más', num(c.contactados), pct(c.contactados, c.total)],
                  ['Matriculados', num(c.matriculados), pct(c.matriculados, c.total)],
                  ['Perdidos / no interesados', num(c.perdidos), pct(c.perdidos, c.total)],
                ].map(([titulo, valor, detalle]) => (
                  <div key={titulo} className="rounded-xl bg-slate-50 px-4 py-3">
                    <dt className="text-xs text-slate-500">{titulo}</dt>
                    <dd className="text-2xl font-semibold tabular-nums">
                      {valor} {detalle && <span className="text-sm font-normal text-slate-500">{detalle}</span>}
                    </dd>
                  </div>
                ))}
              </dl>

              {esAdmin && <div className="mt-4 border-t border-slate-100 pt-3"><AccionesCampana campana={c} /></div>}
            </li>
          )
        })}
        {!campanas.length && (
          <li className="tarjeta px-5 py-10 text-center text-sm text-slate-500">
            {esAdmin ? 'Aún no hay campañas. Crea la primera arriba.' : 'El administrador aún no ha creado campañas.'}
          </li>
        )}
      </ul>
    </div>
  )
}
