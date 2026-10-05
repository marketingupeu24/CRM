import Link from 'next/link'

/** Pestañas de "Registrar lead": uno por uno o varios alumnos a la vez. */
export function PestanasRegistro({ actual }: { actual: 'uno' | 'varios' }) {
  const estilo = (activa: boolean) =>
    `rounded-md px-4 py-2 text-sm font-medium transition ${activa ? 'bg-superficie text-marca-700 shadow-theme-xs' : 'text-slate-600 hover:text-slate-900'}`
  return (
    <nav aria-label="Forma de registro" className="inline-flex rounded-lg bg-slate-100 p-1">
      <Link href="/leads/nuevo" aria-current={actual === 'uno' ? 'page' : undefined} className={estilo(actual === 'uno')}>👤 Un alumno</Link>
      <Link href="/leads/importar" aria-current={actual === 'varios' ? 'page' : undefined} className={estilo(actual === 'varios')}>👥 Varios alumnos</Link>
    </nav>
  )
}
