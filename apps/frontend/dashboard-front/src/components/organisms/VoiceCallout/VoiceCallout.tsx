import { alpha, colors } from '@praxis/commons';
import Link from 'next/link';

/**
 * Aviso de que Praxis Voice existe y de qué hace falta para entrar.
 *
 * ## Por qué hace falta decirlo
 *
 * La skill **no tiene forma de explicarse a sí misma**: cuando alguien dice
 * «Alexa, abre Praxis Voice» sin haber vinculado la cuenta, lo único que puede
 * responder es que no la reconoce. No hay pantalla donde poner instrucciones ni
 * enlace que abrir, así que si la app web no cuenta que existe una frase
 * semilla y dónde se genera, no lo cuenta nadie.
 *
 * Va en el panel y no en un rincón de Configuración porque el problema es de
 * descubrimiento: quien no sabe que la skill existe no entra en Ajustes a
 * buscarla.
 *
 * ## Cuándo se enseña
 *
 * **Solo mientras no haya ninguna vinculación activa.** En cuanto la hay, el
 * aviso ha cumplido y desaparece; dejarlo puesto lo convertiría en parte del
 * decorado, que es como se deja de leer un aviso.
 *
 * No es descartable a mano a propósito: descartarlo exigiría guardar esa
 * decisión en algún sitio —otra cookie, otra columna— para un mensaje que ya se
 * apaga solo en cuanto deja de aplicar.
 */
export function VoiceCallout() {
  return (
    <section
      aria-labelledby="voice-callout-title"
      className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5"
      style={{
        borderColor: alpha(colors.accent, 45),
        background: `linear-gradient(135deg, ${alpha(colors.accent, 10)}, transparent 65%)`,
      }}
    >
      <div className="flex items-start gap-3.5">
        <span
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: alpha(colors.accent, 18), color: colors.accent }}
        >
          {/* Micrófono. Decorativo: lo que hay que leer está en el texto. */}
          <svg
            className="h-4.5 w-4.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.75}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 15a3 3 0 003-3V6a3 3 0 10-6 0v6a3 3 0 003 3z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 12a7 7 0 01-14 0M12 19v3" />
          </svg>
        </span>

        <div className="flex flex-col gap-1">
          <h2
            id="voice-callout-title"
            className="font-sans text-sm font-semibold text-text-primary"
          >
            Consulta tus proyectos con la voz
          </h2>
          <p className="max-w-prose font-sans text-sm text-text-secondary">
            Para entrar en <strong className="font-semibold">Praxis Voice</strong>, la skill de
            Alexa, necesitas generar tu frase semilla y dictársela. Se hace en Configuración y tarda
            menos de un minuto.
          </p>
        </div>
      </div>

      {/* `next/link` sin el basePath: es una ruta de esta misma zona y Next le
          antepone `/dashboard`. Ver ESTADO-ACTUAL §16. */}
      <Link
        href="/settings"
        className="shrink-0 rounded-lg px-4 py-2 font-sans text-sm font-semibold transition-opacity hover:opacity-85"
        style={{ background: colors.accent, color: colors.accentForeground }}
      >
        Generar mi frase
      </Link>
    </section>
  );
}
