import { AppHeader, BandejaMovil } from '@praxis/commons';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Avisos' };

/**
 * La pestaña «Avisos» de móvil, como pantalla y no como hoja (M8 de
 * `docs/PLAN-MOVIL.md`). En escritorio la bandeja es el flotante de la campana
 * y nada enlaza aquí; si alguien llega por la URL, ve la misma lista.
 */
export default function AvisosPage() {
  return (
    <AppHeader title="Avisos">
      <BandejaMovil />
    </AppHeader>
  );
}
