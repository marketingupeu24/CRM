import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { cookies } from 'next/headers'
import { atributoTema, COOKIE_TEMA } from '@/lib/tema'
import './globals.css'

// Inter: tipografía muy legible en pantalla durante jornadas largas
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'CRM Admisión', template: '%s · CRM Admisión' },
  description: 'Panel de asesores de la oficina de admisión',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // El tema elegido viaja en una cookie: la página llega ya pintada con él
  const tema = (await cookies()).get(COOKIE_TEMA)?.value
  return (
    <html lang="es" className={inter.variable} data-theme={atributoTema(tema)}>
      <body>{children}</body>
    </html>
  )
}
