import { Badge, alpha, colors } from '@praxis/commons';
import type { BillingSummary, PlanSpec, PlanTier, Tope } from '@praxis/commons/billing/planes';
import { TEXTO_DE_ESTADO, fechaCorta, textoDeTope } from '@praxis/commons/billing/planes';
import type { ReactNode } from 'react';

/**
 * Facturación entera: lo que tienes, lo que llevas gastado y lo que hay.
 *
 * ## Por qué es una sola pantalla y antes eran dos
 *
 * Había un resumen del plan en Configuración —«¿cómo voy?»— y una tabla de
 * precios en otra entrada del menú —«¿qué me llevo si pago?»—. Son dos
 * preguntas, sí, pero **se hacen seguidas y por la misma persona**: mirar
 * cuánto te queda es justo lo que te lleva a mirar el plan de al lado. Tenerlas
 * en dos sitios obligaba a adivinar cuál era la buena para cambiar de plan, y
 * el resumen tenía además la mitad de los datos.
 *
 * ## Los números no se escriben aquí
 *
 * ⚠️ **Ni uno.** Los topes salen del catálogo que manda el servidor, que los lee
 * de `PLANS`, que es de donde el gateway lee los que aplica. Un «10 proyectos»
 * escrito en esta tabla es una promesa que se queda vieja el día que cambie el
 * plan, y el síntoma sería la tabla prometiendo lo que el servidor niega — sin
 * ningún error.
 *
 * Los precios son la excepción y tampoco salen de aquí: viven en Stripe, y lo
 * que se enseña es el texto del `.env` de la zona. Si los dos discrepan **manda
 * Stripe**, así que la tarjeta escribe «—» antes que inventarse una cifra.
 */
