import { TabNav, tabLinkClasses } from '@praxis/commons';
import Link from 'next/link';

const TABS = [
  { id: 'cuentas', label: 'Cuentas', href: '/' },
  { id: 'proyectos', label: 'Proyectos', href: '/proyectos' },
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
 * El orden es «sobre qué se actúa» y luego «qué se hizo»: cuentas y proyectos son
 * los dos inventarios, y actividad es el registro de lo que se ha hecho sobre
 * ellos. Va al final porque se consulta después, no antes.
 */
export function AdminTabs({ activo }: { activo: AdminTabId }) {
  return (
    <TabNav
      ariaLabel="Secciones de administración"
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
