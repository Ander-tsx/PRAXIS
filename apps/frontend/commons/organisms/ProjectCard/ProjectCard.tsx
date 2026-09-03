import Link from 'next/link';
import type { Project, UserProfile } from '../../api/domain';
import { personLabel } from '../../api/domain';
import { avatarHref } from '../../api/presence';
import { Avatar, Badge, ProjectMonogram } from '../../atoms';
import { alpha, colors } from '../../tokens';

export interface ProjectCardProps {
  project: Project;
  /** Para decidir si eres el dueño o te añadieron, y cuál de las caras es la tuya. */
  currentUserId: string;
  /**
   * El equipo, ya resuelto y contigo el primero.
   *
   * `null` cuando no se pudo pedir: entonces la tarjeta vuelve al número de
   * miembros, que es lo que enseñaba antes de que hubiera caras.
   */
  equipo: UserProfile[] | null;
  /**
   * A dónde lleva la tarjeta.
   *
   * ⚠️ **Lo construye quien la usa, y con el helper que le toca**: `projectPath`
   * dentro de `projects-front`, `projectHref` desde cualquier otra zona. Los dos
   * devuelven `string` y equivocarse no da error de compilación — da un 404 con
   * el basePath repetido, o una URL sin prefijo que no resuelve. Ver §16.
   */
  href: string;
  /**
   * ¿El destino está en la misma zona que quien pinta la tarjeta?
   *
   * Decide `next/link` (misma zona; Next añade el basePath solo) o `<a>` duro
   * (otra zona; es una navegación entre apps del multi-zone y `next/link` le
   * pondría el prefijo equivocado).
   *
   * Por defecto `false`, que es el valor **seguro**: un `<a>` de más cuesta una
   * carga completa, un `next/link` de más cuesta un 404.
   */
  sameZone?: boolean;
  /**
   * El proxy de la zona que pinta, para las fotos del equipo.
   *
   * Las imágenes de avatar se sirven a través del gateway de cada zona
   * (`/dashboard/api/gateway`, `/projects/api/gateway`…), así que este
   * componente no puede saberlo por su cuenta.
   */
  gatewayPath: string;
}

/** Cuántas caras caben antes de resumir en «+N». Las mismas que en una tarea. */
const CARAS_VISIBLES = 4;

const dateFormatter = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const fechaLarga = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/**
 * Una tarjeta de la rejilla de proyectos.
 *
 * ## Por qué vive en `commons`
 *
 * Porque había **dos**, y la peor era la que veía quien entraba. Esta —con
 * monograma, caras del equipo y aviso de suspensión— vivía en `projects-front`;
 * el panel tenía la suya, que era el nombre, la descripción y dos contadores.
 * Así que el mismo proyecto tenía dos caras según la pantalla desde la que se
 * mirase, y la del panel no dejaba reconocerlo de un vistazo, que es justo para
 * lo que existe el monograma.
 *
 * Lo que cambia de una zona a otra —a dónde lleva el enlace, si es navegación
 * interna o entre apps, y por qué proxy salen las fotos— entra por props. Ver
 * `href`, `sameZone` y `gatewayPath`.
 *
 * ## Por qué un monograma de color
 *
 * Doce tarjetas iguales en una rejilla se distinguen **leyendo el título de cada
 * una**, que es justo lo que no se hace al buscar algo con la vista. El
 * monograma le da a cada proyecto una cara fija —mismo color y mismas iniciales
 * siempre— y la posición en la rejilla se aprende sola.
 *
 * Lo pinta `ProjectMonogram`, que vive en `atoms` desde que la bandeja de
 * Mensajes enseña el mismo: el porqué del color y de las letras está allí.
 *
 * ## Qué fecha se enseña, y por qué no «última actividad»
 *
 * `createdAt`, que además es por lo que el backend ordena la lista
 * (`orderBy: { createdAt: 'desc' }`, fijo en `findAllProjects`). ⚠️ **`updatedAt`
 * no vale como «actividad»**: es la marca de la fila del proyecto, así que se
 * mueve al renombrarlo o al suspenderlo, y **no** cuando alguien crea una tarea
 * o comenta. Llamarlo actividad sería enseñar «hace 3 meses» en el proyecto
 * donde más se trabaja.
 */
