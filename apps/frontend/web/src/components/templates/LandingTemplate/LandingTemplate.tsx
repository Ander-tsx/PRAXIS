import type { ReactNode } from 'react';

export interface LandingTemplateProps {
  navbar: ReactNode;
  hero: ReactNode;
  /**
   * El vídeo de demostración. Va pegado al hero y **sube sobre él** con un
   * margen negativo propio, así que el orden importa: entre `hero` y
   * `features` y en ningún otro sitio.
   */
  demo: ReactNode;
  features: ReactNode;
  automation: ReactNode;
  assistant: ReactNode;
  howItWorks: ReactNode;
  cta: ReactNode;
  footer: ReactNode;
}

/**
 * LandingTemplate — define el layout de la landing page sin datos reales.
 * Recibe cada sección como ReactNode. No importa organismos directamente.
 * La page es la que instancia este template con los organismos concretos.
 */
export function LandingTemplate({
  navbar,
  hero,
  demo,
  features,
  automation,
  assistant,
  howItWorks,
  cta,
  footer,
}: LandingTemplateProps) {
  return (
    // `.landing`: raíz de la paleta monocroma (ver globals.css). Cada
    // sección decide si se queda en la zona oscura por defecto o pasa a
    // `.landing-light` — el mismo patrón de zonas de Kyloo.
    <div className="landing flex min-h-screen flex-col" style={{ background: 'var(--l-bg)' }}>
      {navbar}
      <main className="flex-1">
        {hero}
        {demo}
        {features}
        {automation}
        {assistant}
        {howItWorks}
        {cta}
      </main>
      {footer}
    </div>
  );
}
