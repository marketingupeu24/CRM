import { assertEquals } from 'jsr:@std/assert'
import { proximaAtencion, textoProximaAtencion } from '../_shared/dominio.ts'

const t = (s: string) => new Date(s)

Deno.test('en horario no hay próxima atención', () => {
  assertEquals(proximaAtencion(t('2026-10-06T10:00:00-05:00')), null)
  assertEquals(proximaAtencion(t('2026-10-09T12:59:00-05:00')), null)
})

Deno.test('sábado: el lunes a las 8:00 am', () => {
  const ahora = t('2026-10-10T10:00:00-05:00')
  const p = proximaAtencion(ahora)!
  assertEquals(p.toISOString(), t('2026-10-12T08:00:00-05:00').toISOString())
  assertEquals(textoProximaAtencion(p, ahora), 'el lunes a las 8:00 am')
})

Deno.test('al mediodía: hoy a las 2:00 pm', () => {
  const ahora = t('2026-10-06T12:45:00-05:00')
  const p = proximaAtencion(ahora)!
  assertEquals(textoProximaAtencion(p, ahora), 'hoy a las 2:00 pm')
})

Deno.test('de noche: mañana a las 8:00 am; viernes tarde: el lunes', () => {
  const noche = t('2026-10-06T21:00:00-05:00')
  assertEquals(textoProximaAtencion(proximaAtencion(noche)!, noche), 'mañana a las 8:00 am')
  const madrugada = t('2026-10-07T06:00:00-05:00')
  assertEquals(textoProximaAtencion(proximaAtencion(madrugada)!, madrugada), 'hoy a las 8:00 am')
  const viernes = t('2026-10-09T15:00:00-05:00')
  assertEquals(textoProximaAtencion(proximaAtencion(viernes)!, viernes), 'el lunes a las 8:00 am')
})

Deno.test('feriado: el jueves 8 de octubre no se atiende', () => {
  const feriados = new Set(['2026-10-08'])
  const miercolesNoche = t('2026-10-07T20:00:00-05:00')
  const p = proximaAtencion(miercolesNoche, feriados)!
  assertEquals(p.toISOString(), t('2026-10-09T08:00:00-05:00').toISOString())
  assertEquals(textoProximaAtencion(p, miercolesNoche), 'el viernes a las 8:00 am')
  assertEquals(proximaAtencion(t('2026-10-08T10:00:00-05:00'), feriados)?.toISOString(), t('2026-10-09T08:00:00-05:00').toISOString())
})
