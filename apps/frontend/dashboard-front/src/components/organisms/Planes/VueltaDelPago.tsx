'use client';

import { Button, alpha, colors } from '@praxis/commons';
import { cuotaPropiaAction } from '@praxis/commons/billing/actions';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * Lo que se ve al volver de Stripe.
 *
 * ## 🔴 El hueco que hay que aguantar, no esquivar
 *
 * **El plan lo concede el webhook, y solo el webhook.** La `success_url` la
 * puede escribir cualquiera en la barra de direcciones: si volver a
 * `?pago=ok` diera PRO, el plan sería gratis para quien supiera la URL.
 *
 * De ahí sale un problema real de pantalla: cuando la persona vuelve del pago,
 * **el webhook puede no haber llegado todavía**. Son segundos, pero existen — y
 * durante esos segundos el servidor sigue diciendo FREE a alguien que acaba de
 * pagar. Decírselo tal cual sería mentir con la verdad.
 *
 * Así que esto pregunta por la cuota hasta que diga PRO, y mientras tanto
 * cuenta lo que de verdad está pasando: el pago se hizo y se está confirmando.
 * Si tras varios intentos sigue sin llegar, tampoco se acusa a nadie: el cobro
 * está hecho y el plan aparecerá — recargar más tarde lo resolverá.
 *
 * ## Por qué un contador de intentos y no un `setInterval` eterno
 *
 * Un sondeo sin fin deja una pestaña olvidada llamando al servidor toda la
 * tarde. Diez intentos separados por dos segundos cubren de sobra lo que tarda
 * un webhook, y lo que no cubren tampoco lo iba a resolver esperar más.
 */

/** Cada cuánto se vuelve a preguntar, y cuántas veces. */
const ESPERA_MS = 2_000;
const INTENTOS = 10;

export function VueltaDelPago({ planActual }: { planActual: 'FREE' | 'PRO' }) {
  const router = useRouter();
  const [plan, setPlan] = useState(planActual);
  const [intentos, setIntentos] = useState(0);

  const confirmado = plan === 'PRO';
  const esperando = !confirmado && intentos < INTENTOS;

  useEffect(() => {
    if (!esperando) return;

    const temporizador = window.setTimeout(async () => {
      const cuota = await cuotaPropiaAction();
      setIntentos((cuantos) => cuantos + 1);
      if (cuota?.plan === 'PRO') {
        setPlan('PRO');
        /* Que el resto de la página —el contador, la tarjeta del plan— deje de
           decir FREE también. */
        router.refresh();
      }
    }, ESPERA_MS);

    return () => window.clearTimeout(temporizador);
  }, [esperando, intentos, router]);

  if (confirmado) {
    return (
      <div
        role="status"
        className="flex flex-col gap-2 rounded-2xl border px-5 py-4"
        style={{ background: alpha(colors.success, 10), borderColor: alpha(colors.success, 35) }}
      >
        <h2 className="font-sans text-lg font-semibold text-text-primary">
          ¡Enhorabuena! Ya tienes PRAXIS PRO
        </h2>
        <p className="font-sans text-sm text-text-secondary">
          Tu plan está activo desde ya. El asistente vuelve a estar disponible con todos sus
          mensajes del mes, y tus proyectos siguen exactamente donde los dejaste.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="button" onClick={() => router.push('/assistant')}>
            Hablar con PRAX
          </Button>
        </div>
      </div>
    );
  }

  if (esperando) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col gap-2 rounded-2xl border px-5 py-4"
        style={{ background: alpha(colors.primary, 8), borderColor: alpha(colors.primary, 30) }}
      >
        <h2 className="font-sans text-lg font-semibold text-text-primary">
          Confirmando tu pago…
        </h2>
        <p className="font-sans text-sm text-text-secondary">
          El cobro se ha hecho. Estamos esperando la confirmación de Stripe para activar tu plan;
          suele tardar unos segundos.
        </p>
      </div>
    );
  }

  /* Se agotaron los intentos. El pago existe —Stripe no devuelve aquí a quien no
     pagó—, así que el mensaje no siembra dudas sobre eso: solo dice que la
     activación va con retraso. */
  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-2xl border px-5 py-4"
      style={{ background: alpha(colors.warning, 8), borderColor: alpha(colors.warning, 30) }}
    >
      <h2 className="font-sans text-lg font-semibold text-text-primary">
        Tu pago está hecho, y el plan va en camino
      </h2>
      <p className="font-sans text-sm text-text-secondary">
        La confirmación está tardando más de lo normal. No hace falta que pagues otra vez: tu plan
        se activará solo. Vuelve a cargar esta página en unos minutos.
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="button" variant="secondary" onClick={() => router.refresh()}>
          Volver a comprobar
        </Button>
      </div>
    </div>
  );
}
