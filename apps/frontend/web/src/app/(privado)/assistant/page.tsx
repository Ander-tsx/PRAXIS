import { PraxScreen } from '@/components/templates/PraxScreen';
import {
  AppHeader,
  type AssistantQuota,
  type Label,
  PRAX_NAME,
  type Paginated,
  type Project,
  type ProjectMember,
  type UserProfile,
  firstNameOf,
  personName,
  resolveProfiles,
} from '@praxis/commons';
import { createServerApiClient, loadPrivateChrome } from '@praxis/commons/auth';
import type { Metadata } from 'next';

/**
 * ⚠️ **La pestaña dice «Asistente», no «PRAX».**
 *
 * El nombre propio funciona dentro de la aplicación, donde ya hay contexto y una
 * cara al lado. En la pestaña del navegador —entre otras quince— «PRAX | Praxis»
 * no dice de qué va, y quien lo lea sin haber entrado nunca no puede saberlo.
 * Dentro de la pantalla PRAX sigue llamándose PRAX.
 */
export const metadata: Metadata = { title: 'Asistente' };

interface PageProps {
  /**
   * `p` es el **slug** del proyecto en foco; `c`, la conversación abierta.
   *
   * Los dos en la URL y no en estado de cliente: así una conversación sobre un
   * proyecto concreto es un enlace que se puede pegar, el botón atrás devuelve al
   * proyecto anterior, y —lo que de verdad importa— **cambiar de foco puede
   * navegar sin perder el hilo**, porque el hilo viaja en `c` y vive en la base.
   */
  searchParams: Promise<{ p?: string; c?: string }>;
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
  const { p, c } = await searchParams;
  const api = createServerApiClient();

  /**
   * ⚠️ **No se atrapa el fallo, y es a propósito.**
   *
   * Una lista vacía en esta pantalla se lee como «no tienes ningún proyecto del
   * que hablar», que con el gateway caído es una afirmación falsa y manda a la
   * gestión equivocada. Que lance y lo recoja `error.tsx`, que dice que fue un
   * corte y ofrece reintentar. Mismo criterio que la puerta de Análisis.
   */
  /* 🔴 **Solo los de la organización activa** (O4 de docs/PLAN-PRAX-SEMIAGENTICO.md).
     Sin el filtro, el selector mezclaba proyectos de todas las organizaciones,
     y hablar desde una de un proyecto de otra ahora da 403 `NOT_IN_ORG`: el
     selector ofrecía puertas cerradas. `loadPrivateChrome` ya lo resolvió el
     layout y no cuesta otra petición. */
  const { organizacionActivaId } = await loadPrivateChrome();
  const listaPromesa = api.get<Paginated<Project>>(
    `/projects?limit=100&permission=canViewReports${
      organizacionActivaId ? `&organizationId=${organizacionActivaId}` : ''
    }`,
  );

  /**
   * Con qué saludar.
   *
   * ⚠️ **`/users/me` suelto y no `loadCurrentUser()`**, que es lo que pedía el
   * cuerpo. Aquel trae además los roles globales —otra petición— y aquí lo único
   * que se usa es el nombre de pila. El armazón ya resolvió el usuario en su
   * `layout.tsx`, pero nada lo deduplica entre layout y page, así que lo barato
   * es pedir solo lo que hace falta y que viaje **en paralelo** con la lista.
   *
   * Degrada: sin nombre, PRAX saluda sin nombre. No poder decir «Andrés» no es
   * motivo para dejar a nadie sin pantalla.
   */
  const perfilPromesa = api.get<UserProfile>('/users/me').catch(() => null);

  const [conAcceso, perfil] = await Promise.all([listaPromesa, perfilPromesa]);
  const nombreCorto = perfil ? firstNameOf(perfil) : undefined;

  const proyectos = conAcceso.items;

  /**
   * El foco, si la URL trae uno.
   *
   * ⚠️ **Ya no cae al primer proyecto**, y ese es el cambio. Antes se elegía uno
   * por ti al entrar —el primero de la lista— y la conversación nacía atada a él
   * sin que nadie lo hubiera decidido. Ahora entrar sin `?p=` es un estado
   * legítimo: PRAX saluda y pregunta por cuál, con los proyectos como botones.
   *
   * Un `?p=` que apunte a un proyecto ajeno o inexistente no da error: se queda
   * sin foco y se vuelve a preguntar, que es mejor que una pantalla de fallo por
   * un enlace viejo.
   */
  const activo = proyectos.find((proyecto) => proyecto.slug === p) ?? null;
  const projectId = activo?.id ?? null;

  /**
   * Lo que la conversación necesita para no hablar en UUID.
   *
   * Los tres degradan por su cuenta: sin nombres, una propuesta enseña el id;
   * sin cuota, no se pinta el contador. Ninguna de las tres cosas justifica
   * quedarse sin poder preguntar.
   */
  const [members, etiquetas, cuota] = projectId
    ? await Promise.all([
        api.get<ProjectMember[]>(`/projects/${projectId}/members`).catch(() => []),
        api.get<Label[]>(`/projects/${projectId}/labels`).catch(() => [] as Label[]),
        /* La cuota del proyecto y no `/me/assistant/quota`: es la misma, pero
           esta ruta ya está en el camino y ahorra una decisión. */
        api
          .get<AssistantQuota>(`/projects/${projectId}/assistant/quota`)
          .catch(() => null),
      ])
    : /* Sin foco no hay a quién nombrar ni qué etiquetar. La cuota se pide igual
         —es del usuario, no del proyecto— por su ruta de `/me`. */
      [
        [] as ProjectMember[],
        [] as Label[],
        await api.get<AssistantQuota>('/me/assistant/quota').catch(() => null),
      ];

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
    <AppHeader title="Asistente" lleno>
      {/**
       * ⚠️ **La pantalla entera es el chat.**
       *
       * El alto lo da `lleno` de `AppHeader`, no un `calc(100dvh - …)` a mano:
       * aquel había que recalcularlo cada vez que cambiara la altura de la barra
       * o el relleno del contenedor, y se rompía en silencio — el compositor se
       * iba unos píxeles por debajo del pliegue y solo se notaba escribiendo.
       */}
      <div className="flex min-h-0 flex-1 flex-col">
        <PraxScreen
          projectId={projectId}
          proyectos={proyectos}
          conversacionInicial={c ?? null}
          cuotaInicial={cuota}
          nombres={nombres}
          etiquetas={nombresDeEtiquetas}
          userName={nombreCorto}
          organizacionActivaId={organizacionActivaId}
        />
      </div>
    </AppHeader>
  );
}
