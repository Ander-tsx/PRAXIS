import { TabNav, tabLinkClasses } from '@praxis/commons';
import Link from 'next/link';

const TABS = [
  { id: 'cuentas', label: 'Cuentas', href: '/' },
  { id: 'actividad', label: 'Actividad', href: '/actividad' },
] as const;

export type AdminTabId = (typeof TABS)[number]['id'];

/**
 * Las secciones del panel.
 *
 * `next/link` y rutas **sin** el prefijo: estamos dentro de admin-front, así que
 * Next añade `/admin` solo. Escribirlo a mano daría `/admin/admin/actividad`
 * (ESTADO-ACTUAL §16).
 *
 * Falta «Proyectos», que llega con la suspensión de proyectos. No se deja aquí
 * apagada con un «Pronto» porque una pestaña que no lleva a ninguna parte en un
 * panel de dos secciones es más ruido que estructura — el criterio contrario al
 * de la barra lateral, donde las entradas apagadas sí explicaban la forma del
 * producto.
 */
export function AdminTabs({ activo }: { activo: AdminTabId }) {
  return (
    <TabNav
      tabs={TABS.map(({ id, label }) => ({ id, label }))}
      activeId={activo}
      renderLink={(tab, isActive, content) => (
        <Link
          key={tab.id}
          href={TABS.find((t) => t.id === tab.id)!.href}
          className={tabLinkClasses(isActive)}
        >
          {content}
        </Link>
      )}
    />
  );
}
