import 'server-only'
// Lista de UBIGEO para las páginas del servidor (en el navegador se usa cargarUbigeos()).
import datos from '../../public/ubigeos.json'
import type { FilaUbigeo, Ubigeos } from './ubigeos'

export const FILAS_UBIGEO = datos as FilaUbigeo[]
export const UBIGEOS: Ubigeos = new Map(FILAS_UBIGEO)
