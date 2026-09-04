'use client';

import { ThemeToggle } from '@praxis/commons';
import { useRouter } from 'next/navigation';

/**
 * Copia local de `ThemeName` (`@praxis/commons/theme`).
 *
 * Ese módulo es de servidor —usa `next/headers`— y no se importa desde un
 * componente de cliente ni siquiera solo por el tipo. Mismo criterio que en
 * Configuración.
 */
type ThemeName = 'dark' | 'light';

/** Espejo de `THEME_COOKIE` de `commons/theme/cookie.ts`. */
const THEME_COOKIE = 'praxis_theme';
const UN_ANO = 60 * 60 * 24 * 365;

/**
 * El selector de tema del landing.
 *
 * ## Por qué escribe la cookie desde el cliente
 *
 * Configuración usa una Server Action que además revalida su layout. Aquí no
 * hace falta: el landing es **público** —no tiene sesión, ni acciones, ni datos
 * que revalidar— y montar una Server Action para guardar una preferencia de
 * color sería maquinaria por encima del problema. Se escribe la cookie y se
 * refresca la ruta, que es lo que vuelve a pintar el `<html>` con el
 * `data-theme` nuevo.
 *
 * ⚠️ `path=/` y **el mismo nombre de cookie que el resto**: el tema elegido aquí
 * es el que se encuentra al entrar en la aplicación, y al revés. Con una cookie
 * propia del landing, iniciar sesión te cambiaría el aspecto sin haber tocado
 * nada — que es la clase de detalle que hace sentir dos productos distintos
 * donde solo hay uno.
 */
export function ThemeSwitchPublico({ initialTheme }: { initialTheme: ThemeName }) {
  const router = useRouter();

  function guardar(theme: ThemeName) {
    document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${UN_ANO}; samesite=lax`;
    /* El `<html data-theme>` lo estampa el layout en el servidor, así que sin
       este refresco la cookie cambiaría y la página seguiría igual hasta la
       siguiente navegación. */
    router.refresh();
  }

  return <ThemeToggle initialTheme={initialTheme} onCambiar={guardar} />;
}
