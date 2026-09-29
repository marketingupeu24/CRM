'use server'

// Administración de asesores y cuentas del panel (solo admin).
// Las cuentas se crean con funciones de la base de datos (security definer que
// verifican es_admin), así el panel nunca necesita la service_role key.
import { revalidatePath } from 'next/cache'
import { mensajeError } from '@/lib/formato'
import { exigirAdmin } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'

export interface Resultado {
  error?: string
  ok?: string
}

function normalizarTelefono(valor: string): string | null {
  const digitos = valor.replace(/\D/g, '')
  if (!digitos) return null
  return /^9\d{8}$/.test(digitos) ? `51${digitos}` : digitos
}

function listaCarreras(valor: string): string[] {
  return valor.split(',').map((c) => c.trim()).filter(Boolean)
}

/** Nuevo asesor (y opcionalmente su cuenta del panel). */
export async function crearAsesor(_previo: Resultado, formData: FormData): Promise<Resultado> {
  await exigirAdmin()
  const texto = (campo: string) => String(formData.get(campo) ?? '').trim()
  const nombre = texto('nombre')
  const rol = texto('rol') === 'admin' ? 'admin' : 'asesor'
  const telefono = normalizarTelefono(texto('telefono'))
  const usuario = texto('usuario').toLowerCase()
  const clave = texto('clave')

  if (!nombre) return { error: 'El nombre es obligatorio.' }
  if (rol === 'asesor' && !telefono) return { error: 'El asesor necesita un celular para recibir los avisos de leads.' }
  if (usuario && clave.length < 6) return { error: 'La contraseña debe tener al menos 6 caracteres.' }

  const supabase = await crearClienteServidor()
  const { data: asesor, error } = await supabase.from('asesores')
    .insert({ nombre, telefono, rol, carreras: listaCarreras(texto('carreras')) })
    .select('id').single()
  if (error) return { error: mensajeError(error) }

  if (usuario) {
    const { error: errorCuenta } = await supabase.rpc('crear_usuario_panel', {
      p_asesor_id: asesor.id, p_usuario: usuario, p_clave: clave, p_debe_cambiar: formData.get('debe_cambiar') === 'on',
    })
    if (errorCuenta) {
      revalidatePath('/usuarios')
      return { error: `Asesor creado, pero no su cuenta: ${mensajeError(errorCuenta)}` }
    }
  }
  revalidatePath('/usuarios')
  return { ok: usuario ? `${nombre} creado con el usuario ${usuario}.` : `${nombre} creado.` }
}

/** Cuenta del panel para un asesor que aún no la tiene. */
export async function crearCuenta(asesorId: string, _previo: Resultado, formData: FormData): Promise<Resultado> {
  await exigirAdmin()
  const usuario = String(formData.get('usuario') ?? '').trim().toLowerCase()
  const clave = String(formData.get('clave') ?? '')

  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('crear_usuario_panel', {
    p_asesor_id: asesorId, p_usuario: usuario, p_clave: clave, p_debe_cambiar: formData.get('debe_cambiar') === 'on',
  })
  if (error) return { error: mensajeError(error) }
  revalidatePath('/usuarios')
  return { ok: `Usuario ${usuario} creado.` }
}

export async function restablecerClave(asesorId: string, _previo: Resultado, formData: FormData): Promise<Resultado> {
  await exigirAdmin()
  const clave = String(formData.get('clave') ?? '')

  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('restablecer_clave_usuario', {
    p_asesor_id: asesorId, p_clave: clave, p_debe_cambiar: formData.get('debe_cambiar') === 'on',
  })
  if (error) return { error: mensajeError(error) }
  return { ok: 'Contraseña restablecida.' }
}

/** Celular y carreras exclusivas (vacío = asesor general de la rotación). */
export async function actualizarAsesor(asesorId: string, _previo: Resultado, formData: FormData): Promise<Resultado> {
  await exigirAdmin()
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('asesores').update({
    telefono: normalizarTelefono(String(formData.get('telefono') ?? '')),
    carreras: listaCarreras(String(formData.get('carreras') ?? '')),
  }).eq('id', asesorId)
  if (error) return { error: mensajeError(error) }
  revalidatePath('/usuarios')
  return { ok: 'Datos guardados.' }
}

/** Un asesor inactivo no recibe leads nuevos (sigue viendo los suyos). */
export async function cambiarActivo(asesorId: string, activo: boolean): Promise<Resultado> {
  await exigirAdmin()
  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('asesores').update({ activo }).eq('id', asesorId)
  if (error) return { error: mensajeError(error) }
  revalidatePath('/usuarios')
  return { ok: activo ? 'Asesor activado.' : 'Asesor desactivado.' }
}
