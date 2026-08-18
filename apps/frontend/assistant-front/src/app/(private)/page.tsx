import { PraxHero } from '@/components/organisms/PraxHero';
import { PraxScreen } from '@/components/templates/PraxScreen';
import {
  AppHeader,
  type AssistantQuota,
  type Label,
  PRAX_NAME,
  type Paginated,
  type Project,
  type ProjectMember,
  personName,
  resolveProfiles,
} from '@praxis/commons';
import { createServerApiClient } from '@praxis/commons/auth';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: PRAX_NAME };

interface PageProps {
  searchParams: Promise<{ p?: string }>;
}

/**
 * La pantalla de PRAX.
 *
 * ## Por qué existe, si el asistente ya estaba en Análisis
 *
 * Porque allí es un panel al lado de los gráficos, y eso lo definía: se le
 * preguntaba **por el informe que se estaba viendo**. Pero lo que sabe hacer es
 * más que comentar percentiles —propone tareas, reparte trabajo, escribe al
 * chat del equipo, monta un checklist— y ninguna de esas cosas tiene que ver con
 * estar mirando un gráfico. Metido en una esquina de Análisis, la mitad de sus
 * capacidades no se descubrían nunca.
 *
 * Aquí la conversación **es** la pantalla, y el proyecto se elige en vez de
 * venir dado. En Análisis sigue estando, con el proyecto ya puesto, para quien
 * mira un gráfico y tiene una duda ahí mismo.
 *
 * ## El proyecto va en la URL
 *
 * `?p=<slug>`, no en estado de cliente ni en una cookie. Así una conversación
 * sobre un proyecto concreto es un enlace que se puede pegar en un mensaje, el
 * botón atrás devuelve al proyecto anterior —que es lo que se espera al estar
 * comparando dos— y esta página sigue siendo un Server Component.
 *
 * ⚠️ **Y va el `slug`, no el UUID**, por lo mismo que en Análisis: es lo que se
 * lee en la barra de direcciones. El UUID se resuelve aquí una vez y es lo que
 * viaja a la API, porque todo lo anidado bajo `/projects/:id` lo exige y pasarle
 * el slug da 403, no un error de compilación.
 *
 * ## Solo los proyectos cuyo informe puedes abrir
 *
 * `GET /projects?permission=canViewReports`, la misma consulta que usa Análisis.
 * No es una restricción inventada aquí: `POST /projects/:id/assistant/chat` pide
 * ese permiso en el gateway, así que ofrecer un proyecto sin él sería ofrecer una
 * conversación que responde 403 a la primera pregunta.
 */
export default async function AssistantPage({ searchParams }: PageProps) {
  const { p } = await searchParams;
  const api = createServerApiClient();

  /**
   * ⚠️ **No se atrapa el fallo, y es a propósito.**
   *
   * Una lista vacía en esta pantalla se lee como «no tienes ningún proyecto del
   * que hablar», que con el gateway caído es una afirmación falsa y manda a la
   * gestión equivocada. Que lance y lo recoja `error.tsx`, que dice que fue un
   * corte y ofrece reintentar. Mismo criterio que la puerta de Análisis.
   */
  const conAcceso = await api.get<Paginated<Project>>(
    '/projects?limit=100&permission=canViewReports',
  );

  const proyectos = conAcceso.items;

  /* El de la URL si existe y se puede abrir; si no, el primero. Un `?p=` que
     apunte a un proyecto ajeno no da error: simplemente cae al primero, que es
     mejor que una pantalla de fallo por un enlace viejo. */
  const activo = proyectos.find((proyecto) => proyecto.slug === p) ?? proyectos[0] ?? null;

  if (!activo) {
    return (
      <AppHeader title={PRAX_NAME}>
        <div className="flex flex-col gap-6">
          <PraxHero />
          <SinProyectos />
        </div>
      </AppHeader>
    );
  }

  const projectId = activo.id;

  /**
   * Lo que la conversación necesita para no hablar en UUID.
   *
   * Los tres degradan por su cuenta: sin nombres, una propuesta enseña el id;
   * sin cuota, no se pinta el contador. Ninguna de las tres cosas justifica
   * quedarse sin poder preguntar.
   */
  const [members, etiquetas, cuota] = await Promise.all([
    api.get<ProjectMember[]>(`/projects/${projectId}/members`).catch(() => []),
    api.get<Label[]>(`/projects/${projectId}/labels`).catch(() => [] as Label[]),
    api.get<AssistantQuota>(`/projects/${projectId}/assistant/quota`).catch(() => null),
  ]);

  /**
   * Los perfiles, en **una** petición.
   *
   * Ver `commons/api/directory.ts` para el fallo que evita hacerlo de uno en
   * uno: veinte miembros eran veinte llamadas con la IP del servidor de Next,
   * todas en el mismo cubo del limitador, y el 429 se leía como «esta cuenta ya
   * no existe» sobre gente que estaba perfectamente.
   */
  const directorio = await resolveProfiles(
    api,
    members.map((miembro) => miembro.userId),
  );

  const nombres = Object.fromEntries(
    members.map((miembro) => [miembro.userId, personName(directorio, miembro.userId)]),
  );
  const nombresDeEtiquetas = Object.fromEntries(
    etiquetas.map((etiqueta) => [etiqueta.id, etiqueta.name]),
  );

  return (
    <AppHeader title={PRAX_NAME}>
      <div className="flex flex-col gap-6">
        <PraxHero />

        <PraxScreen
          projectId={projectId}
          proyectos={proyectos}
          cuotaInicial={cuota}
          nombres={nombres}
          etiquetas={nombresDeEtiquetas}
        />
      </div>
    </AppHeader>
  );
}

/**
 * Sin ningún proyecto del que hablar.
 *
 * ⚠️ **Dos motivos distintos caben aquí y no se distinguen**, al revés que en la
 * puerta de Análisis: puede que no estés en ningún proyecto, o que estés en
 * varios y en ninguno tengas `canViewReports`. Allí se separan porque llevan a
 * gestiones distintas —pedir que te añadan, o pedir el permiso—, y aquí se ha
 * preferido una sola frase que cubre las dos: PRAX no es la pantalla donde
 * alguien va a diagnosticar sus permisos, y mandarlo a Análisis es donde eso sí
 * está explicado.
 */
function SinProyectos() {
  return (
    <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
      <p className="font-display text-lg text-text-primary">
        Todavía no hay ningún proyecto del que hablar
      </p>
      <p className="mx-auto mt-1 max-w-md font-sans text-sm text-text-secondary">
        {PRAX_NAME} responde con los datos de un proyecto concreto, así que necesita que estés en al
        menos uno y que puedas abrir su análisis. {/* Cruza de zona → `<a>` duro. Ver §16. */}
        <a
          href="/projects"
          className="text-primary underline-offset-2 transition-colors hover:underline"
        >
          Ir a Proyectos
        </a>
        .
      </p>
    </div>
  );
}
