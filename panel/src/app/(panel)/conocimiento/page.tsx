import { redirect } from 'next/navigation'

/** La base de conocimiento ahora es "Prompt de Genesys" (por partes y fichas). */
export default async function PaginaConocimiento(props: PageProps<'/conocimiento'>) {
  const sp = await props.searchParams
  const nuevo = typeof sp.nuevo === 'string' ? sp.nuevo : ''
  redirect(nuevo ? `/genesys?parte=faq&nuevo=${encodeURIComponent(nuevo)}` : '/genesys')
}
