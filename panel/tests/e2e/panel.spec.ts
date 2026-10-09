// Panel con sesión (solo lectura): cada página carga, sin errores de JavaScript, en tema claro y oscuro.
// Requiere E2E_USUARIO y E2E_CLAVE (un usuario con acceso a todos los módulos).
import { expect, test, type Page } from '@playwright/test'

const USUARIO = process.env.E2E_USUARIO
const CLAVE = process.env.E2E_CLAVE
test.skip(!USUARIO || !CLAVE, 'Falta E2E_USUARIO / E2E_CLAVE')

const PAGINAS = ['/pendientes', '/chats', '/leads', '/kanban', '/leads/nuevo', '/dashboard', '/usuarios', '/respuestas', '/cuenta', '/qr', '/genesys', '/genesys/pruebas', '/flujos-bot', '/recordatorios', '/enlaces', '/puntaje']

async function ingresar(page: Page) {
  await page.goto('/login')
  await page.fill('#usuario', USUARIO!)
  await page.fill('#clave', CLAVE!)
  await page.click('button[type=submit]')
  await page.waitForSelector('nav[aria-label="Menú principal"]', { timeout: 60_000 })
}

for (const tema of ['claro', 'oscuro'] as const) {
  test(`páginas del panel (${tema})`, async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: 'crm-tema', value: tema, url: baseURL! }])
    const errores: string[] = []
    page.on('pageerror', (e) => errores.push(e.message))
    await ingresar(page)
    for (const ruta of PAGINAS) {
      const res = await page.goto(ruta)
      expect(res?.status(), ruta).toBe(200)
    }
    expect(errores).toEqual([])
  })
}

test('ficha de un lead y buscador', async ({ page }) => {
  await ingresar(page)
  await page.goto('/leads')
  const enlace = await page.locator('tbody a[href^="/leads/"]').first().getAttribute('href')
  test.skip(!enlace, 'No hay leads para abrir')
  await page.goto(enlace!)
  await expect(page.locator('h1').first()).toBeVisible()
  await page.locator('h1').first().click()
  await page.keyboard.press('/')
  await expect(page.getByRole('dialog', { name: 'Buscador' })).toBeVisible()
})
