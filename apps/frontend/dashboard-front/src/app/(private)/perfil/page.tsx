import { redirect } from 'next/navigation';

/**
 * `/dashboard/perfil` se llama ahora `/dashboard/settings`.
 *
 * La pantalla **se movió**, no se duplicó: Configuración es una entrada de la
 * barra lateral y sus datos son la primera sección que contiene. Tener las dos
 * rutas con el mismo formulario serían dos sitios donde editar lo mismo, y el
 * segundo en enterarse de un cambio se quedaría atrás.
 *
 * Esto queda solo por los enlaces viejos: los de dentro ya apuntan al sitio
 * nuevo, pero un marcador o un enlace compartido no se puede corregir.
 *
 * ⚠️ **Este segmento se queda en español a propósito**, aunque el resto de la
 * zona se pasara a inglés. No es una ruta del producto: es la cadena que
 * alguien pudo guardar en su día, y traducirla rompería exactamente los
 * enlaces que este archivo existe para rescatar. El día que se dé por
 * amortizada, lo que se borra es la carpeta entera, no se renombra.
 */
export default function ProfileRedirect() {
  // Sin el basePath: es una ruta del App Router de esta app. Ver §17.4.
  redirect('/settings');
}
