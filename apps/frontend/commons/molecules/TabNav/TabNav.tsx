import type { ReactNode } from 'react';

export interface TabItem {
  /** Valor en la URL (`?tab=`). */
  id: string;
  label: string;
  /** Número al lado de la etiqueta: cuántos elementos hay en esa pestaña. */
  count?: number;
}

export interface TabNavProps {
  tabs: TabItem[];
  activeId: string;
  /**
   * Cada pestaña ya renderizada como enlace por quien llama.
   *
   * Es un slot y no un `onClick` porque las pestañas viven en la URL: así son
   * enlaces de verdad —compartibles, con botón atrás, y sin JavaScript— y este
   * componente sigue siendo tonto.
   */
  renderLink: (tab: TabItem, isActive: boolean, content: ReactNode) => ReactNode;
}

/**
 * Navegación por pestañas, con subrayado en la activa.
 *
 * Sustituye a apilar las secciones una debajo de otra: cuando cada sección
 * tiene su propia cabecera, su botón de acción y su estado vacío, apilarlas
 * obliga a bajar mucho para ver algo y ninguna se lee como la principal.
 */
export function TabNav({ tabs, activeId, renderLink }: TabNavProps) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-border" aria-label="Secciones">
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;

        const content = (
          <span className="flex items-center gap-2">
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={[
                  'rounded-full px-1.5 py-0.5 font-sans text-[11px] tabular-nums',
                  isActive ? 'bg-primary-muted text-primary' : 'bg-surface-elevated text-text-disabled',
                ].join(' ')}
              >
                {tab.count}
              </span>
            )}
          </span>
        );

        return renderLink(tab, isActive, content);
      })}
    </nav>
  );
}

/** Clases del enlace de una pestaña. Las aplica quien renderiza el `<Link>`. */
export function tabLinkClasses(isActive: boolean): string {
  return [
    'shrink-0 border-b-2 px-4 py-3 font-sans text-sm transition-colors -mb-px',
    isActive
      ? 'border-primary font-semibold text-text-primary'
      : 'border-transparent font-medium text-text-secondary hover:text-text-primary',
  ].join(' ');
}
