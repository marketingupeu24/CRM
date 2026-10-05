import type { Metadata } from 'next'
import { carreras } from '@crm/db'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'
import { PestanasRegistro } from '../nuevo/PestanasRegistro'
import { Importador } from './Importador'

export const metadata: Metadata = { title: 'Importar alumnos' }

export default async function PaginaImportar() {
  const { puede, perfil } = await exigirPermiso('registrar')
  const supabase = await crearClienteServidor()
  const [{ data: actividades }, { data: asesores }] = await Promise.all([
    supabase.from('actividades').select('id, nombre').order('activa', { ascending: false }).order('id', { ascending: false }).limit(50),
    puede('asignar')
      ? supabase.from('asesores').select('id, nombre').eq('activo', true).is('eliminado_at', null).order('nombre')
      : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
  ])
  const listaCarreras = [...new Set(carreras('PRES', 'JUL').map((c) => c[0]))]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Registrar leads</h1>
        <p className="text-sm text-slate-500">Varios alumnos a la vez: escríbelos en la planilla, pega las celdas de Excel o sube un CSV.</p>
      </div>
      <PestanasRegistro actual="varios" />
      <Importador carreras={listaCarreras} actividades={actividades ?? []} asignacion={{
          recibeLeads: perfil.activo,
          puedeRepartir: puede('repartir') || puede('asignar'),
          asesores: asesores ?? [],
        }} />
    </div>
  )
}
