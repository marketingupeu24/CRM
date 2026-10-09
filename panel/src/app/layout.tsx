import type { Metadata, Viewport } from 'next'
import { Outfit } from 'next/font/google'
import { cookies } from 'next/headers'
import { atributoTema, COOKIE_TEMA } from '@/lib/tema'
import './globals.css'

// Outfit: tipografía de TailAdmin, limpia y legible en jornadas largas
const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'CRM Admisión UPeU', template: '%s · CRM Admisión UPeU' },
  description: 'Panel de asesores de la oficina de admisión de la Universidad Peruana Unión, campus Juliaca',
  applicationName: 'CRM Admisión UPeU',
  // App instalable (manifest en app/manifest.ts): modo app en iPhone. Los íconos de la pestaña y de
  // iPhone salen de app/icon.png, app/apple-icon.png y app/favicon.ico (no se definen aquí: los reemplazaría)
  appleWebApp: { capable: true, title: 'CRM Admisión', statusBarStyle: 'default' },
}

export const viewport: Viewport = { themeColor: '#003865' }

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // El tema elegido viaja en una cookie: la página llega ya pintada con él
  const tema = (await cookies()).get(COOKIE_TEMA)?.value
  return (
    <html lang="es" className={outfit.variable} data-theme={atributoTema(tema)}>
      <body>{children}</body>
    </html>
  )
}
