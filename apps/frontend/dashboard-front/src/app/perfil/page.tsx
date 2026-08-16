import { redirect } from 'next/navigation';

/**
 * `/dashboard/perfil` → `/dashboard/profile`.
 *
 * La pantalla se llama ahora `profile`, como el resto de las rutas de la zona
 * —`chat`, `notifications`, `settings`—: era la única en español y el segmento
 * de la URL es lo primero que se ve de una pantalla.
 *
 * Esta redirección se queda por lo mismo por lo que se quedó la de §24.2: los
 * enlaces internos ya apuntan al sitio nuevo, pero los marcadores y lo que
 * alguien haya pegado en un chat no se pueden corregir desde aquí.
 *
 * Sin el basePath: es una ruta del App Router de esta app, y Next le antepone
 * `/dashboard` solo (ESTADO-ACTUAL §16).
 *
 * ⚠️ **Fuera del grupo `(private)`, a propósito.** Ahí dentro el `layout.tsx`
 * monta el armazón, y montarlo pide el perfil y la navegación al gateway: dos
 * llamadas para pintar una pantalla que nadie llega a ver. La zona la protege
 * `proxy.ts` entera, así que estar fuera del grupo no la deja sin guard.
 */
export default function PerfilRedirect() {
  redirect('/profile');
}
