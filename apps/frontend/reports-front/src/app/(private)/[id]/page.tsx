import { SyntheticBanner } from '@/components/molecules/ChartCard';
import { NoReportsAccess } from '@/components/molecules/NoReportsAccess';
import { GeneratedChart } from '@/components/organisms/Charts';
import { ProjectPicker } from '@/components/organisms/ProjectPicker';
import {
  CicloWidget,
  FlujoWidget,
  PersonasWidget,
  PorColumnaWidget,
  PorPrioridadWidget,
  PrediccionWidget,
  ResumenWidget,
  TiemposWidget,
} from '@/components/organisms/ReportWidgets';
import { AnalysisScreen } from '@/components/templates/AnalysisScreen';
import type { AssistantQuota } from '@/lib/assistant';
import { avisoDeSemanaIncompleta, construirDatos } from '@/lib/generado';
import type {
  ReportBlocked,
  ReportCycleTime,
  ReportFlow,
  ReportForecast,
  ReportPerson,
  ReportSnapshot,
  ReportWeekly,
} from '@/lib/reports';
import { type Widget, informesNecesarios } from '@/lib/widgets';
import {
  AppHeader,
  type EffectivePermissions,
  type Label,
  type Paginated,
  type Project,
  type ProjectDetail,
  type ProjectMember,
  type UserProfile,
  nombreDePersona,
  personLabel,
  resolverPerfiles,
} from '@praxis/commons';
import { createServerApiClient } from '@praxis/commons/auth';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { guardarLienzoAction } from './actions';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const project = await createServerApiClient().get<ProjectDetail>(`/projects/${id}`);
    return { title: `${project.name}` };
  } catch {
    return { title: 'Análisis' };
  }
}

/** Lo que devuelven las dos rutas del lienzo. */
interface LienzoGuardado {
  widgets: Widget[];
  actualizadoEn: string | null;
}

/**
 * Análisis: un **lienzo configurable**, no cinco informes fijos.
 *
 * ## Qué cambió respecto a la versión anterior
 *
 * La pantalla pintaba los cinco informes, todos, siempre, en un orden que nadie
 * eligió. En un proyecto sin historial —que es todo proyecto durante sus
 * primeras semanas— eso significaba tres avisos de «no hay suficientes datos» al
 * abrirla: la pantalla se disculpaba antes de servir para nada. Y quien quería
 * ver primero lo que a su equipo le importaba no podía.
 *
 * Ahora el lienzo arranca vacío y cada cual pone lo que quiere, donde quiere y
 * del tamaño que quiere. Es **de la persona, no del proyecto**: nadie ve el tuyo
 * ni tú el suyo, así que reorganizarlo no necesita ningún permiso más allá del
 * que ya te dejó entrar.
 *
 * ## Y el coste de carga se ha invertido
 *
 * Antes se pedían los cinco informes en cada carga, dos de ellos recorriendo el
 * historial, hubiera o no algo que enseñar con ellos. Ahora **se mira el lienzo
 * primero y se pide solo lo que come**: un lienzo vacío cuesta la instantánea y
 * nada más, y uno con la instantánea puesta no paga el recorrido del historial.
 *
 * Eso obliga a **dos viajes en serie** —el lienzo y después sus informes— donde
 * antes había uno. Se acepta: el primero es una lectura por clave primaria de una
 * tabla de preferencias, y lo que ahorra el segundo es de otro orden de magnitud.
 */
