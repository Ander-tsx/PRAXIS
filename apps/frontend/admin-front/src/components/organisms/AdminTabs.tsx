import { TabNav, tabLinkClasses } from '@praxis/commons';
import Link from 'next/link';

const TABS = [
  { id: 'cuentas', label: 'Cuentas', href: '/' },
  { id: 'proyectos', label: 'Proyectos', href: '/projects' },
  { id: 'actividad', label: 'Actividad', href: '/actividad' },
] as const;

export type AdminTabId = (typeof TABS)[number]['id'];

/** `id` → ruta, resuelto una vez. Ver la nota de `renderLink`. */
const HREFS = Object.fromEntries(TABS.map((tab) => [tab.id, tab.href])) as Record<
  AdminTabId,
  string
>;

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
      /* El `href` sale de un mapa y no de un `TABS.find(...)!`: aquel afirmaba
         con un `!` que la pestaña existe —cierto, pero por una invariante que el
         compilador no ve— y además recorría la lista una vez por pestaña. */
      renderLink={(tab, isActive, content) => (
        <Link key={tab.id} href={HREFS[tab.id as AdminTabId]} className={tabLinkClasses(isActive)}>
          {content}
        </Link>
      )}
    />
  );
}
