// Funciones principales del panel (solo LECTURA: navegan, abren paneles y escriben sin enviar nada).
// Requiere E2E_USUARIO y E2E_CLAVE (un super admin, para ver todas las secciones).
//   E2E_URL=https://crm-admision.vercel.app E2E_USUARIO=... E2E_CLAVE=... npm run test:e2e -w panel
import { expect, test, type Page } from '@playwright/test'

const USUARIO = process.env.E2E_USUARIO
const CLAVE = process.env.E2E_CLAVE
test.skip(!USUARIO || !CLAVE, 'Falta E2E_USUARIO / E2E_CLAVE')
test.describe.configure({ mode: 'serial' })

async function ingresar(page: Page) {
  await page.goto('/login')
  await page.fill('#usuario', USUARIO!)
  await page.fill('#clave', CLAVE!)
  await page.click('button[type=submit]')
  await page.waitForSelector('nav[aria-label="Menú principal"]', { timeout: 60_000 })
}

const menuActivo = (page: Page) => page.locator('aside a[aria-current="page"]').first()

// Ninguna prueba debe dejar errores de JavaScript en la página
let errores: string[] = []
test.beforeEach(async ({ page }) => {
  errores = []
  page.on('pageerror', (e) => errores.push(e.message))
  await ingresar(page)
})
test.afterEach(() => {
  expect(errores).toEqual([])
})

test('Chats abre directo la última conversación, sin mostrar antes la lista', async ({ page }) => {
  await page.goto('/dashboard')
  await page.evaluate(() => {
    const w = window as Window & { vioLista?: boolean }
    w.vioLista = false
    setInterval(() => { if (document.querySelector('main h1')?.textContent === 'Chats') w.vioLista = true }, 10)
  })
  await page.locator('aside').getByRole('link', { name: /Chats/ }).first().click()
  await page.waitForURL(/\/chats\/[0-9a-f-]{36}/)
  expect(await page.evaluate(() => (window as Window & { vioLista?: boolean }).vioLista)).toBe(false)
  await expect(menuActivo(page)).toContainText('Chats')
  // La bandeja abre las conversaciones dentro de Chats
  const enlaces = await page.getByRole('region', { name: 'Conversaciones' }).locator('a').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''))
  expect(enlaces.length).toBeGreaterThan(0)
  expect(enlaces.every((h) => h.startsWith('/chats/'))).toBe(true)
})

test('la ficha en Leads es su propia sección', async ({ page }) => {
  await page.goto('/chats')
  await page.waitForURL(/\/chats\/[0-9a-f-]{36}/)
  const id = new URL(page.url()).pathname.split('/')[2]
  await page.goto(`/leads/${id}`)
  await expect(menuActivo(page)).toContainText('Leads')
  const enlaces = await page.getByRole('region', { name: 'Conversaciones' }).locator('a').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''))
  expect(enlaces.every((h) => h.startsWith('/leads/'))).toBe(true)
})

test('el chat muestra la ventana de 24 h y el panel ⚡ inserta respuestas sin enviarlas', async ({ page }) => {
  await page.goto('/chats')
  await page.waitForURL(/\/chats\/[0-9a-f-]{36}/)
  await expect(page.locator('#chat [role=status]').first()).toContainText(/Puedes responder|Responde pronto|Ventana cerrada|Aún no te escribe/)
  await page.locator('button[title^="Respuestas rápidas"]').click()
  await expect(page.locator('[role=tablist][aria-label="Categorías"] button').first()).toHaveText(/Todas/)
  const primera = page.locator('#chat .max-h-64 button').first()
  if (await primera.count()) {
    await primera.click()
    await expect(page.locator('#chat textarea')).not.toHaveValue('')
    await page.locator('#chat textarea').fill('') // no se envía nada
  }
})

test('respuestas rápidas: filtro por categoría y buscador', async ({ page }) => {
  await page.goto('/respuestas')
  const chips = page.locator('nav[aria-label="Categorías"] a')
  await expect(chips.first()).toContainText('Todas')
  await page.locator('nav[aria-label="Categorías"] a', { hasText: 'Modalidades' }).click()
  await page.waitForURL(/cat=modalidades/)
  await page.fill('input[name=q]', 'traslado')
  await page.keyboard.press('Enter')
  await page.waitForURL(/q=traslado/)
  await expect(page.getByText(/Traslado/).first()).toBeVisible()
})

