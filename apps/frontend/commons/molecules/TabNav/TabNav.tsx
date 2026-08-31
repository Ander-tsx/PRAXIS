import { Fragment, type ReactNode } from 'react';

export interface TabItem {
  /** Valor en la URL (`?tab=`). */
  id: string;
  label: string;
  /** Número al lado de la etiqueta: cuántos elementos hay en esa pestaña. */
  count?: number;
  /**
   * Un icono a la izquierda del nombre.
   *
   * ⚠️ **Es un `ReactNode` y no el nombre de un icono**, a propósito. Este
   * componente vive en `commons` y lo usan dos zonas: si aceptara un nombre,
   * tendría que traerse dentro un catálogo de iconos —y con él la librería
   * entera— para las dos, aunque una no ponga ninguno. Recibiéndolo ya
   * renderizado, cada zona pone los suyos y `TabNav` sigue sin saber nada de
   * iconos.
   *
   * ⚠️ Y va **decorativo**: el nombre accesible de la pestaña es su texto, que
   * está justo al lado. Un icono que además se anunciara diría dos veces lo
   * mismo a quien usa un lector de pantalla.
   */
  icon?: ReactNode;
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
  /**
   * El nombre accesible de esta navegación.
   *
   * ⚠️ **No puede ser «Secciones».** Ese es el de la barra lateral
   * (`NavList`), que está en pantalla a la vez que estas pestañas: dos
   * navegaciones con el mismo nombre en la misma página dejan a quien usa un
   * lector de pantalla sin forma de distinguirlas —«Secciones» y «Secciones»—,
   * que es justo lo que un `aria-label` viene a evitar.
   *
   * Lo destapó una prueba: `getByRole('navigation', { name: 'Secciones' })`
   * casaba con las dos y buscaba una pestaña en la barra lateral.
   */
  ariaLabel?: string;
}

/**
 * Navegación por pestañas, con subrayado en la activa.
 *
 * Sustituye a apilar las secciones una debajo de otra: cuando cada sección
 * tiene su propia cabecera, su botón de acción y su estado vacío, apilarlas
 * obliga a bajar mucho para ver algo y ninguna se lee como la principal.
 */
export function TabNav({
  tabs,
  activeId,
  renderLink,
  ariaLabel = 'Secciones de la página',
}: TabNavProps) {
  return (
    /**
     * `overflow-y-hidden` es imprescindible: con solo `overflow-x-auto` el
     * contenedor se vuelve scrollable en los dos ejes y el navegador saca una
     * barra vertical sobre una fila que nunca desborda a lo alto.
     *
     * `scrollbar-none` esconde también la horizontal: en escritorio no hace
     * falta y en táctil se arrastra igual.
     */
    <nav
      className="scrollbar-none flex gap-1 overflow-x-auto overflow-y-hidden border-b border-white/[0.08]"
      aria-label={ariaLabel}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;

        const content = (
          <span className="flex items-center gap-2">
            {tab.icon && (
              <span aria-hidden className="flex shrink-0 items-center">
                {tab.icon}
              </span>
            )}
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={[
                  'rounded-full px-1.5 py-0.5 font-sans text-[11px] tabular-nums',
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'bg-white/5 text-white',
                ].join(' ')}
              >
                {tab.count}
              </span>
            )}
          </span>
        );

        /**
         * ⚠️ **La `key` la pone `TabNav`, no quien pinta el enlace.**
         *
         * `renderLink` es un render-prop: el elemento lo **crea quien llama**
         * —cada zona monta su `<Link>`— así que ninguna de esas llamadas ponía
         * clave y React avisaba en cada carga: «Each child in a list should
         * have a unique key». Culpaba al armazón y al layout de la zona, que es
         * donde se crea el elemento, no a este `.map()`, que es donde está la
         * lista; por eso costaba encontrarlo.
         *
         * Envolviendo aquí, la clave deja de depender de que nadie se olvide:
         * la lista es de este componente y las claves también.
         */
        return <Fragment key={tab.id}>{renderLink(tab, isActive, content)}</Fragment>;
      })}
    </nav>
  );
}

/** Clases del enlace de una pestaña. Las aplica quien renderiza el `<Link>`. */
export function tabLinkClasses(isActive: boolean): string {
  return [
    'shrink-0 border-b-2 px-4 py-3 font-sans text-sm transition-colors -mb-px',
    isActive
      ? 'border-white font-semibold text-white'
      : 'border-transparent font-medium text-white hover:text-white',
  ].join(' ');
}
