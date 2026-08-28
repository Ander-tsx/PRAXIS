import { GlobalRoleBadges, alpha, colors } from '@praxis/commons';
import Link from 'next/link';

export interface DashboardHeroProps {
  /** Nombre completo. Vacío en cuentas recién creadas. */
  name: string;
  email: string;
  /** Roles globales (`GET /permissions/user/:id`). */
  roles: string[];
  /** La frase de estado, ya construida. Ver `resumenDelDia`. */
  resumen: string;
}

/**
 * La cabecera del panel.
 *
 * Absorbe a `DashboardWelcome`, con su aviso de perfil incompleto intacto: el
 * registro no pide nombre, así que **el caso normal de una cuenta nueva es no
 * tener nombre**, y saludar con un «Hola, » a medias era lo que aquello vino a
 * arreglar.
 *
 * ## ⚠️ Por qué no hay «Buenos días»
 *
 * Es lo primero que pide un panel y es una trampa: esta página es un Server
 * Component, así que la hora sería **la del servidor**, no la de quien mira. Con
 * el servidor en otra región —que es el caso en cuanto esto se despliegue— el
 * saludo se equivoca a diario para media plantilla, y no de una forma que alguien
 * vaya a reportar: simplemente queda mal.
 *
 * Las salidas eran pintarlo en el cliente —una isla de JavaScript para decir
 * «buenas tardes»— o pasar la zona horaria por cookie. Ninguna de las dos paga
 * lo que cuesta. El saludo se queda sin reloj y el sitio que iba a ocupar lo
 * usa `resumen`, que dice algo que sí depende de datos.
 */
export function DashboardHero({ name, email, roles, resumen }: DashboardHeroProps) {
  const tieneNombre = name.trim().length > 0;

  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h2 className="font-display text-3xl text-text-primary sm:text-4xl">
              {tieneNombre ? `Hola, ${name}` : 'Te damos la bienvenida'}
            </h2>

            <GlobalRoleBadges roles={roles} />
          </div>

          <p className="font-serif text-lg italic text-text-secondary">{resumen}</p>
        </div>
      </div>

      {!tieneNombre && (
        <div
          className="flex flex-col gap-3 rounded-sm border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
          style={{ background: alpha(colors.primary, 6) }}
        >
          <div className="flex flex-col gap-1">
            <p className="font-sans text-sm text-text-primary">
              Estás identificado como <span className="font-semibold">{email}</span>.
            </p>
            <p className="font-sans text-sm text-text-secondary">
              Al registrarte no te pedimos tu nombre. Añádelo para que tu equipo te reconozca.
            </p>
          </div>

          {/* Misma zona → `next/link`, y sin el basePath: Next le antepone
              `/dashboard` solo. Ver ESTADO-ACTUAL §16. */}
          <Link
            href="/profile"
            className="shrink-0 rounded-lg bg-primary px-4 py-2 text-center font-sans text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            Completar perfil
          </Link>
        </div>
      )}
    </header>
  );
}

/**
 * La frase de estado del día, construida con lo que ya se ha pedido.
 *
 * ## Por qué esto y no «Este es el estado de tus proyectos»
 *
 * Porque aquella frase era la misma todos los días y para todo el mundo. Un
 * subtítulo que no cambia nunca es un subtítulo que se deja de leer a la
 * segunda visita, y ocupaba el sitio más visible de la pantalla.
 *
 * ⚠️ **El orden de los casos es el orden de urgencia, y no es cosmético.** Se
 * dice **una** cosa, la que más apremia, y no se encadenan tres frases: un
 * resumen que lo enumera todo obliga a leerlo entero para saber si había algo
 * urgente, que es exactamente lo que venía a evitar. El detalle está tres
 * centímetros más abajo, en las cifras y en los bloques.
 */
export function resumenDelDia({
  vencidas,
  pronto,
  invitaciones,
  proyectos,
}: {
  vencidas: number;
  pronto: number;
  invitaciones: number;
  proyectos: number;
}): string {
  if (proyectos === 0) {
    return 'Empieza creando un proyecto: es donde vive todo lo demás.';
  }

  if (vencidas > 0) {
    return vencidas === 1
      ? 'Tienes una tarea vencida. Es lo primero que conviene mirar.'
      : `Tienes ${vencidas} tareas vencidas. Es lo primero que conviene mirar.`;
  }

  if (invitaciones > 0) {
    return invitaciones === 1
      ? 'Te han invitado a un proyecto y está esperando tu respuesta.'
      : `Tienes ${invitaciones} invitaciones esperando tu respuesta.`;
  }

  if (pronto > 0) {
    return pronto === 1
      ? 'Nada vencido, y una tarea tuya vence esta semana.'
      : `Nada vencido, y ${pronto} tareas tuyas vencen esta semana.`;
  }

  return 'Nada vencido ni pendiente de respuesta. Buen momento para lo que no urge.';
}