export function ProjectCard({
  project,
  currentUserId,
  equipo,
  href,
  sameZone = false,
  gatewayPath,
}: ProjectCardProps) {
  const suspendido = project.status === 'SUSPENDED';
  const eresElDueno = project.ownerId === currentUserId;

  /* La misma tarjeta con dos envoltorios. Se elige aquí y no con un
     `const Wrapper = sameZone ? Link : 'a'` porque las props de `Link` y las de
     `<a>` no son el mismo tipo, y unificarlas obliga a un `any` que se lleva por
     delante la comprobación de la única prop que importa. */
  const clase =
    'group flex h-full flex-col gap-4 rounded-sm border border-border bg-surface p-5 transition-all duration-150 hover:-translate-y-0.5 hover:border-border-strong hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

  const cuerpo = (
    <>
      <div className="flex items-start gap-3">
        <ProjectMonogram
          id={project.id}
          name={project.name}
          iconKey={project.iconKey ?? null}
          color={project.color ?? null}
          size="md"
          apagado={suspendido}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="truncate font-sans text-base font-semibold text-text-primary">
            {project.name}
          </h3>
          <span className="font-sans text-xs text-white">
            {eresElDueno ? 'Tuyo' : 'Te añadieron'}
          </span>
        </div>

        {/* Suspendido pesa más que «de quién es»: cambia lo que se puede hacer
              al entrar, y saberlo antes evita abrir el proyecto para descubrir
              que ningún botón responde. Una sola insignia, para no convertir la
              tarjeta en una fila de etiquetas — y «de quién es» ya lo dice la
              línea de debajo del nombre, que no gasta insignia. */}
        {suspendido && (
          <span className="shrink-0 border border-border px-2 py-0.5 rounded-sm font-sans text-xs text-white">
            SUSPENDIDO
          </span>
        )}
      </div>

      {project.description ? (
        <p className="line-clamp-2 font-sans text-sm text-white">{project.description}</p>
      ) : (
        <p className="font-sans text-sm italic text-white">Sin descripción</p>
      )}

      {/**
       * El motivo de la suspensión, aquí y no solo dentro.
       *
       * `suspendedReason` viene en esta misma respuesta —el `omit` del servicio
       * solo esconde `suspendedBy`— y antes no se usaba: había que abrir el
       * proyecto para leer por qué no responde nada. Un aviso que se puede dar
       * antes de entrar es un viaje menos.
       */}
      {suspendido && project.suspendedReason && (
        <p
          className="line-clamp-2 rounded-sm px-2.5 py-1.5 font-sans text-xs"
          style={{
            background: 'transparent',
            border: `1px solid ${colors.border}`,
            color: colors.textSecondary,
          }}
        >
          {project.suspendedReason}
        </p>
      )}

      <div
        className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3"
        style={{ borderColor: alpha(colors.border, 70) }}
      >
        {equipo && equipo.length > 0 ? (
          <Equipo
            equipo={equipo}
            total={project._count.members}
            currentUserId={currentUserId}
            gatewayPath={gatewayPath}
          />
        ) : (
          <Dato
            valor={project._count.members}
            singular="miembro"
            plural="miembros"
            icono={<IconoMiembros />}
          />
        )}
        <Dato
          valor={project._count.workspaces}
          singular="espacio"
          plural="espacios"
          icono={<IconoEspacios />}
        />
        <span
          className="ml-auto font-sans text-xs text-white"
          title={`Creado el ${fechaLarga.format(new Date(project.createdAt))}`}
        >
          {dateFormatter.format(new Date(project.createdAt))}
        </span>
      </div>
    </>
  );

  return (
    <li>
      {sameZone ? (
        <Link href={href} className={clase}>
          {cuerpo}
        </Link>
      ) : (
        <a href={href} className={clase}>
          {cuerpo}
        </a>
      )}
    </li>
  );
}

