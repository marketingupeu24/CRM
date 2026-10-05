'use server'

// Registro rápido de fichas (uno por uno). Usa importar_leads() con una fila:
// sin duplicados (DNI o celular), asignación pareja y avisos juntados en un resumen cada 3 minutos.
import { mensajeError } from '@/lib/formato'
import { obtenerSesion, exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'

export interface Ficha {
  nombre: string
  celular: string
  dni: string
  carrera: string
  colegio: string
  grado: string
  observacion: string
}

export interface DatosTanda {
  actividadId: string
  /** "" = a mi nombre · "repartir" = por igual entre los asesores · uuid = un asesor en particular */
  asesorId: string
  origen: string
  convocatoria: string
}

export interface ResultadoFicha {
  error?: string
  estado?: 'nuevo' | 'actualizado' | 'omitido' | 'error'
  mensaje?: string
  leadId?: string | null
}

export async function registrarFicha(ficha: Ficha, tanda: DatosTanda): Promise<ResultadoFicha> {
  const { perfil } = await exigirPermiso('registrar')
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc('importar_leads', {
    p_filas: [{ nombre: ficha.nombre, celular: ficha.celular, dni: ficha.dni, carrera: ficha.carrera, colegio: ficha.colegio, grado: ficha.grado }],
    p_actividad_id: /^\d+$/.test(tanda.actividadId) ? Number(tanda.actividadId) : undefined,
    p_asesor_id: /^[0-9a-f-]{36}$/i.test(tanda.asesorId) ? tanda.asesorId : undefined,
    p_origen: tanda.origen || undefined,
    p_aviso_diferido: true,
    p_repartir: tanda.asesorId === 'repartir',
  })
  if (error) return { error: mensajeError(error) }
  const r = (data ?? [])[0]
  if (!r) return { error: 'No se pudo registrar.' }

  // Observación y convocatoria (opcionales) sobre el lead recién registrado
  if (r.lead_id && (ficha.observacion.trim() || tanda.convocatoria.trim())) {
    if (tanda.convocatoria.trim()) {
      await supabase.from('leads').update({ convocatoria: tanda.convocatoria.trim().slice(0, 20) }).eq('id', r.lead_id)
    }
    if (ficha.observacion.trim()) {
      await supabase.from('lead_interacciones').insert({
        lead_id: r.lead_id, tipo: 'nota_asesor', contenido: ficha.observacion.trim().slice(0, 2000), autor_id: perfil.id,
      })
    }
  }
  // Sin revalidatePath: recargar la página tras cada ficha la hacía lenta (y bloqueaba el Enter);
  // la lista de leads es dinámica y se ve actualizada al abrirla.
  return { estado: r.estado as ResultadoFicha['estado'], mensaje: r.mensaje, leadId: r.lead_id }
}

export interface Existente {
  por: 'dni' | 'celular'
  lead_id: string | null
  nombre: string | null
  asesor: string | null
  de_otro_asesor: boolean
  en_papelera: boolean
}

/** ¿Ya está registrado este celular o DNI? (aviso mientras se escribe la ficha) */
export async function buscarExistente(celular: string, dni: string): Promise<Existente | null> {
  await obtenerSesion()
  const supabase = await crearClienteServidor()
  const { data } = await supabase.rpc('lead_existente', { p_telefono: celular || undefined, p_dni: dni || undefined })
  return (data as unknown as Existente | null) ?? null
}
