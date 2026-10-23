import type { Metadata } from 'next'
import { FichaLead } from '../../_ficha/FichaLead'

// Chats: la conversación con la bandeja a la izquierda, dentro de la sección Chats (el menú marca "Chats").
export const metadata: Metadata = { title: 'Chat' }

export default async function PaginaChat(props: PageProps<'/chats/[id]'>) {
  return <FichaLead id={(await props.params).id} seccion="chats" />
}
