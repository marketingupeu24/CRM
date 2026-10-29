'use client'

/** Descarga la tabla como CSV (Excel lo abre con tildes gracias al BOM). */
export function BotonCsv({ filas, nombreArchivo }: { filas: string[][]; nombreArchivo: string }) {
  const descargar = () => {
    const celda = (v: string) => `"${v.replace(/"/g, '""')}"`
    const csv = filas.map((r) => r.map(celda).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const nombre = nombreArchivo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').slice(0, 60)
    const a = Object.assign(document.createElement('a'), { href: url, download: `${nombre}.csv` })
    a.click(); URL.revokeObjectURL(url)
  }
  return <button type="button" onClick={descargar} className="boton-secundario">⬇ Descargar CSV</button>
}
