import { redirect } from 'next/navigation';

/**
 * `/auth` a secas manda al login.
 *
 * ⚠️ Con la ruta entera desde F7 de la fusión: ya no hay `basePath` que Next
 * anteponga, así que un `'/login'` habría llevado a una ruta inexistente.
 *
 * Esta sí puede quedarse como página —a diferencia de las de `/main`— porque
 * `/auth` es pública y no la envuelve ningún layout que pida datos al gateway:
 * el `redirect()` sale como 307 sin renderizar nada.
 */
export default function AuthRootPage() {
  redirect('/auth/login');
}
