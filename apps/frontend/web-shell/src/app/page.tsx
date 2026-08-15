import { LandingCTA } from '@/components/organisms/LandingCTA';
import { LandingFeatures } from '@/components/organisms/LandingFeatures';
import { LandingHero } from '@/components/organisms/LandingHero';
import { LandingHowItWorks } from '@/components/organisms/LandingHowItWorks';
import { PublicFooter } from '@/components/organisms/PublicFooter';
import { PublicNavbar } from '@/components/organisms/PublicNavbar';
import { LandingTemplate } from '@/components/templates/LandingTemplate';
import { getSession } from '@praxis/commons/auth';
import { getTheme } from '@praxis/commons/theme';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Praxis — Gestión de proyectos para equipos',
  description:
    'Organiza tus proyectos en espacios y tableros, define qué puede hacer cada rol y consulta el avance de tu equipo por voz con Alexa.',
};

/**
 * LandingPage — página de inicio pública.
 *
 * Instancia el template con los organismos reales. Lee la sesión en el
 * servidor para que las llamadas a la acción apunten al panel en vez de al
 * registro cuando ya hay alguien identificado.
 *
 * Leer la cookie hace que la página se renderice bajo demanda en lugar de
 * prerenderizarse: es el precio de que el navbar refleje la sesión.
 */
export default async function LandingPage() {
  /* El mismo tema con el que el layout estampó el `<html>`: el switch tiene
     que nacer donde está, no en el valor por defecto. */
  const theme = await getTheme();
  const session = await getSession();
  const isAuthenticated = session !== null;

  return (
    <LandingTemplate
      navbar={<PublicNavbar isAuthenticated={isAuthenticated} initialTheme={theme} />}
      hero={<LandingHero isAuthenticated={isAuthenticated} />}
      features={<LandingFeatures />}
      howItWorks={<LandingHowItWorks />}
      cta={<LandingCTA isAuthenticated={isAuthenticated} />}
      footer={<PublicFooter />}
    />
  );
}
