import { LandingCTA } from '@/components/organisms/LandingCTA';
import { LandingFeatures } from '@/components/organisms/LandingFeatures';
import { LandingHero } from '@/components/organisms/LandingHero';
import { LandingHowItWorks } from '@/components/organisms/LandingHowItWorks';
import { PublicFooter } from '@/components/organisms/PublicFooter';
import { PublicNavbar } from '@/components/organisms/PublicNavbar';
import { LandingTemplate } from '@/components/templates/LandingTemplate';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Praxis — Gestión de proyectos inteligente',
  description:
    'Tableros Kanban, permisos dinámicos y reportes de desviación para equipos que necesitan control total de sus proyectos.',
};

/**
 * LandingPage — página de inicio pública.
 * Única responsable de instanciar el template con los organismos reales.
 * No hay lógica de negocio ni fetch aquí porque la landing es 100% estática.
 */
export default function LandingPage() {
  return (
    <LandingTemplate
      navbar={<PublicNavbar />}
      hero={<LandingHero />}
      features={<LandingFeatures />}
      howItWorks={<LandingHowItWorks />}
      cta={<LandingCTA />}
      footer={<PublicFooter />}
    />
  );
}
