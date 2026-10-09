// Service worker del CRM: muestra las notificaciones push (mensaje nuevo, lead asignado,
// próxima acción) aunque el CRM esté cerrado, y abre la página del aviso al tocarlo.
// No guarda páginas en caché: el CRM siempre muestra datos al día.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (evento) => evento.waitUntil(self.clients.claim()))

self.addEventListener('push', (evento) => {
  let datos = {}
  try { datos = evento.data ? evento.data.json() : {} } catch { datos = { cuerpo: evento.data ? evento.data.text() : '' } }
  const titulo = datos.titulo || 'CRM Admisión'
  evento.waitUntil(self.registration.showNotification(titulo, {
    body: datos.cuerpo || '',
    icon: '/iconos/icono-192.png',
    badge: '/iconos/insignia-96.png',
    tag: datos.etiqueta || undefined,
    renotify: Boolean(datos.etiqueta),
    data: { url: datos.url || '/pendientes' },
  }))
})

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close()
  const url = new URL(evento.notification.data?.url || '/pendientes', self.location.origin).href
  evento.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    // Si el CRM ya está abierto, se usa esa ventana
    for (const v of ventanas) {
      if (new URL(v.url).origin === self.location.origin && 'focus' in v) {
        await v.focus()
        if ('navigate' in v) await v.navigate(url)
        return
      }
    }
    await self.clients.openWindow(url)
  })())
})