export default async function ProjectReportsPage({ params }: PageProps) {
  const { id } = await params;
  const api = createServerApiClient();

  const project = await api.get<ProjectDetail>(`/projects/${id}`).catch(() => null);
  if (!project) return notFound();

  /**
   * El UUID, resuelto, en una constante propia.
   *
   * ⚠️ **La ruta puede traer el slug**, y solo `GET /projects/:id` lo traduce:
   * todo lo anidado —informes, permisos, lienzo, asistente— espera el UUID, y
   * pasarle el slug no da error de compilación, da un 403.
   *
   * Va en una constante y no se lee de `project` dentro de la Server Action de
   * abajo porque el `'use server'` corta el estrechamiento de tipos: allí
   * `project` vuelve a ser `ProjectDetail | null` y haría falta un `!` que
   * afirma algo que ya se comprobó tres líneas antes.
   */
  const projectId = project.id;

  /**
   * `canViewReports` es la puerta del informe entero, no solo del desglose por
   * persona: sin él no hay agregados, ni tabla de personas, ni asistente.
   *
   * Se comprueba aquí aunque el gateway ya lo exija en las nueve rutas, porque
   * los `Promise.all` de abajo caerían en cascada a `null` y la pantalla
   * enseñaría tarjetas rotas en vez de decir qué pasa. El guard es la
   * seguridad; esto es la explicación.
   */
  const effective = await api.get<EffectivePermissions>(`/projects/${projectId}/permissions/me`);
  if (!effective.permissions.canViewReports) {
    return (
      <AppHeader title="Análisis">
        <NoReportsAccess projectName={project.name} />
      </AppHeader>
    );
  }

  /**
   * Primero el lienzo, porque decide todo lo demás.
   *
   * Va junto con lo que no depende de él: el selector, los miembros, las
   * etiquetas y la cuota, que hacen falta con lienzo y sin él.
   */
  const [lienzo, proyectos, members, etiquetas, cuota] = await Promise.all([
    api
      .get<LienzoGuardado>(`/projects/${projectId}/reports/layout`)
      /* Un lienzo que no se puede leer se trata como vacío, no como un error:
         perder la disposición es molesto, perder la pantalla entera es peor. */
      .catch(() => ({ widgets: [] as Widget[], actualizadoEn: null })),
    /* El selector solo ofrece lo que se puede abrir. `permission` filtra en la
       consulta, así que no hace falta preguntar por los permisos de cada
       proyecto uno a uno para acabar descartando casi todos. */
    api
      .get<Paginated<Project>>('/projects?limit=100&permission=canViewReports')
      .catch(() => ({ items: [] as Project[], total: 0 })),
    /* Los miembros y el directorio piden solo `canViewProject`: el asistente
       necesita poner nombre a un `userId` para pintar una propuesta. */
    api
      .get<ProjectMember[]>(`/projects/${projectId}/members`)
      .catch(() => []),
    /* El vocabulario con el que el modelo clasifica: en la propuesta viaja el
       id, y la tarjeta tiene que enseñar el nombre. */
    api
      .get<Label[]>(`/projects/${projectId}/labels`)
      .catch(() => [] as Label[]),
    /* La cuota, al cargar y antes de escribir nada: poner el coste a la vista
       de quien lo gasta evita encontrarse el límite de golpe. */
    api
      .get<AssistantQuota>(`/projects/${projectId}/assistant/quota`)
      .catch(() => null),
  ]);

  const widgets = lienzo.widgets;
  const necesarios = informesNecesarios(widgets);

  /**
   * La instantánea se pide **siempre**, aunque el lienzo no la use.
   *
   * Es la única que sabe si el historial de este proyecto está fabricado, y ese
   * aviso no puede depender de qué gráficos tenga puesto cada cual: durante una
   * demostración nadie distingue un dato medido de uno generado, y quien lo vea
   * se llevará una conclusión falsa sobre gente real. Es además la más barata:
   * es una foto del momento y no recorre el historial.
   */
  const [snapshot, flow, cycle, forecast, people, blocked, weekly] = await Promise.all([
    api.get<ReportSnapshot>(`/projects/${projectId}/reports/snapshot`).catch(() => null),
    pedirSi(necesarios.has('flow'), () =>
      api.get<ReportFlow>(`/projects/${projectId}/reports/flow?days=60`),
    ),
    pedirSi(necesarios.has('cycle'), () =>
      api.get<ReportCycleTime>(`/projects/${projectId}/reports/cycle-time`),
    ),
    pedirSi(necesarios.has('forecast'), () =>
      api.get<ReportForecast>(`/projects/${projectId}/reports/forecast`),
    ),
    pedirSi(necesarios.has('people'), () =>
      api.get<ReportPerson[]>(`/projects/${projectId}/reports/people`),
    ),
    pedirSi(necesarios.has('blocked'), () =>
      api.get<ReportBlocked>(`/projects/${projectId}/reports/blocked`),
    ),
    pedirSi(necesarios.has('weekly'), () =>
      api.get<ReportWeekly>(`/projects/${projectId}/reports/weekly`),
    ),
  ]);

  /**
   * Los perfiles de quienes salen en esta pantalla, en **una** petición.
   *
   * ⚠️ Esto pedía `/users?limit=100` y cruzaba en memoria — la primera página del
   * directorio de toda la plataforma, con el `limit` topado en 100 por el DTO.
   * Con más de cien cuentas, los miembros de este proyecto dejaban de caber ahí y
   * el asistente pintaba propuestas con el UUID en crudo donde va un nombre.
   *
   * ⚠️ **Y el arreglo de aquello dejó un N+1** (E6.1): pasó a pedir
   * `/users/<id>` **uno por uno**, con un `.catch(() => null)` por medio. Un
   * proyecto de veinte personas eran veinte peticiones por carga, todas con la
   * IP del servidor de Next, así que el limitador del gateway las contaba en el
   * mismo cubo que las de todo el mundo; al pasarse, el 429 se lo tragaba el
   * `catch` y la pantalla escribía «Alguien que ya no está» sobre gente que
   * estaba perfectamente. Es exactamente el fallo que documenta
   * `commons/api/directorio.ts`, que es donde vive el arreglo bueno.
   */
  const directorio = await resolverPerfiles(api, [
    ...members.map((m) => m.userId),
    project.ownerId,
  ]);

  const usersById = directorio.perfiles;

  /**
   * `userId` → nombre, para que una propuesta no hable en UUID.
   *
   * Vía `nombreDePersona` y no con un literal: distingue «esta cuenta ya no
   * existe» de «no se pudo preguntar al directorio», que antes se leían igual.
   */
  const nombres = Object.fromEntries(
    members.map((miembro) => {
      return [miembro.userId, nombreDePersona(directorio, miembro.userId)];
    }),
  );
  const nombresDeEtiquetas = Object.fromEntries(
    etiquetas.map((etiqueta) => [etiqueta.id, etiqueta.name]),
  );

  /**
   * El contenido de cada widget, renderizado aquí y entregado al lienzo por id.
   *
   * Es la regla del repo llevada a la cuadrícula: **la lógica de negocio vive en
   * la page** y el organismo recibe `ReactNode`. El lienzo mueve cajas y no sabe
   * qué hay dentro; los gráficos siguen siendo las mismas islas de Recharts que
   * ya existían, sin enterarse de que ahora viven en una cuadrícula.
   */
  const slots: Record<string, ReactNode> = {};
  for (const widget of widgets) {
    slots[widget.id] = contenidoDe(widget);
  }

  function contenidoDe(widget: Widget): ReactNode {
    switch (widget.tipo) {
      case 'resumen':
        return snapshot ? <ResumenWidget snapshot={snapshot} /> : <NoDisponible />;
      case 'por_columna':
        return snapshot ? <PorColumnaWidget snapshot={snapshot} /> : <NoDisponible />;
      case 'por_prioridad':
        return snapshot ? <PorPrioridadWidget snapshot={snapshot} /> : <NoDisponible />;
      case 'flujo':
        return <FlujoWidget flow={flow} />;
      case 'tiempos':
        return <TiemposWidget cycle={cycle} />;
      case 'ciclo':
        return <CicloWidget cycle={cycle} />;
      case 'prediccion':
        return <PrediccionWidget forecast={forecast} />;
      case 'personas':
        return people ? (
          <PersonasWidget people={people} members={members} usersById={usersById} />
        ) : (
          <NoDisponible />
        );
      case 'generado': {
        if (!widget.grafico) return <NoDisponible />;
        const datos = construirDatos(
          widget.grafico,
          { snapshot, people, blocked, flow, weekly },
          { personas: nombres, etiquetas: nombresDeEtiquetas },
        );
        /* El aviso de la semana a medias viaja con el gráfico, no dentro de
           `construirDatos`: es algo que hay que decir sobre el dato, no una
           forma de recortarlo. */
        const aviso =
          widget.grafico.metrica === 'cierres_por_semana' ||
          widget.grafico.metrica === 'creadas_por_semana'
            ? avisoDeSemanaIncompleta(weekly)
            : null;
        return <GeneratedChart datos={datos} forma={widget.grafico.forma} aviso={aviso} />;
      }
      default:
        return <NoDisponible />;
    }
  }

  /* La acción llega al cliente ya atada a este proyecto: el lienzo no tiene por
     qué saber contra qué proyecto guarda, y así no puede equivocarse de uno. */
  async function guardar(siguientes: Widget[]) {
    'use server';
    return guardarLienzoAction(projectId, siguientes);
  }

  return (
    /* Igual que en Proyectos: el nombre del proyecto ya encabeza la página.
       Aquí va el nombre de la sección, el mismo que en la barra lateral. */
    <AppHeader title="Análisis">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h2 className="font-display text-3xl text-text-primary sm:text-4xl">
              Cómo va el trabajo
            </h2>
            <p className="max-w-2xl font-serif text-lg italic text-text-secondary">
              Monta la vista que necesites. Se guarda y te espera la próxima vez.
            </p>
          </div>

          {/* El id resuelto, no el parámetro de la ruta: el selector busca cuál
              de los proyectos es el activo, y comparando contra el slug de la
              URL no encontraba ninguno. */}
          <ProjectPicker projects={proyectos.items} activeId={project.id} />
        </div>

        {snapshot && snapshot.eventosSinteticos > 0 && (
          <SyntheticBanner eventos={snapshot.eventosSinteticos} />
        )}

        {/* `project.id` y no el parámetro de la ruta: las acciones del asistente
            llaman a `/projects/:projectId/assistant/...`, que espera el UUID.
            Con el slug de la URL respondían 403. */}
        <AnalysisScreen
          projectId={projectId}
          lienzoInicial={widgets}
          slots={slots}
          guardar={guardar}
          cuotaInicial={cuota}
          nombres={nombres}
          etiquetas={nombresDeEtiquetas}
        />
      </div>
    </AppHeader>
  );
}

/**
 * Pide un informe **solo si el lienzo lo necesita**.
 *
 * Devuelve `null` sin llamar a nadie cuando no hace falta, y también cuando la
 * llamada falla: perder un gráfico es mucho mejor que perder el informe
 * completo, que es el mismo criterio que ya usaba el tablero con sus tareas.
 */
function pedirSi<T>(necesario: boolean, pedir: () => Promise<T>): Promise<T | null> {
  if (!necesario) return Promise.resolve(null);
  return pedir().catch(() => null);
}

/** El informe de este gráfico no se pudo leer. Los demás siguen en pie. */
function NoDisponible() {
  return (
    <div className="flex h-full min-h-24 items-center justify-center px-4 text-center">
      <p className="font-sans text-sm text-text-disabled">
        No se pudo cargar este informe. Vuelve a intentarlo en un momento.
      </p>
    </div>
  );
}