/**
 * Las caras del equipo, solapadas.
 *
 * ## Por qué caras y no un número
 *
 * «4 miembros» dice cuántos son; las caras dicen **quiénes**, que es lo que se
 * quiere saber para reconocer un proyecto de un vistazo en una rejilla. Es el
 * mismo gesto que ya hace la tarjeta de tarea con los encargados —mismo tamaño,
 * mismo solape, mismo tope de cuatro— así que no hay un idioma nuevo que
 * aprenderse.
 *
 * ⚠️ **El total sale de `_count.members`, no de las caras resueltas.** Si el
 * perfil de alguien no se pudo leer, su cara se cae de la lista pero sigue
 * contando en el «+N»: enseñar «+1» cuando faltan dos sería mentir sobre el
 * tamaño del equipo por un fallo de red.
 *
 * Sin punto de presencia, igual que en las tareas: cuatro círculos de 24 px
 * solapados y el punto de cada uno taparía la cara del siguiente. Aquí importa
 * quién está, no si está comiendo.
 */
function Equipo({
  equipo,
  total,
  currentUserId,
  gatewayPath,
}: { equipo: UserProfile[]; total: number; currentUserId: string; gatewayPath: string }) {
  const visibles = equipo.slice(0, CARAS_VISIBLES);
  const restantes = Math.max(0, total - visibles.length);

  return (
    <span
      className="flex items-center"
      title={`${total} ${total === 1 ? 'miembro' : 'miembros'}`}
      aria-label={`${total} ${total === 1 ? 'miembro' : 'miembros'}`}
    >
      <span className="flex items-center -space-x-1.5">
        {visibles.map((persona) => {
          const eresTu = persona.id === currentUserId;
          return (
            <Avatar
              key={persona.id}
              label={personLabel(persona)}
              title={eresTu ? `${personLabel(persona)} — eres tú` : personLabel(persona)}
              mine={eresTu}
              ring
              /* Con `-space-x-1.5` los círculos se solapan y el de después tapa
                 al anterior: ir primero en el DOM no basta para verse entero,
                 hay que subirlo de capa. Mismo apaño que en `TaskCard`. */
              className={eresTu ? 'relative z-10' : ''}
              src={avatarHref(persona.avatarUrl, gatewayPath)}
            />
          );
        })}
      </span>

      {restantes > 0 && <span className="pl-2 font-sans text-xs text-white">+{restantes}</span>}
    </span>
  );
}

/** Un contador del pie, con su icono. */
function Dato({
  valor,
  singular,
  plural,
  icono,
}: { valor: number; singular: string; plural: string; icono: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 font-sans text-xs text-white">
      <span className="text-white">{icono}</span>
      <span className="font-semibold text-text-primary">{valor}</span>
      {valor === 1 ? singular : plural}
    </span>
  );
}

/**
 * El tono del monograma, estable para un proyecto dado.
 *
 * Suma de códigos de carácter contra el número de tonos. No hace falta una
 * función hash de verdad: lo único que se le pide es ser **determinista** —el
 * mismo proyecto, el mismo color en todas las pantallas y en todas las
 * sesiones— y repartir razonablemente los seis tonos entre proyectos con ids
 * aleatorios, que es lo que un UUID garantiza de sobra.
 */
function IconoMiembros() {
  return (
    <svg
      className="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16 19v-1a4 4 0 00-4-4H6a4 4 0 00-4 4v1M12 7a3 3 0 11-6 0 3 3 0 016 0zM22 19v-1a4 4 0 00-3-3.9M16 4.1a4 4 0 010 7.8"
      />
    </svg>
  );
}

function IconoEspacios() {
  return (
    <svg
      className="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden="true"
    >
      <rect x="3.5" y="4" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="4" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="14" width="7" height="6" rx="1.5" />
      <rect x="13.5" y="14" width="7" height="6" rx="1.5" />
    </svg>
  );
}
