// Pruebas de pantallas (Playwright). Solo LEEN: navegan y revisan que todo cargue sin errores.
//   E2E_URL=https://crm-admision.vercel.app E2E_USUARIO=... E2E_CLAVE=... npm run test:e2e -w panel
// Sin E2E_URL usa el panel local (npm run dev -> http://localhost:3001).
// Sin E2E_USUARIO / E2E_CLAVE solo se prueban las páginas públicas (login y formularios del QR).
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_URL ?? 'http://localhost:3001',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'celular', use: { ...devices['Pixel 7'] }, testMatch: /publicas/ },
  ],
})
