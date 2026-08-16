import {
  Avatar,
  Badge,
  type Project,
  type UserProfile,
  alpha,
  colors,
  hrefDeAvatar,
  iniciales,
  personLabel,
  projectPath,
  serieColors,
} from '@praxis/commons';
import Link from 'next/link';

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
 * ## Por qué un monograma de color
 *
 * Doce tarjetas iguales en una rejilla se distinguen **leyendo el título de cada
 * una**, que es justo lo que no se hace al buscar algo con la vista. El
 * monograma le da a cada proyecto una cara fija —mismo color y mismas iniciales
 * siempre— y la posición en la rejilla se aprende sola.
 *
 * El color sale de `serieColors`, que existe exactamente para esto: «categorías
 * **que no tienen color propio**», medidas para distinguirse entre sí bajo
 * daltonismo y con los mismos hexadecimales en los dos temas. Un proyecto no
 * tiene color propio, así que no se inventa uno nuevo ni se reutiliza el de los
 * estados —`success` y `error` significan algo, y teñir un proyecto de rojo por
 * azar diría que pasa algo—.
 *
 * ⚠️ **El tono sale del `id`, no del nombre.** El `id` es inmutable; el nombre
 * no, y con el nombre el proyecto cambiaría de color al renombrarlo, que es
 * cuando más falta hace reconocerlo. Las iniciales sí salen del nombre —son
 * texto, y deben decir lo que se ve—.
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
export function ProjectCard({ project, currentUserId, equipo }: ProjectCardProps) {
  const suspendido = project.status === 'SUSPENDED';
  const eresElDueno = project.ownerId === currentUserId;
  const tono = tonoDe(project.id);

  return (
    <li>
      {/* Misma zona → next/link, sin el basePath: Next añade /projects. */}
      <Link
        href={projectPath(project)}
        className="group flex h-full flex-col gap-4 rounded-2xl border border-border bg-surface p-5 transition-all duration-150 hover:-translate-y-0.5 hover:border-border-strong hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-sans text-sm font-semibold uppercase transition-colors"
            style={{
              /* Suspendido, el monograma se apaga a gris: la tarjeta entera
                 tiene que leerse como «esto está parado», y un color de marca
                 vivo dice lo contrario. */
              background: suspendido ? alpha(colors.textSecondary, 14) : alpha(tono, 16),
              color: suspendido ? colors.textDisabled : tono,
              boxShadow: `inset 0 0 0 1px ${alpha(suspendido ? colors.textSecondary : tono, 30)}`,
            }}
          >
            {iniciales(project.name)}
          </span>

          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h3 className="truncate font-sans text-base font-semibold text-text-primary">
              {project.name}
            </h3>
            <span className="font-sans text-xs text-text-disabled">
              {eresElDueno ? 'Tuyo' : 'Te añadieron'}
            </span>
          </div>

          {/* Suspendido pesa más que «de quién es»: cambia lo que se puede hacer
              al entrar, y saberlo antes evita abrir el proyecto para descubrir
              que ningún botón responde. Una sola insignia, para no convertir la
              tarjeta en una fila de etiquetas — y «de quién es» ya lo dice la
              línea de debajo del nombre, que no gasta insignia. */}
          {suspendido && (
            <Badge variant="error" className="shrink-0">
              SUSPENDIDO
            </Badge>
          )}
        </div>

        {project.description ? (
          <p className="line-clamp-2 font-sans text-sm text-text-secondary">
            {project.description}
          </p>
        ) : (
          <p className="font-sans text-sm italic text-text-disabled">Sin descripción</p>
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
            className="line-clamp-2 rounded-lg px-2.5 py-1.5 font-sans text-xs"
            style={{ background: alpha(colors.error, 8), color: colors.error }}
          >
            {project.suspendedReason}
          </p>
        )}

        <div
          className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3"
          style={{ borderColor: alpha(colors.border, 70) }}
        >
          {equipo && equipo.length > 0 ? (
            <Equipo equipo={equipo} total={project._count.members} currentUserId={currentUserId} />
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
            className="ml-auto font-sans text-xs text-text-disabled"
            title={`Creado el ${fechaLarga.format(new Date(project.createdAt))}`}
          >
            {dateFormatter.format(new Date(project.createdAt))}
          </span>
        </div>
      </Link>
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
}: { equipo: UserProfile[]; total: number; currentUserId: string }) {
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
              src={hrefDeAvatar(persona.avatarUrl, '/projects/api/gateway')}
            />
          );
        })}
      </span>

      {restantes > 0 && (
        <span className="pl-2 font-sans text-xs text-text-secondary">+{restantes}</span>
      )}
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
    <span className="flex items-center gap-1.5 font-sans text-xs text-text-secondary">
      <span className="text-text-disabled">{icono}</span>
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
function tonoDe(id: string): string {
  let suma = 0;
  for (let i = 0; i < id.length; i += 1) suma += id.charCodeAt(i);
  return serieColors[suma % serieColors.length];
}

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
