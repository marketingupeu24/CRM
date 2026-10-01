// Logo oficial de la Universidad Peruana Unión (upeu.edu.pe/wp-content/uploads/2026/05/).
// "completo": la "A" + UPeU + nombre; "isotipo": solo la "A".
// Variante "auto": azul en tema claro y blanca en tema oscuro; "blanco": siempre blanco (sobre fondos azules o fotos).
/* eslint-disable @next/next/no-img-element -- SVG livianos, no necesitan optimización de next/image */

interface Props {
  tipo?: 'completo' | 'isotipo'
  variante?: 'auto' | 'blanco'
  className?: string
}

export function LogoUpeu({ tipo = 'completo', variante = 'auto', className = 'h-10' }: Props) {
  const base = tipo === 'completo' ? '/marca/logo-upeu' : '/marca/isotipo-upeu'
  const alt = tipo === 'completo' ? 'Universidad Peruana Unión' : 'UPeU'
  if (variante === 'blanco') return <img src={`${base}-blanco.svg`} alt={alt} className={`w-auto ${className}`} />
  return (
    <>
      <img src={`${base}.svg`} alt={alt} className={`solo-claro w-auto ${className}`} />
      <img src={`${base}-blanco.svg`} alt={alt} className={`solo-oscuro w-auto ${className}`} />
    </>
  )
}
