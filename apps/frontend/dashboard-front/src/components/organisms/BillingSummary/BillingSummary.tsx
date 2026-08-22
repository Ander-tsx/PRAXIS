import { formatoReinicio } from '@/lib/billing';
import { Badge, alpha, colors } from '@praxis/commons';
import type {
  PlanSpec,
  BillingSummary as ResumenDeFacturacion,
  Tope,
} from '@praxis/commons/billing/planes';
import { TEXTO_DE_ESTADO, fechaCorta, textoDeTope } from '@praxis/commons/billing/planes';
import Link from 'next/link';
import { PlanActionButton } from './PlanActionButton';

export interface BillingSummaryProps {
  /** `null` cuando no se pudo leer el plan: no rompe la pantalla. */
  resumen: ResumenDeFacturacion | null;
  /** La ficha del plan que se tiene, para escribir su nombre. `null` si no llegó. */
  spec: PlanSpec | null;
}

/**
 * El plan que se tiene, con lo gastado de cada tope.
 *
 * ## Esta tarjeta responde «¿cómo voy?»
 *
 * La comparación entre planes —«¿qué me llevo si pago?»— vive en su propia
 * página y no aquí: quien abre Configuración viene a mirar su consumo, no a
 * elegir. Por eso la tarjeta enseña **sus** números y un enlace, y no una tabla.
 *
 * ⚠️ **Los topes salen del servidor, no de esta pantalla.** Antes había dos
 * planes escritos a mano aquí dentro; con cinco, y con el de alguien pudiendo
 * venir de la organización de su empresa, cualquier cifra escrita en el
 * frontend es una promesa que el gateway puede desmentir. Todo llega en
 * `GET /me/billing/resumen`.
 *
 * ## El botón de compra
 *
 * Va contra **Stripe Checkout alojado**: la página de la tarjeta la sirve
 * Stripe. Aquí no hay ni un campo de pago, y por eso no hay nada que proteger
 * en esta pantalla. Solo sale si el backend tiene claves —`cobroDisponible`—
 * porque **más vale decir que no está a ofrecer un botón que responde 503**.
 *
 * ⚠️ Volver del pago **no cambia nada de esta pantalla por sí mismo**. Quien
 * concede el plan es el webhook de Stripe; si al volver todavía pone lo de
 * antes, es que aún no ha llegado — recargar lo resuelve.
 */
export function BillingSummary({ resumen, spec }: BillingSummaryProps) {
  if (!resumen) {
    /* Sin tarjeta propia: la pone `PanelCard`, y un recuadro dentro de otro
       recuadro para una sola frase es marco de más. */
    return (
      <p className="font-sans text-sm text-text-secondary">
        No se pudo cargar tu plan en este momento. Vuelve a intentarlo más tarde.
      </p>
    );
  }

  const nombre = spec?.nombre ?? resumen.tier;
  const finDePrueba = fechaCorta(resumen.pruebaTerminaEn);
  const finDePlan = fechaCorta(resumen.cancelaEn);

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface-elevated p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-sans text-base font-semibold text-text-primary">{nombre}</h3>
          <Badge variant="primary">Tu plan</Badge>
          {resumen.status !== 'ACTIVE' && (
            <Badge variant={resumen.status === 'PAST_DUE' ? 'warning' : 'default'}>
              {TEXTO_DE_ESTADO[resumen.status]}
            </Badge>
          )}
        </div>

        {spec && <p className="font-sans text-sm text-text-secondary">{spec.resumen}</p>}

        <Medidor
          titulo="Mensajes a PRAX este mes"
          usado={resumen.uso.iaMensual}
          tope={resumen.quotas.iaMensualPorPersona}
          pie={`Se reinician el ${formatoReinicio(resumen.iaReiniciaEn)}.`}
        />

        <Medidor
          titulo="Proyectos tuyos"
          usado={resumen.uso.proyectos}
          tope={resumen.quotas.proyectos}
          pie={
            resumen.quotas.miembrosPorProyecto === null
              ? 'Miembros por proyecto sin límite.'
              : `Hasta ${resumen.quotas.miembrosPorProyecto} miembros por proyecto.`
          }
        />

        {/* 🔴 El mes gratis se cobra al segundo, y esto es donde se avisa. «No
            me avisaron» es la queja más cara de este terreno, y la fecha está
            guardada desde el día uno justo para poder escribirla aquí. */}
        {finDePrueba && (
          <p
            className="rounded-xl px-3 py-2 font-sans text-xs"
            style={{ background: alpha(colors.primary, 8), color: colors.textSecondary }}
          >
            Tu mes gratis termina el {finDePrueba}. A partir de ahí se cobra, salvo que canceles
            antes desde tu suscripción.
          </p>
        )}

        {finDePlan && (
          <p className="font-sans text-xs text-text-secondary">
            Has pedido la baja: el plan vale hasta el {finDePlan}.
          </p>
        )}

        {/* Solo para quien ya es cliente de Stripe. Cambiar tarjeta, ver recibos
            y darse de baja se hacen en su portal: reimplementarlo aquí sería
            rehacer prorrateos y reintentos que ya existen ahí. */}
        {resumen.gestionable && (
          <PlanActionButton accion="portal">Gestionar suscripción</PlanActionButton>
        )}
      </div>

      <div
        className="flex flex-col gap-3 rounded-2xl border border-dashed p-5"
        style={{ borderColor: colors.border }}
      >
        <h3 className="font-sans text-base font-semibold text-text-primary">Los demás planes</h3>
        <p className="font-sans text-sm text-text-secondary">
          Más proyectos, más mensajes al mes y más gente por tablero. Los de empresa además tienen
          asientos y su propio portal.
        </p>

        {resumen.cobroDisponible ? (
          <Link
            href="/dashboard/plans"
            className="font-sans text-sm text-text-secondary underline-offset-2 hover:underline"
          >
            Ver todos los planes y sus precios
          </Link>
        ) : (
          /* Sin pasarela configurada, ofrecer un botón sería prometer algo que
             no ocurre. */
          <span className="font-sans text-sm text-text-disabled">
            El pago no está disponible en esta instalación todavía.
          </span>
        )}

        {resumen.organizaciones.length > 0 && (
          <Link
            href="/dashboard/organizations"
            className="font-sans text-sm text-text-secondary underline-offset-2 hover:underline"
          >
            Tus organizaciones ({resumen.organizaciones.length})
          </Link>
        )}
      </div>
    </div>
  );
}

/** Una barra de consumo. Sin tope no hay barra: ver `Planes`. */
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
  const proporcion = tope === null ? null : Math.min(usado / Math.max(tope, 1), 1);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between font-sans text-sm">
        <span className="text-text-primary">{titulo}</span>
        <span className="text-text-secondary">
          {usado} / {textoDeTope(tope)}
        </span>
      </div>
      {proporcion !== null && (
        <div
          className="h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: colors.borderSubtle }}
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
      <p className="font-sans text-xs text-text-secondary">{pie}</p>
    </div>
  );
}
