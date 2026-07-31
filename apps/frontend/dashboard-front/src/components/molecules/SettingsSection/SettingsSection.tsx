import type { ReactNode } from 'react';

export interface SettingsSectionProps {
  title: string;
  /** Qué hace esta sección, en una frase. */
  description: string;
  children: ReactNode;
}

/**
 * Una sección de la pantalla de Configuración.
 *
 * Existe **para que Configuración pueda crecer sin rehacerse**: hoy tiene una
 * sola sección —tus datos— y la tentación era escribirla suelta en la page. En
 * cuanto llegue la segunda, dos bloques maquetados a mano dejan de parecerse
 * entre sí, y arreglarlo después obliga a tocar las dos.
 *
 * El título es un `<h2>` porque el `<h1>` de la pantalla lo pone `AppHeader`. Con
 * varias secciones, esto es lo que da el esquema de la página a un lector de
 * pantalla.
 *
 * No sube a `commons`: la regla es que un componente cruce solo cuando lo usan
 * dos zonas, y de momento Configuración vive únicamente aquí.
 */
export function SettingsSection({ title, description, children }: SettingsSectionProps) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-2xl text-text-primary">{title}</h2>
        <p className="font-serif text-base italic text-text-secondary">{description}</p>
      </div>

      {children}
    </section>
  );
}
