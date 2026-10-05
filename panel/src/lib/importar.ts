// Lee alumnos pegados desde Excel / Google Sheets o subidos en CSV.
// Reconoce el separador (tabulador, punto y coma o coma) y los encabezados más comunes;
// si no hay encabezados, toma las columnas en orden: nombre, celular, DNI, carrera, colegio, grado.

export interface FilaImportar {
  nombre: string
  celular: string
  dni: string
  carrera: string
  colegio: string
  grado: string
}

export const COLUMNAS: (keyof FilaImportar)[] = ['nombre', 'celular', 'dni', 'carrera', 'colegio', 'grado']

export const filaVacia = (): FilaImportar => ({ nombre: '', celular: '', dni: '', carrera: '', colegio: '', grado: '' })

const SINONIMOS: Record<keyof FilaImportar, RegExp> = {
  nombre: /^(nombres?( y apellidos)?|apellidos? y nombres?|alumno|postulante|estudiante|nombre completo)$/,
  celular: /^(celular|telefono|tel|movil|whatsapp|numero|nro celular|cel)$/,
  dni: /^(dni|documento|doc|nro dni|n dni)$/,
  carrera: /^(carrera|carrera de interes|interes|programa|especialidad)$/,
  colegio: /^(colegio|institucion educativa|ie|i e|escuela)$/,
  grado: /^(grado|ano|año|nivel|grado y seccion)$/,
}

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

/** Separa una línea respetando comillas ("Pérez, Juan"). */
function partir(linea: string, sep: string): string[] {
  const celdas: string[] = []
  let actual = '', comillas = false
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]
    if (c === '"') {
      if (comillas && linea[i + 1] === '"') { actual += '"'; i++ } else comillas = !comillas
    } else if (c === sep && !comillas) { celdas.push(actual); actual = '' } else actual += c
  }
  celdas.push(actual)
  return celdas.map((x) => x.trim())
}

export function leerTabla(texto: string): FilaImportar[] {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  if (!lineas.length) return []
  const primera = lineas[0]
  const sep = primera.includes('\t') ? '\t' : (primera.split(';').length > primera.split(',').length ? ';' : ',')
  const tabla = lineas.map((l) => partir(l, sep))

  // ¿La primera fila son encabezados?
  const encabezados = tabla[0].map(normalizar)
  const mapa = new Map<number, keyof FilaImportar>()
  encabezados.forEach((h, i) => {
    const col = COLUMNAS.find((c) => SINONIMOS[c].test(h))
    if (col && ![...mapa.values()].includes(col)) mapa.set(i, col)
  })
  const conEncabezado = mapa.has(0) || mapa.size >= 2
  const datos = conEncabezado ? tabla.slice(1) : tabla
  if (!conEncabezado) COLUMNAS.forEach((c, i) => mapa.set(i, c))

  return datos
    .map((celdas) => {
      const fila = filaVacia()
      mapa.forEach((col, i) => { fila[col] = (celdas[i] ?? '').trim() })
      return fila
    })
    .filter((f) => COLUMNAS.some((c) => f[c]))
}

/** Revisión rápida en el navegador (la definitiva la hace la base). */
export function problemaFila(f: FilaImportar): string | null {
  if (!f.nombre.trim() && !f.celular.trim()) return null
  if (f.nombre.trim().length < 3) return 'Falta el nombre'
  const tel = f.celular.replace(/\D/g, '')
  if (!/^9\d{8}$/.test(tel) && !/^\d{10,15}$/.test(tel)) return 'Celular no válido'
  const dni = f.dni.replace(/\D/g, '')
  if (dni && !/^\d{8,12}$/.test(dni)) return 'DNI no válido'
  return null
}

export const PLANTILLA_CSV = '﻿Nombres y apellidos;Celular;DNI;Carrera;Colegio;Grado\nRosa Mamani Quispe;951234567;71234567;Enfermería;I.E. San Martín;5.° de secundaria\n'
