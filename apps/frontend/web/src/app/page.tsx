import { SmoothScroll } from '@/components/SmoothScroll';
import { LandingAssistant } from '@/components/organisms/LandingAssistant';
import { LandingAutomation } from '@/components/organisms/LandingAutomation';
import { LandingCTA } from '@/components/organisms/LandingCTA';
import { LandingDemo } from '@/components/organisms/LandingDemo';
import { LandingFeatures } from '@/components/organisms/LandingFeatures';
import { LandingHero } from '@/components/organisms/LandingHero';
import { LandingHowItWorks } from '@/components/organisms/LandingHowItWorks';
import { PublicFooter } from '@/components/organisms/PublicFooter';
import { PublicNavbar } from '@/components/organisms/PublicNavbar';
import { LandingTemplate } from '@/components/templates/LandingTemplate';
import { getSession } from '@praxis/commons/auth';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Praxis — Gestión de proyectos para equipos',
  description:
    'Organiza tus proyectos en espacios y tableros, define qué puede hacer cada rol, deja que un asistente proponga y que reglas automáticas actúen solas.',
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
 *
 * El vídeo de demostración (`LandingDemo`) va **sin `src`**: el marco se pinta
 * con su proporción definitiva y un aviso dentro. Cuando exista el archivo se
 * copia a `public/media/` y se pasa aquí; nada más se mueve, que es justamente
 * para lo que el hueco ya está reservado.
 *
 * No lee `getTheme()`: la landing es monocroma y fija, no responde al
 * claro/oscuro de la cuenta. Ese selector sigue viviendo en Configuración,
 * dentro de la aplicación.
 */
export default async function LandingPage() {
  const session = await getSession();
  const isAuthenticated = session !== null;

  return (
    <>
      <SmoothScroll />
      <LandingTemplate
        navbar={<PublicNavbar isAuthenticated={isAuthenticated} />}
        hero={<LandingHero isAuthenticated={isAuthenticated} />}
        demo={<LandingDemo />}
        features={<LandingFeatures />}
        automation={<LandingAutomation />}
        assistant={<LandingAssistant />}
        howItWorks={<LandingHowItWorks />}
        cta={<LandingCTA isAuthenticated={isAuthenticated} />}
        footer={<PublicFooter />}
      />
    </>
  );
}
