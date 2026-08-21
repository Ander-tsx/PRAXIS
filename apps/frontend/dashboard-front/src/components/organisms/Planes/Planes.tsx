import { ASSISTANT_PLAN_LIMITS, Badge, alpha, colors } from '@praxis/commons';
import type { ReactNode } from 'react';
import type { AssistantQuota } from '@/lib/billing';

/**
 * Los planes, uno al lado del otro, con lo que da cada uno.
 *
 * ## Por qué esta pantalla existe aparte de Configuración
 *
 * En Configuración hay un resumen del plan **que tienes**: cuánto llevas
 * gastado y cuándo vuelve. Eso responde «¿cómo voy?». Esto responde otra
 * pregunta —«¿qué me llevo si pago?»— y por eso es una página y no una tarjeta
 * más: quien llega aquí viene de quedarse sin mensajes, y lo que necesita
 * delante es la comparación, no su barra de consumo.
 *
 * ## Los números salen de un solo sitio
 *
 * `ASSISTANT_PLAN_LIMITS` en `commons/api/domain` es el espejo de
 * `ASSISTANT_LIMITS` de `@praxis/contracts` — el frontend no puede importar del
 * backend. Aquí se usa ese espejo y **no se escribe ninguna cifra a mano**: un
 * «13 mensajes» en una frase es un número que se queda viejo el día que suba.
 *
 * El consumo real, en cambio, sale de la cuota que manda el servidor: el plan
 * que tienes se pinta con sus datos, no con la tabla.
 */
export function Planes({
  quota,
  precioPro,
  accionPro,
  accionPortal,
  vueltaDelPago,
}: {
  /** La cuota de quien mira, o `null` si no se pudo leer. */
  quota: AssistantQuota | null;
  /** Lo que cuesta PRO, ya escrito. Vive en el `.env` del gateway, no aquí. */
  precioPro: string | null;
  /** El botón de comprar, si hay pasarela. Sin él, la tarjeta lo explica. */
  accionPro: ReactNode;
  /** El botón del portal de facturación, si ya es cliente. */
  accionPortal: ReactNode;
  /** La enhorabuena, si se vuelve de un pago. */
  vueltaDelPago: ReactNode;
}) {
  const plan = quota?.plan ?? 'FREE';

  return (
    <div className="flex flex-col gap-6">
      {vueltaDelPago}

      <div className="grid gap-4 lg:grid-cols-2">
        <TarjetaDePlan
          nombre="Gratis"
          lema="Para probar el asistente y ver de qué es capaz."
          mensajes={ASSISTANT_PLAN_LIMITS.FREE}
          precio="0"
          esElTuyo={plan === 'FREE'}
          ventajas={[
            'Proyectos, tableros y tareas sin límite.',
            'Chat del equipo, análisis y automatizaciones.',
            `${ASSISTANT_PLAN_LIMITS.FREE} mensajes al asistente cada mes.`,
          ]}
        />

        <TarjetaDePlan
          nombre="PRO"
          lema="Para quien trabaja con el asistente todos los días."
          mensajes={ASSISTANT_PLAN_LIMITS.PRO}
          precio={precioPro}
          esElTuyo={plan === 'PRO'}
          destacada
          ventajas={[
            `${ASSISTANT_PLAN_LIMITS.PRO} mensajes al asistente cada mes.`,
            'Todo lo del plan gratuito, sin cambiar nada de tus proyectos.',
            'Se cancela cuando quieras, desde tu propia cuenta.',
          ]}
          accion={plan === 'PRO' ? accionPortal : accionPro}
          /* ⚠️ Se dice que se renueva, y se dice donde está el botón. Cobrar un
             segundo mes a quien creía comprar uno suelto es la peor reseña
             posible, y el sitio de decirlo no es la letra pequeña. */
          nota={plan === 'PRO' ? 'Tu suscripción está activa.' : 'Suscripción mensual.'}
        />
      </div>

      {quota && (
        <p className="font-sans text-sm text-text-secondary">
          Este mes llevas <strong className="text-text-primary">{quota.usados}</strong> de{' '}
          {quota.limite} mensajes.
        </p>
      )}
    </div>
  );
}

function TarjetaDePlan({
  nombre,
  lema,
  mensajes,
  precio,
  ventajas,
  esElTuyo,
  destacada = false,
  accion,
  nota,
}: {
  nombre: string;
  lema: string;
  mensajes: number;
  precio: string | null;
  ventajas: string[];
  esElTuyo: boolean;
  destacada?: boolean;
  accion?: ReactNode;
  nota?: string;
}) {
  return (
    <section
      className="flex flex-col gap-4 rounded-2xl border p-6"
      style={
        destacada
          ? { borderColor: alpha(colors.primary, 45), background: alpha(colors.primary, 6) }
          : { borderColor: colors.border, background: colors.surfaceElevated }
      }
      aria-label={`Plan ${nombre}`}
    >
      <div className="flex items-center gap-2">
        <h2 className="font-sans text-lg font-semibold text-text-primary">{nombre}</h2>
        {esElTuyo && <Badge variant="primary">Tu plan</Badge>}
      </div>

      <p className="font-sans text-sm text-text-secondary">{lema}</p>

      <p className="font-sans text-text-primary">
        <span className="text-3xl font-semibold">{precio === null ? '—' : `$${precio}`}</span>
        <span className="font-sans text-sm text-text-secondary"> / mes</span>
      </p>

      <ul className="flex flex-col gap-2">
        {ventajas.map((ventaja) => (
          <li key={ventaja} className="flex items-start gap-2 font-sans text-sm text-text-primary">
            <span aria-hidden="true" style={{ color: colors.primary }}>
              ✓
            </span>
            <span className="min-w-0">{ventaja}</span>
          </li>
        ))}
      </ul>

      <p className="font-sans text-xs text-text-disabled">
        {mensajes} mensajes al asistente al mes.
      </p>

      {accion && (
        <div className="mt-auto flex flex-col gap-1.5 pt-2">
          {accion}
          {nota && <span className="font-sans text-xs text-text-disabled">{nota}</span>}
        </div>
      )}
    </section>
  );
}
