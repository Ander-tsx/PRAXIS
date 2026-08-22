import { Badge, alpha, colors } from '@praxis/commons';
import type { BillingSummary, PlanSpec, PlanTier, Tope } from '@praxis/commons/billing/planes';
import { textoDeTope } from '@praxis/commons/billing/planes';
import type { ReactNode } from 'react';

/**
 * Los planes, uno al lado del otro, con lo que da cada uno.
 *
 * ## Por qué esta pantalla existe aparte de Configuración
 *
 * En Configuración hay un resumen del plan **que tienes**: cuánto llevas
 * gastado y cuándo vuelve. Eso responde «¿cómo voy?». Esto responde otra
 * pregunta —«¿qué me llevo si pago?»— y por eso es una página y no una tarjeta
 * más: quien llega aquí viene de quedarse sin algo, y lo que necesita delante
 * es la comparación, no su barra de consumo.
 *
 * ## Los números no se escriben aquí
 *
 * ⚠️ **Ni uno.** Los topes salen del catálogo que manda el servidor
 * (`GET /me/billing/planes`), que los lee de `PLANS` en contracts, que es donde
 * el gateway lee los que aplica. Un «10 proyectos» escrito en esta tabla es una
 * promesa que se queda vieja el día que cambie el plan, y el síntoma sería la
 * tabla prometiendo lo que el servidor niega — sin ningún error.
 *
 * Los precios son la excepción y no salen de aquí tampoco: viven en Stripe, y
 * lo que se enseña es el texto del `.env` de la zona. Si los dos discrepan
 * manda Stripe, así que la tarjeta escribe «—» antes que inventarse una cifra.
 */
