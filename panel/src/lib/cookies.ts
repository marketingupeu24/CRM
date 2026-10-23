// Preferencias del usuario guardadas en cookies (las lee el servidor para dibujar la página ya con la elección).

/** Guarda una cookie de preferencia por 1 año, para todo el panel. */
export function guardarCookie(nombre: string, valor: string) {
  document.cookie = `${nombre}=${valor}; path=/; max-age=31536000; samesite=lax`
}
