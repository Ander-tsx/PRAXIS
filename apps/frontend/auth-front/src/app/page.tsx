import { redirect } from 'next/navigation';

/**
 * Ruta raíz de auth-front (/auth).
 * Redirige automáticamente al login.
 */
export default function AuthRootPage() {
  redirect('/login');
}
