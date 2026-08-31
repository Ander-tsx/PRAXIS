/**
 * Armazón del área privada, en dos piezas y por un motivo concreto.
 *
 * `AppShell` va en el `layout.tsx` de la zona y `AppHeader` dentro de cada
 * page. Cuando todo estaba en un solo `AppLayout` dentro de las páginas,
 * navegar lo desmontaba entero y el `loading.tsx` pintaba de esqueletos la barra
 * lateral: enlaces, nombre, correo y hasta el botón de cerrar sesión, cosas que
 * no cambian al cambiar de pantalla.
 */
export { AppShell, useAppShell } from './AppShell';
export type { AppShellProps, AppShellUser } from './AppShell';
export { AppHeader } from './AppHeader';
export type { AppHeaderProps } from './AppHeader';
export { NavList } from './NavList';
export * from './navigation';
export { PresenceFooter } from './PresenceFooter';
export type { PresenceFooterProps } from './PresenceFooter';
export * from './DockPanel';
export { PraxProvider } from './PraxWindow';
export { usePrax } from './PraxContext';
export type { PraxModo } from './PraxContext';
export { PraxLauncher } from './PraxLauncher';
