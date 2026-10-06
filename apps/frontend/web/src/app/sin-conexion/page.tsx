import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sin conexión',
  robots: { index: false, follow: false },
};

/**
 * Lo que enseña la app cuando se abre una pantalla sin red (M1 de
 * `docs/PLAN-MOVIL.md`).
 *
 * No se visita: el service worker la precarga al instalarse y la sirve **en la
 * URL que se pidió** cuando la red falla. Por eso es estática y no lleva nada
 * que necesite JavaScript —el SW le quita los `<script>` al guardarla, ver
 * `public/sw.js`—: «Reintentar» es un enlace vacío, que recarga la URL de
 * verdad y no esta.
 */
export const dynamic = 'force-static';

export default function SinConexion() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-[#191919] px-8 pb-safe pt-safe text-center">
      <svg
        className="h-12 w-12 text-text-secondary"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8.5 16.5a5 5 0 017 0M5 12.86a10 10 0 015.17-2.69M19 12.86a10 10 0 00-2.07-1.53M2 8.82a15 15 0 014.17-2.65M22 8.82A15 15 0 0011.17 5.1M12 20h.01"
        />
      </svg>
      <div className="flex max-w-sm flex-col gap-2">
        <h1 className="font-sans text-xl font-semibold text-text-primary">Sin conexión</h1>
        <p className="font-sans text-sm leading-relaxed text-text-secondary">
          Esta pantalla no se había guardado para verla sin red. En cuanto vuelva la conexión,
          podrás seguir donde lo dejaste.
        </p>
      </div>
      {/* `href=""` recarga la URL actual —la que se pidió, con su consulta—, sin
          JavaScript. `?` o un formulario GET perderían la consulta (`?board=…`). */}
      <a
        // biome-ignore lint/a11y/useValidAnchor: el href vacío es justo «esta misma URL»
        href=""
        className="rounded-lg bg-white px-5 py-2.5 font-sans text-sm font-semibold text-black transition-opacity hover:opacity-90"
      >
        Reintentar
      </a>
    </main>
  );
}
