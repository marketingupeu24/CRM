// Pruebas del prompt de Genesys (solo en el servidor).
// - Cobertura: ¿el prompt contiene los datos que la respuesta necesita? (sin IA)
// - Con IA: se le hace la pregunta a un modelo con el prompt real y se revisa la respuesta.
//   Clave en Vercel: OPENAI_API_KEY (BuilderBot suele usar modelos de OpenAI) o ANTHROPIC_API_KEY.
//   Modelo opcional: PRUEBAS_MODELO.
import 'server-only'

export interface Prueba {
  id: number
  pregunta: string
  debe_incluir: string[]
  no_debe_incluir: string[]
}

/** Frases que Genesys nunca debe decir, en cualquier pregunta (ver la regla "No inventes"). */
export const PROHIBIDAS_SIEMPRE = ['lamentablemente', 'no tengo información', 'parece que ha habido un malentendido', 'no cuento con']

/** Minúsculas, sin tildes ni asteriscos de negrita y con espacios simples: compara sin depender del formato. */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\*/g, '').replace(/\s+/g, ' ').toLowerCase()
}

export interface Evaluacion {
  ok: boolean
  faltan: string[]
  prohibidas: string[]
}

export function evaluar(respuesta: string, p: Prueba): Evaluacion {
  const r = normalizar(respuesta)
  const faltan = p.debe_incluir.filter((x) => !r.includes(normalizar(x)))
  const prohibidas = [...p.no_debe_incluir, ...PROHIBIDAS_SIEMPRE].filter((x) => r.includes(normalizar(x)))
  return { ok: !faltan.length && !prohibidas.length, faltan, prohibidas }
}

/** ¿El prompt tiene lo que la respuesta debe incluir? (lo prohibido solo se puede revisar con IA) */
export function cobertura(prompt: string, p: Prueba): string[] {
  const t = normalizar(prompt)
  return p.debe_incluir.filter((x) => !t.includes(normalizar(x)))
}

export function proveedorIA(): { nombre: 'openai' | 'anthropic'; modelo: string } | null {
  if (process.env.OPENAI_API_KEY) return { nombre: 'openai', modelo: process.env.PRUEBAS_MODELO || 'gpt-4o-mini' }
  if (process.env.ANTHROPIC_API_KEY) return { nombre: 'anthropic', modelo: process.env.PRUEBAS_MODELO || 'claude-sonnet-5-5' }
  return null
}

/** Respuesta del modelo a la pregunta, con el prompt como instrucciones y el contexto de un alumno nuevo. */
export async function responderConIA(prompt: string, pregunta: string, contexto: string): Promise<string> {
  const ia = proveedorIA()
  if (!ia) throw new Error('No hay clave de IA configurada.')
  if (ia.nombre === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: ia.modelo, temperature: 0.3, max_tokens: 700,
        messages: [{ role: 'system', content: `${prompt}\n\n${contexto}` }, { role: 'user', content: pregunta }],
      }),
      signal: AbortSignal.timeout(50_000),
    })
    if (!res.ok) throw new Error(`OpenAI respondió ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const datos = await res.json() as { choices?: { message?: { content?: string } }[] }
    return datos.choices?.[0]?.message?.content ?? ''
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: ia.modelo, max_tokens: 700, temperature: 0.3,
      // El prompt se repite en cada pregunta: se guarda en caché (más barato y rápido)
      system: [{ type: 'text', text: prompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `${contexto}\n\n${pregunta}` }],
    }),
    signal: AbortSignal.timeout(50_000),
  })
  if (!res.ok) throw new Error(`Anthropic respondió ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const datos = await res.json() as { content?: { type: string; text?: string }[] }
  return (datos.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('\n')
}
