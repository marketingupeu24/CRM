import 'server-only'

// Promoción EXPLORE 2026: el DNI debe estar en la lista de participantes.
// La lista viene del HTML original como hashes PBKDF2 (los DNIs no se guardan en claro)
// y se consulta solo en el servidor: ya no se descarga en el navegador de cada asesor.
import { pbkdf2Sync } from 'node:crypto'
import lista from './explore-2026.json'

const HASHES = new Set<string>(lista.hashes)

/** Igual que dniHash() del original: sin ceros a la izquierda, PBKDF2-SHA256, 96 bits en hex. */
export function dniEnExplore(dni: string): boolean {
  const d = String(dni).replace(/\D/g, '').replace(/^0+/, '')
  if (d.length < 6) return false
  const hash = pbkdf2Sync(d, lista.salt, lista.iteraciones, 12, 'sha256').toString('hex')
  return HASHES.has(hash)
}
