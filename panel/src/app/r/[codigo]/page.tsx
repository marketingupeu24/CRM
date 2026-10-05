import type { Metadata } from 'next'
import { carreras } from '@crm/db'
import { LogoUpeu } from '@/components/LogoUpeu'
import { crearClienteServidor } from '@/lib/supabase/server'
import { FormularioRegistro } from './Formulario'

export const metadata: Metadata = { title: 'Regístrate · Admisión UPeU', robots: { index: false } }

interface ActividadPublica { nombre: string; tipo: string; lugar: string | null; fecha: string | null; activa: boolean }

/** Página pública del QR (ferias y colegios): el alumno deja sus datos desde su celular. */
export default async function PaginaRegistro(props: PageProps<'/r/[codigo]'>) {
  const { codigo } = await props.params
  const supabase = await crearClienteServidor()
  const { data } = await supabase.rpc('actividad_publica', { p_codigo: codigo })
  const actividad = data as unknown as ActividadPublica | null
  const listaCarreras = [...new Set(carreras('PRES', 'JUL').map((c) => c[0]))]

  return (
    <main className="min-h-screen bg-slate-100" data-theme="light" style={{ colorScheme: 'light' }}>
      <div className="px-5 pt-8 pb-16 text-center" style={{ background: '#003865', borderBottom: '6px solid #f7a800' }}>
        <div className="flex justify-center"><LogoUpeu variante="blanco" className="h-12" /></div>
        <p className="mt-4 text-xs font-semibold tracking-[0.18em] uppercase" style={{ color: '#f7a800' }}>Admisión 2027 · Campus Juliaca</p>
        {actividad && <h1 className="mt-2 text-xl font-semibold text-white">{actividad.nombre}</h1>}
        {actividad?.lugar && <p className="mt-1 text-sm text-white/70">{actividad.lugar}</p>}
      </div>
      <div className="mx-auto -mt-10 max-w-md px-4">
        <div className="rounded-2xl bg-white p-6 shadow-xl">
          {!actividad ? (
            <p className="py-6 text-center text-slate-600">Este enlace no existe. Pide el QR actualizado al asesor de admisión.</p>
          ) : !actividad.activa ? (
            <p className="py-6 text-center text-slate-600">Este formulario ya cerró. Escríbenos por WhatsApp para recibir información de admisión.</p>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-slate-900">Déjanos tus datos</h2>
              <p className="mt-1 mb-5 text-sm text-slate-500">Te enviaremos por WhatsApp la información de carreras, costos y fechas de admisión.</p>
              <FormularioRegistro codigo={codigo} carreras={listaCarreras} colegio={actividad.tipo === 'colegio' ? actividad.lugar : null} />
            </>
          )}
        </div>
        <p className="mt-6 text-center text-xs text-slate-500">Universidad Peruana Unión · Oficina de Admisión</p>
      </div>
    </main>
  )
}
