import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Configuración',
};

/**
 * Configuración ya no tiene pantalla propia.
 *
 * Su único contenido era el selector de tema claro/oscuro, y el modo claro se
 * ha retirado por ahora. Todo lo demás de la cuenta —tus datos, la sesión, el
 * estado— vive en `/profile`, así que esta ruta redirige allí y se mantiene
 * solo para no romper enlaces y marcadores viejos.
 */
export default function SettingsPage() {
  redirect('/profile');
}
