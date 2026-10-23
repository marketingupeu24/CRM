import { assertEquals as igual } from 'jsr:@std/assert'
import { estadosDeEntrega, wamidDe } from '../_shared/entrega.ts'

Deno.test('wamidDe: id del eco de un mensaje enviado', () => {
  igual(wamidDe({ respMessage: { messages: [{ id: 'wamid.ABC=' }] } }), 'wamid.ABC=')
  igual(wamidDe({ respMessage: {} }), null)
})

Deno.test('estadosDeEntrega: formato de Meta, donde sea que venga', () => {
  const meta = { entry: [{ changes: [{ value: { statuses: [
    { id: 'wamid.X1', status: 'delivered', timestamp: '1792700000' },
    { id: 'wamid.X2', status: 'failed', timestamp: '1792700001', errors: [{ code: 131047, title: 'Re-engagement message' }] },
  ] } }] }] }
  const e = estadosDeEntrega(meta)
  igual(e.map((x) => [x.wamid, x.estado]), [['wamid.X1', 'delivered'], ['wamid.X2', 'failed']])
  igual(e[1]!.error, '131047 · Re-engagement message')
  // BuilderBot podría ponerlo en "data"
  igual(estadosDeEntrega({ eventName: 'message.status', data: { id: 'wamid.X3', status: 'read' } })[0]!.estado, 'read')
  // Un mensaje entrante o el eco de uno enviado no son avisos de estado
  igual(estadosDeEntrega({ data: { raw: { id: 'wamid.Y' }, respMessage: { messages: [{ id: 'wamid.Z' }] } } }), [])
})
