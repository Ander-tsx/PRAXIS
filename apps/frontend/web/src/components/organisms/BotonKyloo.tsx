import { KylooWordmark } from '@praxis/commons';

/**
 * «Continuar con Kyloo»: el botón de la identidad compartida del ecosistema.
 *
 * Es un **enlace**, no un `onClick` con `fetch`: la entrada es una redirección
 * de página entera hacia Kyloo Accounts y de vuelta (`/auth/api/kyloo/start`),
 * que un navegador sabe seguir hacia otro origen y un `fetch` no (CORS). Misma
 * razón por la que Accounts hace así su botón de Google.
 *
 * Solo se pinta si `NEXT_PUBLIC_KYLOO_LOGIN=1`: el entorno que no tiene el
 * cliente OIDC dado de alta no puede ofrecer un botón que acaba en error.
 */
export function BotonKyloo({ next, texto = 'Continuar con' }: { next?: string; texto?: string }) {
  if (process.env.NEXT_PUBLIC_KYLOO_LOGIN !== '1') return null;

  const href = `/auth/api/kyloo/start${next ? `?next=${encodeURIComponent(next)}` : ''}`;
  return (
    <a
      href={href}
      className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface-elevated text-sm font-medium text-text-primary no-underline transition-colors hover:border-border-strong hover:bg-surface"
    >
      {texto}
      <KylooWordmark className="h-4 w-auto" aria-label="Kyloo" role="img" />
    </a>
  );
}
