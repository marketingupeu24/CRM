import type { Metadata } from 'next'
import Link from 'next/link'
import { carreras } from '@crm/db'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'
import { PestanasRegistro } from './PestanasRegistro'
import { RegistroRapido } from './RegistroRapido'

export const metadata: Metadata = { title: 'Registrar lead' }

export default async function PaginaNuevoLead() {
  const { puede, perfil } = await exigirPermiso('registrar')
  const supabase = await crearClienteServidor()

  const [{ data: asesores }, { data: convocatorias }, { data: actividades }] = await Promise.all([
    puede('asignar')
      ? supabase.from('asesores').select('id, nombre').eq('activo', true).is('eliminado_at', null).order('nombre')
      : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
    supabase.from('leads').select('convocatoria').not('convocatoria', 'is', null).limit(2000),
    supabase.from('actividades').select('id, nombre, lugar, tipo').order('activa', { ascending: false }).order('id', { ascending: false }).limit(50),
  ])

  return (
    <div className="space-y-5">
      <Link href="/leads" className="text-sm text-slate-500 hover:text-slate-800">← Volver a leads</Link>
      <div>
        <h1 className="text-2xl font-semibold">Registrar lead</h1>
        <p className="text-sm text-slate-500">
          Para fichas en papel, oficina, llamadas o redes. Guarda con Enter y sigue con la siguiente: si el celular o DNI ya existe, no se duplica.
        </p>
      </div>
      <PestanasRegistro actual="uno" />
      <RegistroRapido
        carreras={[...new Set(carreras('PRES', 'JUL').map((c) => c[0]))]}
        actividades={actividades ?? []}
        asignacion={{
          recibeLeads: perfil.activo,
          puedeRepartir: puede('repartir') || puede('asignar'),
          asesores: asesores ?? [],
        }}
        convocatorias={[...new Set((convocatorias ?? []).map((c) => c.convocatoria!))].sort().reverse()}
      />
    </div>
  )
}
