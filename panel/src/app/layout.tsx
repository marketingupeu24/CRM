import type { Metadata } from 'next'
import { Outfit } from 'next/font/google'
import { cookies } from 'next/headers'
import { atributoTema, COOKIE_TEMA } from '@/lib/tema'
import './globals.css'

// Outfit: tipografía de TailAdmin, limpia y legible en jornadas largas
const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'CRM Admisión', template: '%s · CRM Admisión' },
  description: 'Panel de asesores de la oficina de admisión',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // El tema elegido viaja en una cookie: la página llega ya pintada con él
  const tema = (await cookies()).get(COOKIE_TEMA)?.value
  return (
    <html lang="es" className={outfit.variable} data-theme={atributoTema(tema)}>
      <body>{children}</body>
    </html>
  )
}