test('Mi QR: el enlace para compartir lleva ?via=enlace y la lista de registrados viene plegada', async ({ page }) => {
  await page.goto('/qr')
  await expect(page.locator('input[aria-label^="Enlace del QR"]').first()).toHaveValue(/\/w\/[0-9A-F]{6}\?via=enlace$/)
  const plegado = page.locator('details', { hasText: 'Registrados con tu QR o enlace' })
  await expect(plegado).toHaveCount(1)
  expect(await plegado.evaluate((d) => (d as HTMLDetailsElement).open)).toBe(false)
})

test('recordatorios: el reporte de envíos carga con sus filtros', async ({ page }) => {
  await page.goto('/recordatorios')
  const verEnvios = page.getByRole('link', { name: /Ver envíos/ }).first()
  test.skip(!(await verEnvios.count()), 'No hay recordatorios con envíos')
  await verEnvios.click()
  await page.waitForURL(/\/recordatorios\/\d+/)
  await expect(page.locator('button[aria-pressed]', { hasText: /^Todos/ })).toBeVisible()
  await expect(page.getByRole('button', { name: '⬇ CSV' })).toBeVisible()
})

test('conversaciones iniciadas (super admin): tabla general y por asesor', async ({ page }) => {
  await page.goto('/conversaciones-iniciadas')
  await expect(page.getByRole('heading', { name: 'Conversaciones iniciadas' })).toBeVisible()
  await expect(page.locator('tfoot')).toContainText('Total general')
})

test('procedencia: reporte por departamento con detalle de provincias', async ({ page }) => {
  await page.goto('/procedencia')
  await expect(page.getByRole('heading', { name: 'Procedencia de los leads' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Perú por departamento' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Por país' })).toBeVisible()
  await page.goto('/procedencia?dep=21')
  await expect(page.getByRole('heading', { name: 'Provincias de Puno' })).toBeVisible()
})

test('procedencia en la ficha: el buscador sugiere Juliaca (sin guardar)', async ({ page }) => {
  await page.goto('/leads')
  await page.locator('a[href^="/leads/"][href*="-"]').first().click()
  await page.waitForURL(/\/leads\/[0-9a-f-]{36}/)
  // "Editar datos" muestra el panel de detalles si estaba oculto
  const buscador = page.locator('input[role=combobox]').filter({ visible: true })
  const elegido = page.getByRole('button', { name: 'Cambiar' }).filter({ visible: true })
  // Al abrir el panel la página se refresca: se reintenta hasta que el formulario quede abierto
  await expect(async () => {
    const editar = page.getByRole('button', { name: /Editar datos/ }).filter({ visible: true })
    if (await editar.count()) await editar.first().click()
    await expect(buscador.or(elegido).first()).toBeVisible({ timeout: 3000 })
  }).toPass({ timeout: 30_000 })
  if (await buscador.count()) {
    await buscador.fill('julia')
    await expect(page.getByRole('option', { name: /Juliaca/ }).first()).toBeVisible()
  }
})

test('actividades: el formulario de una actividad nueva trae el editor del QR (sin guardar)', async ({ page }) => {
  await page.goto('/actividades')
  const nueva = page.locator('details', { hasText: 'Nueva actividad' }).first()
  if (!(await nueva.evaluate((d) => (d as HTMLDetailsElement).open))) await nueva.locator('summary').click()
  await expect(page.getByText('Formulario del QR').first()).toBeVisible()
  await expect(page.getByRole('radiogroup', { name: 'DNI' }).first()).toBeVisible()
  await page.getByRole('button', { name: '+ Agregar pregunta' }).first().click()
  await expect(page.getByLabel('Texto de la pregunta 1').first()).toBeVisible()
  // Plantilla "Inscripción completa": como ya hay una pregunta, pide confirmar y carga las 11 preguntas
  await page.getByRole('button', { name: /Inscripción completa/ }).first().click()
  await page.getByRole('button', { name: 'Usar este formulario' }).click()
  await expect(page.getByLabel('Texto de la pregunta 11').first()).toHaveValue('¿Cómo conociste la UPeU?')
  await expect(page.getByRole('radiogroup', { name: 'DNI' }).first().getByRole('radio', { name: 'Obligatorio' })).toHaveAttribute('aria-checked', 'true')
})
