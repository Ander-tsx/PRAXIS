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
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Praxis — Gestión de proyectos para equipos',
  description:
    'Organiza tus proyectos en espacios y tableros, define qué puede hacer cada rol, deja que un asistente proponga y que reglas automáticas actúen solas.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Praxis — Gestión de proyectos para equipos',
    description:
      'Organiza tus proyectos en espacios y tableros, define qué puede hacer cada rol, deja que un asistente proponga y que reglas automáticas actúen solas.',
    url: '/',
    siteName: 'Praxis',
    images: [
      {
        url: '/icons/icon-512.png',
        width: 512,
        height: 512,
        alt: 'Praxis — Gestión de proyectos',
      },
    ],
    type: 'website',
    locale: 'es_MX',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Praxis — Gestión de proyectos para equipos',
    description:
      'Organiza tus proyectos en espacios y tableros, define qué puede hacer cada rol, deja que un asistente proponga y que reglas automáticas actúen solas.',
    images: ['/icons/icon-512.png'],
  },
};

/**
 * Datos estructurados de la landing. Solo lo que la página ya dice de sí
 * misma: el nombre, la URL, el logo servido en `public/icons/` y la
 * descripción visible. Sin ratings, precios ni perfiles que no existan.
 */
const DATOS_ESTRUCTURADOS = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://usepraxis.space/#organizacion',
      name: 'Praxis',
      url: 'https://usepraxis.space/',
      logo: 'https://usepraxis.space/icons/icon-512.png',
      description:
        'Plataforma de gestión de proyectos con tableros Kanban, permisos dinámicos, automatizaciones y un asistente que propone.',
    },
    {
      '@type': 'WebSite',
      '@id': 'https://usepraxis.space/#sitio',
      url: 'https://usepraxis.space/',
      name: 'Praxis',
      inLanguage: 'es-MX',
      publisher: { '@id': 'https://usepraxis.space/#organizacion' },
    },
    {
      '@type': 'WebPage',
      '@id': 'https://usepraxis.space/#pagina-inicio',
      url: 'https://usepraxis.space/',
      name: 'Praxis — Gestión de proyectos para equipos',
      isPartOf: { '@id': 'https://usepraxis.space/#sitio' },
      about: { '@id': 'https://usepraxis.space/#organizacion' },
      inLanguage: 'es-MX',
    },
  ],
};

/**
 * LandingPage — página de inicio pública.
 *
 * Instancia el template con los organismos reales. Es un Server Component
 * estático: no lee la sesión ni ninguna otra cookie, así que Next puede
 * prerenderizarla y servir el HTML con el contenido SEO sin depender de
 * autenticación.
 *
 * ⚠️ **Por qué ya no se lee `getSession()` aquí.** La llamada a la acción
 * variaba según la sesión («Ir al panel» vs «Comenzar gratis»), y leer la
 * cookie forzaba renderizado dinámico en la única URL indexable. Pero el guard
 * (`SOLO_INVITADOS` en `src/proxy.ts`) redirige `/` con sesión válida a
 * `/projects` antes de llegar aquí, así que la rama autenticada nunca se
 * servía en producción: estático con `isAuthenticated={false}` es el mismo
 * HTML que ya veían el crawler y los visitantes anónimos.
 *
 * El vídeo de demostración (`LandingDemo`) vive en `public/media/`: WebM
 * (VP9) primero, más ligero, y MP4 (H.264) como `<source>` de respaldo para
 * el navegador que no entienda el primero. Los dos se generaron a partir de
 * la grabación original recortando al 16:9 exacto del marco antes de escalar
 * a 1080p — así no se gastan bits en los píxeles que `object-cover` iba a
 * recortar de todos modos — y sin pista de audio, que un vídeo `muted` no usa.
 *
 * No lee `getTheme()`: la landing es monocroma y fija, no responde al
 * claro/oscuro de la cuenta. Ese selector sigue viviendo en Configuración,
 * dentro de la aplicación.
 */
export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(DATOS_ESTRUCTURADOS) }}
      />
      <SmoothScroll />
      <LandingTemplate
        navbar={<PublicNavbar isAuthenticated={false} />}
        hero={<LandingHero isAuthenticated={false} />}
        demo={
          <LandingDemo
            webmSrc="/media/praxis-demo.webm"
            src="/media/praxis-demo.mp4"
            poster="/media/praxis-demo-poster.jpg"
          />
        }
        features={<LandingFeatures />}
        automation={<LandingAutomation />}
        assistant={<LandingAssistant />}
        howItWorks={<LandingHowItWorks />}
        cta={<LandingCTA isAuthenticated={false} />}
        footer={<PublicFooter />}
      />
    </>
  );
}
