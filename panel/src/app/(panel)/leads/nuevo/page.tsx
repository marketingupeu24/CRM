import type { Metadata } from 'next'
import Link from 'next/link'
import { obtenerSesion } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'
import { FormularioNuevoLead } from './FormularioNuevoLead'

export const metadata: Metadata = { title: 'Registrar lead' }

export default async function PaginaNuevoLead() {
  const { esAdmin } = await obtenerSesion()
  const supabase = await crearClienteServidor()

  const [{ data: asesores }, { data: convocatorias }] = await Promise.all([
    esAdmin
      ? supabase.from('asesores').select('id, nombre').eq('rol', 'asesor').eq('activo', true).is('eliminado_at', null).order('nombre')
      : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
    supabase.from('leads').select('convocatoria').not('convocatoria', 'is', null).limit(2000),
  ])

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/leads" className="text-sm text-slate-500 hover:text-slate-800">← Volver a leads</Link>
      <div>
        <h1 className="text-2xl font-semibold">Registrar lead</h1>
        <p className="text-sm text-slate-500">
          Para prospectos que llegan por oficina, llamada o redes. Si el celular o DNI ya existe, no se duplica.
        </p>
      </div>
      <FormularioNuevoLead
        esAdmin={esAdmin}
        asesores={asesores ?? []}
        convocatorias={[...new Set((convocatorias ?? []).map((c) => c.convocatoria!))].sort().reverse()}
      />
    </div>
  )
}
