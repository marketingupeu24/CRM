// Enlace corto del QR personal de un asesor (atención presencial), sin iniciar sesión.
// Abre WhatsApp con el número de Genesys y un mensaje listo que identifica al asesor:
// el interesado escribe primero y, al llegar el mensaje, el lead queda asignado a ese asesor.
// El número se lee al escanear: si cambia, los QR impresos siguen sirviendo.
import { NextResponse, type NextRequest } from 'next/server'
import { crearClienteServidor } from '@/lib/supabase/server'

function pagina(titulo: string, texto: string, estado: number) {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo}</title><style>body{font-family:system-ui,sans-serif;background:#f1f5f9;color:#0f172a;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}
main{background:#fff;border-radius:16px;padding:28px;max-width:360px;text-align:center;box-shadow:0 4px 20px #0001}h1{font-size:20px;color:#003865}p{color:#475569}</style></head>
<body><main><h1>${titulo}</h1><p>${texto}</p></main></body></html>`
  return new NextResponse(html, { status: estado, headers: { 'content-type': 'text/html; charset=utf-8' } })
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await ctx.params
  if (!/^([0-9a-f]{6}|[0-9a-f]{8})$/i.test(codigo)) return pagina('QR no válido', 'Pide a tu asesor(a) que te muestre su QR de nuevo.', 404)

  const supabase = await crearClienteServidor()

  // QR por persona (8 caracteres): el asesor ya escribió sus datos
  if (codigo.length === 8) {
    const { data: pre } = await supabase.rpc('prerregistro_publico', { p_codigo: codigo })
    const p = pre as { codigo: string; persona: string; asesor: string; whatsapp: string | null } | null
    if (!p) return pagina('QR vencido', 'Este QR ya no está activo. Pide a tu asesor(a) que genere uno nuevo.', 404)
    const numeroP = (p.whatsapp ?? '').replace(/\D/g, '')
    if (!numeroP) return pagina('Escríbenos pronto', 'El WhatsApp de Admisión aún no está configurado. Avísale a tu asesor(a).', 503)
    const texto = `Hola 👋 Soy ${p.persona}, me atendió ${p.asesor} en Admisión UPeU. (Cód. P-${p.codigo})`
    return NextResponse.redirect(`https://wa.me/${numeroP}?text=${encodeURIComponent(texto)}`, 302)
  }

  const { data } = await supabase.rpc('qr_asesor_publico', { p_codigo: codigo })
  const r = data as { codigo: string; nombre: string; whatsapp: string | null } | null
  if (!r) return pagina('QR no válido', 'Este QR ya no está activo. Pide a tu asesor(a) uno nuevo.', 404)
  const numero = (r.whatsapp ?? '').replace(/\D/g, '')
  if (!numero) return pagina('Escríbenos pronto', 'El WhatsApp de Admisión aún no está configurado. Avísale a tu asesor(a).', 503)

  const mensaje = `Hola 👋 Me atendió ${r.nombre} en Admisión UPeU y quiero más información. (Cód. A-${r.codigo})`
  return NextResponse.redirect(`https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`, 302)
}
