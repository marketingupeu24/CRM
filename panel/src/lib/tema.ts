// Tema del panel (claro / oscuro / automático). Compartido por el servidor y el navegador.
// Se guarda en una cookie: el servidor dibuja la página ya con el tema (sin parpadeo y sin que
// React lo borre al actualizar). "Automático" no lleva atributo y lo resuelve el CSS con el sistema.
export type Tema = 'claro' | 'oscuro' | 'auto'
export const COOKIE_TEMA = 'crm-tema'

/** Tema si el usuario aún no eligió: claro (como TailAdmin). */
export const TEMA_POR_DEFECTO: Tema = 'claro'

/** Valor del atributo data-theme de <html> para cada tema (undefined = automático). */
export function atributoTema(tema: string | undefined): 'light' | 'dark' | undefined {
  const t = tema ?? TEMA_POR_DEFECTO
  return t === 'claro' ? 'light' : t === 'oscuro' ? 'dark' : undefined
}
