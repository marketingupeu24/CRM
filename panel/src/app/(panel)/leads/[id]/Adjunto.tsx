'use client'

// Archivo de un mensaje del chat:
// - URL pública del bucket "proformas" (proforma enviada por el asesor).
// - "adjuntos/<lead>/<archivo>": lo que envió el lead por WhatsApp (bucket privado, enlace firmado de 1 h).
import { useEffect, useState } from 'react'
import { crearClienteNavegador } from '@/lib/supabase/client'

const PREFIJO_PRIVADO = 'adjuntos/'

function tipoDe(ruta: string): 'imagen' | 'audio' | 'video' | 'pdf' | 'otro' {
  const ext = ruta.split('?')[0].split('.').pop()?.toLowerCase() ?? ''
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return 'imagen'
  if (['ogg', 'oga', 'opus', 'mp3', 'm4a', 'aac', 'wav'].includes(ext)) return 'audio'
  if (['mp4', 'mov', 'webm', '3gp'].includes(ext)) return 'video'
  if (ext === 'pdf') return 'pdf'
  return 'otro'
}

export function Adjunto({ ruta, propio }: { ruta: string; propio: boolean }) {
  const privado = ruta.startsWith(PREFIJO_PRIVADO)
  const [url, setUrl] = useState<string | null>(privado ? null : ruta)
  const [fallo, setFallo] = useState(false)

  useEffect(() => {
    if (!privado) return
    let vigente = true
    crearClienteNavegador().storage.from('adjuntos')
      .createSignedUrl(ruta.slice(PREFIJO_PRIVADO.length), 3600)
      .then(({ data }) => {
        if (!vigente) return
        if (data?.signedUrl) setUrl(data.signedUrl)
        else setFallo(true)
      })
    return () => { vigente = false }
  }, [ruta, privado])

  const tipo = tipoDe(ruta)
  const enlace = 'mb-1.5 flex items-center gap-2 rounded-md bg-white/70 px-2 py-1.5 text-xs font-medium text-marca-700 hover:underline'
  if (fallo) return <p className="mb-1.5 text-xs text-slate-500">No se pudo cargar el archivo.</p>
  if (!url) return <p className="mb-1.5 text-xs text-slate-500">Cargando archivo…</p>

  if (tipo === 'imagen') {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="mb-1.5 block">
        {/* eslint-disable-next-line @next/next/no-img-element -- archivo de Storage (URL pública o firmada) */}
        <img src={url} alt={propio ? 'Imagen enviada al lead' : 'Imagen enviada por el lead'} className="max-h-64 rounded-md border border-slate-200" loading="lazy" />
      </a>
    )
  }
  if (tipo === 'audio') return <audio controls preload="metadata" src={url} className="mb-1.5 h-10 w-64 max-w-full" />
  if (tipo === 'video') return <video controls preload="metadata" src={url} className="mb-1.5 max-h-64 rounded-md" />
  return (
    <a href={url} target="_blank" rel="noreferrer" className={enlace}>
      {tipo === 'pdf' && ruta.includes('/proformas/') ? '📄 Proforma (PDF)' : tipo === 'pdf' ? '📄 Abrir PDF' : '⬇️ Descargar archivo'}
    </a>
  )
}
