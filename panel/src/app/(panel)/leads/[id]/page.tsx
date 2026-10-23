import type { Metadata } from 'next'
import { FichaLead } from '../../_ficha/FichaLead'

export const metadata: Metadata = { title: 'Ficha del lead' }

export default async function PaginaFicha(props: PageProps<'/leads/[id]'>) {
  return <FichaLead id={(await props.params).id} seccion="leads" />
}
