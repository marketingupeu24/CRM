// La app instalable del CRM (PWA): en el celular se agrega a la pantalla de inicio y recibe
// notificaciones (en iPhone, solo instalada: Compartir → Agregar a inicio).
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CRM Admisión UPeU',
    short_name: 'CRM Admisión',
    description: 'Leads, chats y seguimiento de Admisión de la Universidad Peruana Unión – campus Juliaca',
    start_url: '/pendientes',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#003865',
    lang: 'es-PE',
    icons: [
      { src: '/iconos/icono-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/iconos/icono-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/iconos/icono-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
