import 'server-only'

// URL pública del panel (para los QR): la del dominio desde el que se abrió la página.
import { headers } from 'next/headers'

export async function urlBase(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'crm-admision.vercel.app'
  const protocolo = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${protocolo}://${host}`
}
