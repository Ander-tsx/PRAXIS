'use client';

import { useEffect, useState } from 'react';
import { type AssistantQuota, formatoReinicio } from '../../api/assistant';
import { Button } from '../../atoms';
import { estadoDeFacturacionAction } from '../../billing/actions';
import { alpha, colors } from '../../tokens';

/**
 * Lo que se ve cuando se acaban los mensajes del mes.
 *
 * ## 🔴 Antes era un callejón
 *
 * Decía «Has gastado los N mensajes de este mes. Vuelven el día 1» y ahí se
 * acababa. Es información correcta y es lo único que no sirve para nada: cuenta
 * **cuándo volver**, que es dentro de tres semanas, y no dice qué se puede
 * hacer ahora. Justo en el momento en que alguien ha encontrado útil el
 * asistente —tanto como para gastarlo entero— la aplicación le da la espalda.
 *
 * ## Cuándo NO se enseña esto
 *
 * - **A quien ya paga.** Si alguien agotó la cuota de un plan de pago,
 *   ofrecerle que lo compre es ridículo: ahí el aviso de «vuelven el día 1» es
 *   la respuesta correcta y es lo que se enseña.
 * - **Si la instalación no tiene claves de Stripe.** `GET /me/billing/estado`
 *   lo dice, y el navegador no puede saberlo por su cuenta. Sin claves el pago
 *   responde 503, y un botón que falla al pulsarlo es peor que no tenerlo.
 *
 * En los dos casos se cae al aviso de siempre, que sigue siendo verdad.
 */
export function AmpliarPlan({ cuota }: { cuota: AssistantQuota }) {
  const [disponible, setDisponible] = useState<boolean | null>(null);

  /**
   * Se pregunta al montarse, no al cargar el chat.
   *
   * Este componente solo existe cuando la cuota está agotada, que es una
   * minoría de las sesiones: preguntar antes sería una llamada por cada
   * apertura del asistente para algo que casi nunca se usa.
   */
  useEffect(() => {
    let vivo = true;
    estadoDeFacturacionAction()
      .then((estado) => {
        if (vivo) setDisponible(estado.disponible);
      })
      .catch(() => {
        if (vivo) setDisponible(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  const reinicio = formatoReinicio(cuota.reinicia);

  /* Mientras no se sabe si hay pago, se enseña el aviso de siempre: parpadear
     entre dos mensajes distintos es peor que tardar un segundo en ofrecer. */
  if (cuota.plan !== 'FREE' || disponible !== true) {
    return <AvisoDeCuota limite={cuota.limite} reinicio={reinicio} />;
  }

  /**
   * Lleva a la tabla de precios, y **no abre el pago desde aquí**.
   *
   * ⚠️ Antes sí lo abría, con el plan escrito a pelo en esta llamada. Dejó de
   * poder hacerlo cuando todo plan pasó a contratarse **para una organización**:
   * quién paga es una elección, y este componente no puede tomarla — vive en el
   * chat, que se monta en cinco zonas y no sabe en qué organización estás.
   *
   * Navegación dura porque cruza de zona: cada una tiene su `basePath` y un
   * `Link` de aquí a `/dashboard` no lo resuelve.
   */
  function verPlanes() {
    window.location.href = '/dashboard/billing';
  }

  return (
    /**
     * Se distingue del resto del hilo a propósito.
     *
     * Todo lo demás en esta columna es una burbuja o un aviso: gris, plano y
     * fácil de saltarse. Esto tiene que leerse como **otra cosa** —un borde de
     * color, un fondo con degradado y el rayo delante— porque aparece una sola
     * vez y en el único momento en que la respuesta importa. Sigue sin gritar:
     * el degradado es del primario de la casa a un 12 %, no un cartel.
     */
    <div
      className="mt-auto flex shrink-0 flex-col gap-4 overflow-hidden rounded-sm border p-5"
      style={{
        borderColor: alpha(colors.primary, 40),
        background: `linear-gradient(135deg, ${alpha(colors.primary, 12)} 0%, ${alpha(colors.accent, 8)} 100%)`,
        boxShadow: `0 8px 24px ${alpha(colors.primary, 12)}`,
      }}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-sm"
          style={{ background: alpha(colors.primary, 18), color: colors.primary }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-5"
          >
            <path d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </span>

        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-sans text-base font-semibold text-text-primary">
            Con un plan de pago no esperas
          </p>
          {/* ⚠️ Ni una cifra escrita aquí: los topes y los precios los sirve el
              catálogo, y repetirlos en un componente que vive en cinco zonas es
              garantizar que un día prometan lo que el servidor niega. */}
          <p className="font-sans text-sm text-white">
            Amplía los mensajes al mes para ti y para quien trabaje contigo.
          </p>
        </div>
      </div>

      {/* Lo que se lleva quien pague, dicho con lo que ya hace PRAX y no con
          adjetivos: son las capacidades que esta persona acaba de usar. */}
      <ul className="flex flex-col gap-1.5 font-sans text-xs text-white">
        <Ventaja>Pregunta por tus proyectos y responde con sus datos, no de memoria.</Ventaja>
        <Ventaja>Propone tareas, asignaciones y tableros que aceptas con un botón.</Ventaja>
        <Ventaja>Lee los archivos que le adjuntes y te contesta sobre ellos.</Ventaja>
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={verPlanes}>
          Ver los planes
        </Button>
        {/* ⚠️ Se dice que se renueva, y se dice aquí. Cobrar un segundo mes a
            quien creía estar comprando uno suelto es la peor reseña posible. */}
        <span className="font-sans text-xs text-white">
          Suscripción mensual · tus {cuota.limite} mensajes vuelven el {reinicio}
        </span>
      </div>
    </div>
  );
}

function Ventaja({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span aria-hidden="true" style={{ color: colors.primary }}>
        ·
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

/** El aviso de siempre: cuánto había y cuándo vuelve. */
function AvisoDeCuota({ limite, reinicio }: { limite: number; reinicio: string }) {
  return (
    <p
      role="note"
      className="mt-auto shrink-0 rounded-sm border px-4 py-3 font-sans text-sm text-warning"
      style={{ background: alpha(colors.warning, 8), borderColor: alpha(colors.warning, 30) }}
    >
      Has gastado los <strong>{limite}</strong> mensajes de este mes. Vuelven el{' '}
      <strong>{reinicio}</strong>.
    </p>
  );
}
