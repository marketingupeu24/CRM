'use client'

// Plegar el menú lateral a solo íconos (más espacio para el chat y las tablas). Se recuerda en este navegador.
import { useRouter } from 'next/navigation'
import { COOKIE_MENU } from '@/lib/tema'

export function AlternarMenu({ compacto }: { compacto: boolean }) {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => {
        document.cookie = `${COOKIE_MENU}=${compacto ? '0' : '1'}; path=/; max-age=31536000; samesite=lax`
        router.refresh()
      }}
      title={compacto ? 'Mostrar el menú completo' : 'Plegar el menú (solo íconos)'}
      aria-label={compacto ? 'Mostrar el menú completo' : 'Plegar el menú'}
      className={`-mt-4 mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-lateral-suave transition hover:bg-lateral-hover hover:text-lateral-texto ${compacto ? 'justify-center' : ''}`}
    >
      <span aria-hidden className="text-base">{compacto ? '»' : '«'}</span>
      {!compacto && 'Plegar menú'}
    </button>
  )
}
