import { AppHeader, PantallaTu } from '@praxis/commons';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Tú' };

/**
 * La pestaña «Tú» de móvil: perfil, estado, organización, ajustes y cerrar
 * sesión, todo a la vista (M8 de `docs/PLAN-MOVIL.md`). Lo pinta el armazón
 * con lo que ya tiene cargado —ver `PantallaTu`—, así que esta página no pide
 * nada.
 */
export default function TuPage() {
  return (
    <AppHeader title="Tú">
      <PantallaTu />
    </AppHeader>
  );
}