export function PlanCatalog({
  planes,
  disponibles,
  resumen,
  precios,
  accionDe,
  accionPortal,
  vueltaDelPago,
}: {
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
  const spec = planes.find((plan) => plan.tier === actual) ?? null;
  /* ⚠️ **Una sola lista desde 2026-08-26.** Antes eran dos —«Para ti» y «Para
     un equipo»— porque había dos escaleras de planes. Desde que la organización
     contiene los proyectos, quien trabaja solo es una organización de un
     asiento: partir la tabla obligaba a quien la mira a decidir primero en cuál
     de las dos está, que es una pregunta que nadie sabe contestar. */

  return (
    <div className="flex flex-col gap-10">
      {vueltaDelPago}

      {resumen && <PlanActual resumen={resumen} spec={spec} accionPortal={accionPortal} />}

      <section className="flex flex-col gap-5">
        <Encabezado
          titulo="Cambiar de plan"
          entradilla="Los topes se aplican en el servidor, no en esta pantalla: lo que veas aquí es exactamente lo que se te va a permitir."
        />

        {/* ⚠️ Se dice aquí y no en la letra pequeña: todo plan de pago lo
            contrata una **organización**, no una persona. Se elige cuál, se
            eligen los asientos y se paga desde su portal — que es también donde
            se invita a la gente y queda el registro de lo cobrado. Un botón de
            «pagar» que responde 400 por no haber elegido organización es la
            clase de callejón que nadie sabe deshacer. */}
        <p className="max-w-3xl font-sans text-sm text-text-secondary">
          Todos los planes de pago van{' '}
          <strong className="text-text-primary">por asiento</strong> y los contrata una
          organización. Si trabajas solo, la tuya tiene un asiento y funciona igual.
        </p>

        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          {planes.map((plan) => (
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
    </div>
  );
}

/* ─── Lo que ya tienes ─────────────────────────────────────────────────────── */

function PlanActual({
  resumen,
  spec,
  accionPortal,
}: {
  resumen: BillingSummary;
  spec: PlanSpec | null;
  accionPortal: ReactNode;
}) {
  const finDePrueba = fechaCorta(resumen.pruebaTerminaEn);
  const finDePlan = fechaCorta(resumen.cancelaEn);

  return (
    <section
      className="flex flex-col gap-6 rounded-3xl border p-6 sm:p-7"
      style={{
        borderColor: alpha(colors.primary, 28),
        background: `linear-gradient(160deg, ${alpha(colors.primary, 7)}, transparent 70%)`,
      }}
      aria-label="Tu plan"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="font-sans text-xs font-semibold uppercase tracking-widest text-text-secondary">
            Tu plan
          </span>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="font-sans text-2xl font-semibold text-text-primary">
              {spec?.nombre ?? resumen.tier}
            </h2>
            {resumen.status !== 'ACTIVE' && (
              <Badge variant={resumen.status === 'PAST_DUE' ? 'warning' : 'default'}>
                {TEXTO_DE_ESTADO[resumen.status]}
              </Badge>
            )}
          </div>
          {spec && <p className="max-w-md font-sans text-sm text-text-secondary">{spec.resumen}</p>}
        </div>

        {accionPortal}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Medidor
          titulo="Proyectos tuyos"
          usado={resumen.uso.proyectos}
          tope={resumen.quotas.proyectos}
          pie="Solo cuentan los que sostienes tú, no en los que participas."
        />
        <Medidor
          titulo="Mensajes a PRAX este mes"
          usado={resumen.uso.iaMensual}
          tope={resumen.quotas.iaMensualPorPersona}
          pie={`Vuelven a cero el ${fechaCorta(resumen.iaReiniciaEn) ?? 'día 1'}.`}
        />
      </div>

      {/* 🔴 El mes gratis se cobra al segundo, y este es el sitio donde se avisa.
          «No me avisaron» es la queja más cara de este terreno, y la fecha está
          guardada desde el día uno justo para poder escribirla. */}
      {finDePrueba && (
        <Aviso tono="primary">
          Tu mes gratis termina el <strong>{finDePrueba}</strong>. A partir de esa fecha se cobra la
          mensualidad, salvo que canceles antes desde tu suscripción.
        </Aviso>
      )}

      {resumen.status === 'PAST_DUE' && (
        <Aviso tono="warning">
          No hemos podido cobrar la última mensualidad. <strong>No pierdes nada por ahora</strong>:
          se sigue reintentando. Revisa la tarjeta desde tu suscripción.
        </Aviso>
      )}

      {finDePlan && (
        <Aviso tono="warning">
          Has pedido la baja. El plan sigue valiendo hasta el <strong>{finDePlan}</strong>.
        </Aviso>
      )}
    </section>
  );
}

function Aviso({ tono, children }: { tono: 'primary' | 'warning'; children: ReactNode }) {
  const color = tono === 'warning' ? colors.warning : colors.primary;
  return (
    <p
      className="rounded-xl border px-4 py-3 font-sans text-sm text-text-secondary"
      style={{ borderColor: alpha(color, 32), background: alpha(color, 8) }}
    >
      {children}
    </p>
  );
}

function Medidor({
  titulo,
  usado,
  tope,
  pie,
}: {
  titulo: string;
  usado: number;
  tope: Tope;
  pie: string;
}) {
  /* Sin tope no hay barra que llenar: una al 0 % sobre «sin límite» sugiere que
     queda mucho de algo que no se acaba. */
  const proporcion = tope === null ? null : Math.min(usado / Math.max(tope, 1), 1);
  const lleno = proporcion !== null && proporcion >= 1;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-sans text-sm text-text-primary">{titulo}</span>
        <span className="font-sans text-sm tabular-nums text-text-secondary">
          <strong className={lleno ? 'text-error' : 'text-text-primary'}>{usado}</strong> de{' '}
          {textoDeTope(tope)}
        </span>
      </div>
      {proporcion !== null && (
        <div
          className="h-2 w-full overflow-hidden rounded-full"
          style={{ background: alpha(colors.textSecondary, 12) }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.max(Math.round(proporcion * 100), 2)}%`,
              background: lleno ? colors.error : colors.primary,
            }}
          />
        </div>
      )}
      <p className="font-sans text-xs text-text-disabled">{pie}</p>
    </div>
  );
}

/* ─── El catálogo ──────────────────────────────────────────────────────────── */

function TarjetaDePlan({
  plan,
  precio,
  esElTuyo,
  seVende,
  accion,
}: {
  plan: PlanSpec;
  precio: string | null;
  esElTuyo: boolean;
  seVende: boolean;
  accion: ReactNode;
}) {
  const porAsiento = plan.contratacion !== 'NINGUNA';
  const destacada = plan.diasDePrueba > 0 && !esElTuyo;

  return (
    <section
      className="flex flex-col gap-4 rounded-2xl border p-6 transition-colors"
      style={
        esElTuyo
          ? { borderColor: alpha(colors.primary, 45), background: alpha(colors.primary, 5) }
          : destacada
            ? { borderColor: alpha(colors.success, 40), background: colors.surfaceElevated }
            : { borderColor: colors.border, background: colors.surfaceElevated }
      }
      aria-label={`Plan ${plan.nombre}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-sans text-lg font-semibold text-text-primary">{plan.nombre}</h3>
        {esElTuyo && <Badge variant="primary">Tu plan</Badge>}
        {plan.diasDePrueba > 0 && !esElTuyo && <Badge variant="success">Primer mes gratis</Badge>}
      </div>

      <p className="min-h-[2.5rem] font-sans text-sm text-text-secondary">{plan.resumen}</p>

      <p className="font-sans text-text-primary">
        <span className="text-3xl font-semibold tabular-nums">
          {precio === null ? '—' : `$${precio}`}
        </span>
        <span className="font-sans text-sm text-text-secondary">
          {porAsiento ? ' por asiento al mes' : ''}
        </span>
      </p>

      <ul className="flex flex-col gap-2">
        <Ventaja texto={frase(plan.quotas.asientos, 'personas en la organización')} />
        <Ventaja texto={frase(plan.quotas.proyectos, 'proyectos de la organización')} />
        <Ventaja texto={frase(plan.quotas.iaMensualPorPersona, 'mensajes a PRAX al mes')} />
        {porAsiento && <Ventaja texto={`Desde ${plan.asientosMinimos} asientos`} />}
      </ul>

      <div className="mt-auto flex flex-col gap-2 pt-2">
        {seVende
          ? accion
          : /* Sin precio configurado no se promete nada: es preferible decir que
             ahora no se puede a enseñar un botón que responde 503 al pulsarlo. */
            plan.envPrecio && (
              <p className="font-sans text-sm text-text-disabled">
                Todavía no se puede contratar en esta instalación.
              </p>
            )}
        {plan.diasDePrueba > 0 && !esElTuyo && (
          /* ⚠️ Junto al botón, no en la letra pequeña. */
          <span className="font-sans text-xs text-text-disabled">
            No se cobra nada el primer mes. Al siguiente sí, salvo que canceles antes.
          </span>
        )}
      </div>
    </section>
  );
}

function Encabezado({ titulo, entradilla }: { titulo: string; entradilla: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="font-sans text-lg font-semibold text-text-primary">{titulo}</h2>
      <p className="max-w-3xl font-sans text-sm text-text-secondary">{entradilla}</p>
    </div>
  );
}

function Subtitulo({ texto }: { texto: string }) {
  return (
    <h3 className="font-sans text-xs font-semibold uppercase tracking-widest text-text-disabled">
      {texto}
    </h3>
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
