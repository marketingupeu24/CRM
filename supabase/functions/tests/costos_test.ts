// Pruebas del cálculo de proformas (packages/db/src/costos.ts).
// Los montos esperados salen del HTML original costos/Proformas_Admision_2027-1.html.
import { calcularProforma, carreraParecida, textoWhatsApp } from '../../../packages/db/src/costos.ts'

function igual<T>(real: T, esperado: T, msg = '') {
  if (JSON.stringify(real) !== JSON.stringify(esperado)) throw new Error(`${msg} Se esperaba ${JSON.stringify(esperado)} y llegó ${JSON.stringify(real)}`)
}

Deno.test('Administración Juliaca con la promoción del 25 % en 4 cuotas', () => {
  const k = calcularProforma({ modalidad: 'PRES', campus: 'JUL', carrera: 'Administración', beneficio: 'PROMO', pago: 'cuotas' })
  igual([k.ens, k.desc, k.con, k.n, k.cuota, k.inicial, k.total], [3135, 783.75, 2351.25, 4, 587.81, 1187.81, 2951.25])
})

Deno.test('Al contado: 5 % adicional sobre la enseñanza ya descontada', () => {
  const k = calcularProforma({ modalidad: 'PRES', campus: 'JUL', carrera: 'Administración', beneficio: 'PROMO', pago: 'contado' })
  igual([k.desc5, k.neto, k.inicial], [117.56, 2233.69, 2833.69])
})

Deno.test('Medicina Humana en Juliaca: matrícula gratis, 5 cuotas y otros cobros', () => {
  const k = calcularProforma({ modalidad: 'PRES', campus: 'JUL', carrera: 'Medicina Humana', beneficio: 'NONE', pago: 'cuotas' })
  igual([k.ens, k.descMat, k.matNeta, k.n, k.otrosT], [15600, 600, 0, 5, 300])
})

Deno.test('Beca 1er puesto fuera de Lima: tope de S/ 3,000', () => {
  const k = calcularProforma({ modalidad: 'PRES', campus: 'JUL', carrera: 'Enfermería', beneficio: 'B1CA', pago: 'cuotas' })
  igual(k.desc, 3000)
})

Deno.test('Descuentos institucionales en cascada (máximo 2)', () => {
  const k = calcularProforma({ modalidad: 'PRES', campus: 'JUL', carrera: 'Enfermería', beneficio: 'INST', institucionales: ['EGR', 'HER', 'ASO'], pago: 'cuotas' })
  igual(k.descs.map((d) => d.v), [399, 287.28])
})

Deno.test('EXPLORE sin DNI verificado vuelve a la promoción normal', () => {
  const k = calcularProforma({ modalidad: 'PRES', campus: 'JUL', carrera: 'Enfermería', beneficio: 'EXPLORE', pago: 'cuotas' })
  igual(k.benef, 'PROMO')
})

Deno.test('A distancia: sede Lima, sin beneficios', () => {
  const k = calcularProforma({ modalidad: 'EAD', campus: 'JUL', carrera: 'Administración', beneficio: 'PROMO', pago: 'cuotas' })
  igual([k.cp.corto, k.benef, k.mat, k.ens], ['Lima', 'NONE', 300, 2850])
})

Deno.test('carreraParecida reconoce lo que escribe el lead', () => {
  igual(carreraParecida('enfermeria', 'PRES', 'JUL'), 'Enfermería')
  igual(carreraParecida('Ing. de sistemas', 'PRES', 'JUL'), 'Ingeniería de Sistemas')
  igual(carreraParecida('educación inicial', 'PRES', 'JUL'), 'Educación Inicial y Puericultura')
  igual(carreraParecida(null, 'PRES', 'JUL'), null)
})

Deno.test('El mensaje de WhatsApp lleva el total y la firma del asesor', () => {
  const k = calcularProforma({ modalidad: 'PRES', campus: 'JUL', carrera: 'Administración', beneficio: 'PROMO', pago: 'cuotas' })
  const t = textoWhatsApp(k, { nombre: 'Ana', asesor: 'Cris' })
  if (!/TOTAL DEL CICLO\s+S\/\s+2,951\.25/.test(t) || !t.includes('*Cris*')) throw new Error(t)
})
