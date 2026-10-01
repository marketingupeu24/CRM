// Pruebas de las reglas de normalización. Uso: deno test supabase/functions/tests
import { elegir, normalizarDni, normalizarTelefono, valorResuelto } from '../_shared/dominio.ts'

function igual(real: unknown, esperado: unknown) {
  if (real !== esperado) throw new Error(`Se esperaba ${JSON.stringify(esperado)} y llegó ${JSON.stringify(real)}`)
}

Deno.test('normalizarTelefono', () => {
  igual(normalizarTelefono('+51 951-301-920'), '51951301920')
  igual(normalizarTelefono('951301920'), '51951301920')      // celular peruano sin código de país
  igual(normalizarTelefono(51951301920), '51951301920')
  igual(normalizarTelefono('34600111222'), '34600111222')    // extranjero se respeta
  igual(normalizarTelefono('abc'), null)
  igual(normalizarTelefono(''), null)
})

Deno.test('normalizarDni', () => {
  igual(normalizarDni('70123456'), '70123456')
  igual(normalizarDni(' 70.123.456 '), '70123456')
  igual(normalizarDni('001234567'), '001234567')             // carné de extranjería
  igual(normalizarDni('S/D-FORM-123456'), null)             // marcador del Apps Script
  igual(normalizarDni('S/D-WEB-654321'), null)
  igual(normalizarDni('123'), null)
  igual(normalizarDni(null), null)
})

Deno.test('variables de BuilderBot sin resolver se descartan', () => {
  igual(valorResuelto('{nombre}'), null)
  igual(valorResuelto('  Ana  '), 'Ana')
  igual(elegir(undefined, '', '{Nombres}', 'Ana', 'Otro'), 'Ana')
  igual(elegir(null, undefined), null)
})

Deno.test('botAtiendeLead: pausa del bot', async () => {
  const { botAtiendeLead, leadEnEtapaBot } = await import('../_shared/dominio.ts')
  const ahora = Date.parse('2026-09-30T15:00:00Z')
  igual(botAtiendeLead('lead_en_conversacion', null, ahora), true)
  igual(botAtiendeLead('lead_asignado', null, ahora), false)            // espera a su asesor
  igual(botAtiendeLead('lead_interesado', null, ahora), false)
  igual(botAtiendeLead('lead_contactado', '2026-09-30T18:00:00Z', ahora), false) // pausa vigente
  igual(botAtiendeLead('lead_contactado', '2026-09-30T14:00:00Z', ahora), true)  // pausa vencida
  igual(botAtiendeLead('lead_atendido', null, ahora), true)
  igual(botAtiendeLead('lead_matriculado', null, ahora), true)
  igual(botAtiendeLead('lead_nuevo', '2026-09-30T18:00:00Z', ahora), false)      // admin conversando con un lead sin asesor
  igual(leadEnEtapaBot('lead_matriculado'), false)
  igual(leadEnEtapaBot('lead_en_conversacion'), true)
})

Deno.test('normalizarOrigen', async () => {
  const { normalizarOrigen } = await import('../_shared/dominio.ts')
  igual(normalizarOrigen('fb'), 'Facebook')
  igual(normalizarOrigen('Por TikTok'), 'TikTok')
  igual(normalizarOrigen('me recomendó una amiga'), 'Recomendación')
  igual(normalizarOrigen('feria en mi colegio'), 'Feria / colegio')
  igual(normalizarOrigen('{refsUzHig_Origen}'), null)
  igual(normalizarOrigen('otro canal raro'), 'otro canal raro')
})
