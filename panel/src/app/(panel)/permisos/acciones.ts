'use server'

// Permisos por usuario (solo super admin; la base también lo exige en guardar_permisos).
import { revalidatePath } from 'next/cache'
import { CLAVES_MODULOS, type Modulo } from '@crm/db'
import { mensajeError } from '@/lib/formato'
import { exigirSuperadmin } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'

export interface Resultado {
  error?: string
  ok?: string
}

export async function guardarPermisos(asesorId: string, permisos: string[], superadmin: boolean): Promise<Resultado> {
  const { perfil } = await exigirSuperadmin()
  if (asesorId === perfil.id && !superadmin) return { error: 'No puedes quitarte tu propio acceso de super admin.' }
  const validos = permisos.filter((p): p is Modulo => (CLAVES_MODULOS as readonly string[]).includes(p))

  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('guardar_permisos', { p_asesor_id: asesorId, p_permisos: validos, p_superadmin: superadmin })
  if (error) return { error: mensajeError(error) }
  revalidatePath('/permisos')
  revalidatePath('/usuarios')
  return { ok: 'Permisos guardados. El usuario los verá al recargar el panel.' }
}