export function Planes({
  planes,
  disponibles,
  resumen,
  precios,
  accionDe,
  accionPortal,
  vueltaDelPago,
}: {
  /** El catálogo entero, en el orden en el que se compara. */
  planes: PlanSpec[];
  /** Los que este despliegue puede cobrar de verdad. */
  disponibles: PlanTier[];
  /** El plan de quien mira, con lo gastado. `null` si no se pudo leer. */
  resumen: BillingSummary | null;
  /** Lo que cuesta cada uno, ya escrito. Del `.env` de la zona. */
  precios: Partial<Record<PlanTier, string>>;
  /** El botón de cada plan. La página decide cuál lleva y cuál no. */
  accionDe: (plan: PlanSpec) => ReactNode;
  /** El botón del portal de facturación, si ya es cliente. */
  accionPortal: ReactNode;
  /** La enhorabuena, si se vuelve de un pago. */
  vueltaDelPago: ReactNode;
}) {
  const actual = resumen?.tier ?? 'FREE';
  const individuales = planes.filter((plan) => plan.audience === 'INDIVIDUAL');
  const empresa = planes.filter((plan) => plan.audience === 'ENTERPRISE');

  return (
    <div className="flex flex-col gap-8">
      {vueltaDelPago}

      {resumen && <Consumo resumen={resumen} />}

      <section className="flex flex-col gap-4">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Para una persona
        </h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {individuales.map((plan) => (
            <TarjetaDePlan
              key={plan.tier}
              plan={plan}
              precio={precios[plan.tier] ?? null}
              esElTuyo={plan.tier === actual}
              seVende={disponibles.includes(plan.tier)}
              accion={plan.tier === actual ? accionPortal : accionDe(plan)}
            />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Para una empresa
        </h2>
        {/* ⚠️ Se dice aquí y no en la letra pequeña: un plan de empresa no se
            compra desde esta pantalla porque **hace falta la organización
            primero**. El botón lleva a crearla; el pago viene después, desde su
            portal. Un botón de «pagar» que responde 400 por no tener
            organización es la clase de callejón que nadie sabe deshacer. */}
        <p className="font-sans text-sm text-text-secondary">
          Los planes de empresa se contratan desde una organización: se crea, se eligen los asientos
          y se paga desde su portal. Ahí es también donde se invita a la gente y se ve el registro
          de facturación.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          {empresa.map((plan) => (
            <TarjetaDePlan
              key={plan.tier}
              plan={plan}
              precio={precios[plan.tier] ?? null}
              esElTuyo={plan.tier === actual}
              seVende={disponibles.includes(plan.tier)}
              accion={accionDe(plan)}
              porAsiento
            />
          ))}
        </div>
      </section>
    </div>
  );
}

/** Lo gastado de lo que da su plan. Las dos cifras que se agotan. */
function Consumo({ resumen }: { resumen: BillingSummary }) {
  return (
    <section
      className="flex flex-col gap-3 rounded-2xl border p-5"
      style={{ borderColor: colors.border, background: colors.surfaceElevated }}
      aria-label="Tu consumo"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-sans text-sm font-semibold text-text-primary">Lo que llevas</h2>
        {resumen.status === 'TRIALING' && <Badge variant="primary">Mes gratis</Badge>}
        {resumen.status === 'PAST_DUE' && <Badge variant="warning">Pago pendiente</Badge>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Barra
          titulo="Proyectos tuyos"
          usado={resumen.uso.proyectos}
          tope={resumen.quotas.proyectos}
        />
        <Barra
          titulo="Mensajes a PRAX este mes"
          usado={resumen.uso.iaMensual}
          tope={resumen.quotas.iaMensualPorPersona}
        />
      </div>
    </section>
  );
}

function Barra({ titulo, usado, tope }: { titulo: string; usado: number; tope: Tope }) {
  /* Sin tope no hay barra que llenar: una al 0 % sobre «sin límite» sugiere que
     queda mucho de algo que no se acaba. */
  const proporcion = tope === null ? null : Math.min(usado / Math.max(tope, 1), 1);

  return (
    <div className="flex flex-col gap-1.5">
      <p className="font-sans text-xs text-text-secondary">{titulo}</p>
      <p className="font-sans text-sm text-text-primary">
        <strong>{usado}</strong> de {textoDeTope(tope)}
      </p>
      {proporcion !== null && (
        <div
          className="h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: alpha(colors.primary, 12) }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.round(proporcion * 100)}%`,
              background: proporcion >= 1 ? colors.error : colors.primary,
            }}
          />
        </div>
      )}
    </div>
  );
}

function TarjetaDePlan({
  plan,
  precio,
  esElTuyo,
  seVende,
  accion,
  porAsiento = false,
}: {
  plan: PlanSpec;
  precio: string | null;
  esElTuyo: boolean;
  seVende: boolean;
  accion: ReactNode;
  porAsiento?: boolean;
}) {
  const destacada = plan.diasDePrueba > 0;

  return (
    <section
      className="flex flex-col gap-4 rounded-2xl border p-6"
      style={
        destacada
          ? { borderColor: alpha(colors.primary, 45), background: alpha(colors.primary, 6) }
          : { borderColor: colors.border, background: colors.surfaceElevated }
      }
      aria-label={`Plan ${plan.nombre}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-sans text-lg font-semibold text-text-primary">{plan.nombre}</h3>
        {esElTuyo && <Badge variant="primary">Tu plan</Badge>}
        {plan.diasDePrueba > 0 && <Badge variant="success">Primer mes gratis</Badge>}
      </div>

      <p className="font-sans text-sm text-text-secondary">{plan.resumen}</p>

      <p className="font-sans text-text-primary">
        <span className="text-3xl font-semibold">{precio === null ? '—' : `$${precio}`}</span>
        <span className="font-sans text-sm text-text-secondary">
          {porAsiento ? ' / asiento al mes' : ' / mes'}
        </span>
      </p>

      <ul className="flex flex-col gap-2">
        <Ventaja texto={frase(plan.quotas.proyectos, 'proyectos tuyos')} />
        <Ventaja texto={frase(plan.quotas.iaMensualPorPersona, 'mensajes a PRAX al mes')} />
        <Ventaja texto={frase(plan.quotas.miembrosPorProyecto, 'miembros por proyecto')} />
        {porAsiento && <Ventaja texto={`Desde ${plan.asientosMinimos} asientos`} />}
      </ul>

      <div className="mt-auto flex flex-col gap-1.5 pt-2">
        {seVende
          ? accion
          : /* Sin precio configurado no se promete nada: es preferible decir que
             ahora no se puede a enseñar un botón que responde 503 al pulsarlo. */
            plan.envPrecio && (
              <p className="font-sans text-sm text-text-secondary">
                Este plan no está disponible en esta instalación todavía.
              </p>
            )}
        {plan.diasDePrueba > 0 && (
          /* ⚠️ Se dice **donde está el botón**, no en la letra pequeña. El mes
             gratis se cobra al segundo, y enterarse por el recibo es la peor
             reseña posible. */
          <span className="font-sans text-xs text-text-disabled">
            El primer mes no se cobra. Al siguiente sí, salvo que canceles antes.
          </span>
        )}
      </div>
    </section>
  );
}

/**
 * «40 proyectos tuyos», o «Proyectos tuyos sin límite».
 *
 * ⚠️ La cifra **delante** y el «sin límite» **detrás**, y no al revés: pegar el
 * texto de `textoDeTope` por delante daba «Sin límite proyectos tuyos», que se
 * lee como un error de traducción justo en la tarjeta del plan más caro.
 */
function frase(tope: Tope, que: string): string {
  return tope === null ? `${mayuscula(que)} sin límite` : `${tope} ${que}`;
}

function mayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function Ventaja({ texto }: { texto: string }) {
  return (
    <li className="flex items-start gap-2 font-sans text-sm text-text-primary">
      <span aria-hidden="true" style={{ color: colors.primary }}>
        ✓
      </span>
      <span className="min-w-0">{texto}</span>
    </li>
  );
}
