import type { ReactNode } from 'react';

export interface LandingTemplateProps {
  navbar: ReactNode;
  hero: ReactNode;
  features: ReactNode;
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
  features,
  howItWorks,
  cta,
  footer,
}: LandingTemplateProps) {
  return (
    <div className="flex flex-col min-h-screen">
      {navbar}
      <main className="flex-1">
        {hero}
        {features}
        {howItWorks}
        {cta}
      </main>
      {footer}
    </div>
  );
}
