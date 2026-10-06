import { LayoutGrid, Settings, Shield, Users, Zap } from 'lucide-react';

/**
 * El icono de cada sección del proyecto.
 *
 * ## Por qué los iconos viven aquí y no en `TabNav`
 *
 * `TabNav` está en `commons` y lo usan dos zonas. Si supiera de iconos tendría
 * que traerse el catálogo dentro —y con él la librería— para las dos, aunque
 * Administración no ponga ninguno. Recibe el nodo ya renderizado y sigue sin
 * saber nada de esto.
 *
 * ## Por qué el icono está aquí y no en la definición de `TABS`
 *
 * `TABS` es una constante de un Server Component y se usa también para resolver
 * la pestaña activa desde la URL. Meter JSX dentro la convertiría en algo que ya
 * no se puede leer como datos.
 *
 * ⚠️ **Van decorativos** (`aria-hidden` lo pone `TabNav`): el nombre accesible
 * de la pestaña es su texto, que está justo al lado. Un icono que además se
 * anunciara diría dos veces lo mismo.
 *
 * ⚠️ **El rayo es de Automatización a propósito.** Se probó con un engranaje y
 * se leía como «configuración» —que es otra sección, y en otro sitio—; el rayo
 * es lo que usa todo el mundo para «esto pasa solo». El engranaje es de
 * Ajustes, que desde que es pestaña está justo a su derecha.
 */
const ICONOS = {
  workspaces: LayoutGrid,
  team: Users,
  roles: Shield,
  automation: Zap,
  settings: Settings,
} as const;

export type TabIconName = keyof typeof ICONOS;

export function TabIcon({ nombre }: { nombre: TabIconName }) {
  const Icono = ICONOS[nombre];
  /* `size-4` y no un tamaño en píxeles: acompaña al texto de la pestaña, que es
     `text-sm`, y si el usuario sube el tamaño de fuente el icono sube con él. */
  return <Icono className="size-4" strokeWidth={2} />;
}
