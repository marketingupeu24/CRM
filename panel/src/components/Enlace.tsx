// Link sin "prefetch": Next pedía por adelantado al servidor cada enlace visible (menú, filas de leads,
// tarjetas del kanban…) y lo repetía tras cada actualización en vivo. Eso gastaba el procesador de Vercel
// (el plan gratis se pausó el 30/10). La página se pide recién al hacer clic.
import NextLink, { type LinkProps } from 'next/link'

export default function Link<RouteType>(props: LinkProps<RouteType>) {
  return <NextLink prefetch={false} {...props} />
}
