// Páginas públicas: las ven los alumnos sin iniciar sesión.
import { expect, test } from '@playwright/test'

test('el login carga', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('#usuario')).toBeVisible()
  await expect(page.locator('#clave')).toBeVisible()
})

test('un QR de asesor que no existe muestra el aviso', async ({ page }) => {
  await page.goto('/w/ZZZZZZ')
  await expect(page.getByText('Este QR no existe')).toBeVisible()
})

test('sin sesión, el panel lleva al login', async ({ page }) => {
  await page.goto('/leads')
  await expect(page).toHaveURL(/\/login/)
})

test('la lista de lugares (UBIGEO) se descarga sin iniciar sesión', async ({ request }) => {
  const r = await request.get('/ubigeos.json')
  expect(r.ok()).toBe(true)
  const filas = await r.json() as [string, string][]
  expect(filas.find((f) => f[0] === '211101')?.[1]).toBe('Juliaca')
})
