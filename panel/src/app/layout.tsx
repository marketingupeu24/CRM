import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'CRM Admisión', template: '%s · CRM Admisión' },
  description: 'Panel de asesores de la oficina de admisión',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
