'use server'

// Proformas: el cálculo se repite en el servidor (no se confía en los montos del navegador)
// y la promoción EXPLORE se verifica aquí con la lista de DNIs.
import { revalidatePath } from 'next/cache'
import { calcularProforma, numeroProforma, textoWhatsApp, type OpcionesProforma } from '@crm/db'
import { dniEnExplore } from '@/lib/explore'
import { mensajeError } from '@/lib/formato'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'

export async function verificarExplore(dni: string): Promise<boolean> {
  await exigirPermiso('costos')
  return dniEnExplore(dni)
}

export interface DatosProforma {
  opciones: OpcionesProforma
  nombre: string
  dni: string
  leadId: string | null
  vence: string | null
}

export interface ProformaRegistrada {
  error?: string
  id?: number
  numero?: string
  texto?: string
}

/** Guarda la proforma (resumen + datos) y devuelve el número y el mensaje de WhatsApp. */
export async function registrarProforma(d: DatosProforma): Promise<ProformaRegistrada> {
  const { perfil } = await exigirPermiso('costos')
  const verificado = d.opciones.beneficio === 'EXPLORE' && dniEnExplore(d.dni)
  const k = calcularProforma({ ...d.opciones, exploreVerificado: verificado })
  const numero = numeroProforma(k)
  const vence = d.vence && /^\d{4}-\d{2}-\d{2}$/.test(d.vence) ? new Date(`${d.vence}T12:00:00-05:00`) : null
  const texto = textoWhatsApp(k, { nombre: d.nombre, asesor: perfil.nombre, vence })

  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.from('proformas').insert({
    numero,
    lead_id: d.leadId && /^[0-9a-f-]{36}$/i.test(d.leadId) ? d.leadId : null,
    carrera: k.name,
    campus: k.cp.corto,
    modalidad: k.modal,
    beneficio: k.benef,
    pago: k.contado ? 'contado' : 'cuotas',
    total: k.total,
    inicial: k.inicial,
    cuota: k.cuota,
    cuotas: k.contado ? 1 : k.n,
    ahorro: k.ahorro,
    datos: JSON.parse(JSON.stringify({ opciones: k.opciones, nombre: d.nombre.trim(), dni: d.dni.trim(), vence: d.vence, descuentos: k.descs })),
  }).select('id').single()
  if (error) return { error: mensajeError(error) }
  return { id: data.id, numero, texto }
}

/** Después de enviarla por el chat: guarda el archivo y la hora de envío. */
export async function marcarEnviada(id: number, archivoUrl: string | null, leadId: string | null): Promise<void> {
  await exigirPermiso('costos')
  const supabase = await crearClienteServidor()
  await supabase.from('proformas').update({ archivo_url: archivoUrl, enviada_at: new Date().toISOString() }).eq('id', id)
  if (leadId) revalidatePath(`/leads/${leadId}`)
}
