import type { Metadata } from 'next'
import Link from 'next/link'
import { carreraParecida } from '@crm/db'
import { fechaHora, num } from '@/lib/formato'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'
import { GeneradorProforma, type LeadProforma } from './GeneradorProforma'

export const metadata: Metadata = { title: 'Proformas' }

function parametro(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? ''
}

export default async function PaginaCostos(props: PageProps<'/costos'>) {
  const sp = await props.searchParams
  const { perfil } = await exigirPermiso('costos')
  const supabase = await crearClienteServidor()
  const leadId = parametro(sp.lead)

  let lead: LeadProforma | null = null
  if (/^[0-9a-f-]{36}$/i.test(leadId)) {
    const { data } = await supabase.from('leads').select('id, nombre, dni, telefono, carrera_interes, modalidad, programa').eq('id', leadId).maybeSingle()
    if (data) {
      lead = {
        id: data.id, nombre: data.nombre, dni: data.dni, telefono: data.telefono,
        carrera: data.carrera_interes ?? data.modalidad, esCepre: data.programa === 'cepre',
      }
    }
  }
  const { data: recientes } = await supabase.from('proformas')
    .select('id, numero, carrera, campus, total, inicial, enviada_at, archivo_url, created_at, datos, lead_id')
    .order('created_at', { ascending: false }).limit(8)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Proformas de costos · Admisión 2027-1</h1>
        <p className="text-sm text-slate-500">
          Elige modalidad, campus, carrera y beneficio: la proforma se calcula al instante. Descárgala en PDF o imagen
          {lead ? <>, o envíala por el chat a <b>{lead.nombre ?? lead.telefono}</b>.</> : ', o ábrela desde la ficha de un lead para enviarla por el chat.'}
        </p>
        {lead?.esCepre && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Este lead consultó por CEPRE: la proforma es para carreras profesionales (primer año).</p>
        )}
      </div>

      <GeneradorProforma
        lead={lead}
        asesor={perfil.nombre}
        carreraSugerida={carreraParecida(lead?.carrera, 'PRES', 'JUL')}
      />

      {!!recientes?.length && (
        <section className="tarjeta overflow-hidden">
          <h2 className="border-b border-slate-100 px-5 py-3 font-semibold">Últimas proformas</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {recientes.map((p) => {
              const datos = p.datos as { nombre?: string }
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{datos.nombre || 'Sin nombre'} · {p.carrera}</p>
                    <p className="text-xs text-slate-500">{p.numero} · {p.campus} · {fechaHora(p.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="tabular-nums">Total S/ {num(Number(p.total))} · inicial S/ {num(Number(p.inicial))}</span>
                    {p.enviada_at
                      ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">Enviada</span>
                      : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">Descargada</span>}
                    {p.archivo_url && <a href={p.archivo_url} target="_blank" rel="noreferrer" className="font-medium text-marca-700 hover:underline">Ver archivo</a>}
                    {p.lead_id && <Link href={`/leads/${p.lead_id}`} className="font-medium text-marca-700 hover:underline">Lead</Link>}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
