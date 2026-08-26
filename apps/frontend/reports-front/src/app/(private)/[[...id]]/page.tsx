import { NoReportsAccess } from '@/components/molecules/NoReportsAccess';
import { AnalysisFilters } from '@/components/organisms/AnalysisFilters';
import { GeneratedChart } from '@/components/organisms/Charts';
import {
  CicloWidget,
  DinamicaWidget,
  FlujoWidget,
  PersonasWidget,
  PorColumnaWidget,
  PorPrioridadWidget,
  PrediccionWidget,
  ResumenWidget,
  TiempoPorColumnaWidget,
  TiemposWidget,
} from '@/components/organisms/ReportWidgets';
import { AnalysisScreen } from '@/components/templates/AnalysisScreen';
import { avisoDeDiasNaturales, avisoDeSemanaIncompleta, construirDatos } from '@/lib/generado';
import {
  type ReportBlocked,
  type ReportColumnTime,
  type ReportCycleTime,
  type ReportDynamics,
  type ReportFlow,
  type ReportForecast,
  type ReportPerson,
  type ReportSnapshot,
  type ReportWeekly,
  filtrosAQuery,
  filtrosDesdeUrl,
} from '@/lib/reports';
import { type Widget, lienzoPorDefecto, parteDeCruce, partesNecesarias } from '@/lib/widgets';
import {
  AppHeader,
  type AssistantQuota,
  type EffectivePermissions,
  type Label,
  type Paginated,
  type Project,
  type ProjectDetail,
  type ProjectMember,
  ProjectPicker,
  personName,
  reportPath,
  resolveProfiles,
} from '@praxis/commons';
import { createServerApiClient } from '@praxis/commons/auth';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { guardarLienzoAction } from './actions';

/**
 * ⚠️ **Catch-all opcional, y ahí está el arreglo de la pantalla negra.**
 *
 * `[[...id]]` casa con `/reports` **y** con `/reports/<slug>`, así que las dos
 * las sirve esta misma página. Lo que había antes eran dos rutas: una raíz que
 * resolvía el primer proyecto y hacía `redirect()`, y esta.
 *
 * Ese redirect costaba **dos cargas completas**: render en el servidor → 307 →
 * navegación nueva → `loading.tsx` → render de la página de verdad. La ventana
 * entre las dos es lo que se veía como un parpadeo en negro al entrar en
 * Análisis, y encima duplicaba todo el trabajo del servidor para acabar en el
 * mismo sitio.
 *
 * `params.id` es un array porque un catch-all puede traer varios segmentos.
 * Aquí solo importa el primero: no hay ninguna ruta más profunda, y
 * `/reports/a/b` cae en `notFound()` por el mismo camino que un slug que no
 * existe.
 */
interface PageProps {
  params: Promise<{ id?: string[] }>;
  /**
   * Los filtros de R4.3, que viven en la URL y no en estado de cliente.
   *
   * ⚠️ **Esto convierte la página en dinámica de verdad**, y ya lo era: los siete
   * agregados salen de una llamada autenticada por cookie. Lo que cambia es que
   * ahora una navegación con filtros distintos vuelve a pedirlos, que es
   * exactamente lo que se busca — el filtrado lo hace el backend.
   */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Pick<PageProps, 'params'>): Promise<Metadata> {
  const slug = (await params).id?.[0];
  /* Sin slug no se sabe qué proyecto va a salir sin repetir aquí la resolución
     entera, y el título de la pestaña no vale ese viaje: se queda el de la
     sección, que además es el que corresponde a `/reports` a secas. */
  if (!slug) return { title: 'Análisis' };

  try {
    const project = await createServerApiClient().get<ProjectDetail>(`/projects/${slug}`);
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
 *
 * ## Sin proyecto en la URL
 *
 * `/reports` a secas abre el **primero al que tengas acceso**, y lo hace aquí
 * mismo: sin redirect y sin una segunda carga. El proyecto elegido se escribe en
 * la URL al cambiarlo con el selector, así que a partir de ahí la pantalla es
 * enlazable y el botón atrás hace lo que se espera.
 *
 * ⚠️ **No se recuerda el último proyecto en una cookie**, y se estudió. Habría
 * hecho falta escribirla desde una Server Action —un Server Component no puede
 * poner cookies— o sea un gesto de escritura por cada visita para guardar una
 * preferencia que la URL ya guarda mejor: quien quiera volver a un proyecto
 * concreto tiene su dirección, y quien no, entra al primero.
 */
export default async function ReportsPage({ params, searchParams }: PageProps) {
  const segmentos = (await params).id;
  /* Más de un segmento no es una ruta de esta sección. Se trata como un slug
     que no existe, que es lo que es. */
  if (segmentos && segmentos.length > 1) return notFound();

  const slug = segmentos?.[0];
  const api = createServerApiClient();

  /* Los filtros de R4.3. Se leen antes que nada porque entran en la petición de
     los agregados, que es la más cara de la pantalla. */
  const filtros = filtrosDesdeUrl(await searchParams);

  /**
   * Los proyectos cuyo informe se puede abrir.
   *
   * Se lanza **antes de saber si hace falta esperarla**, a propósito: con slug
   * en la URL viaja en paralelo con el resto y no cuesta nada, y sin slug es lo
   * primero que hay que resolver porque decide qué proyecto se abre.
   *
   * `permission` filtra en la consulta, así que no hay que preguntar por los
   * permisos de cada proyecto uno a uno para acabar descartando casi todos.
   */
  const listaPromesa = api
    .get<Paginated<Project>>('/projects?limit=100&permission=canViewReports')
    .catch(() => ({ items: [] as Project[], total: 0 }));

  /**
   * Qué proyecto se abre.
   *
   * Con slug hay que traducirlo: **solo `GET /projects/:id` entiende las dos
   * formas**, y todo lo anidado —informes, permisos, lienzo, asistente— espera
   * el UUID. Sin slug no hace falta ese viaje: la lista ya trae el `id` y el
   * `name`, que es todo lo que esta pantalla usa del proyecto.
   */
  let project: Project | null;
  if (slug) {
    project = await api.get<ProjectDetail>(`/projects/${slug}`).catch(() => null);
    if (!project) return notFound();
  } else {
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const lastSlug = cookieStore.get('last_reports_project_slug')?.value;

    const lista = await listaPromesa;

    let defaultProject = lista.items[0] ?? null;
    if (lastSlug) {
      const found = lista.items.find((p) => p.slug === lastSlug);
      if (found) defaultProject = found;
    }

    project = defaultProject;
    if (!project) return <SinNingunProyecto api={api} />;
  }

  /**
   * El UUID, resuelto, en una constante propia.
   *
   * ⚠️ **La ruta puede traer el slug**, y pasarle el slug a una ruta anidada no
   * da un error de compilación: da un 403.
   *
   * Va en una constante y no se lee de `project` dentro de la Server Action de
   * abajo porque el `'use server'` corta el estrechamiento de tipos: allí
   * `project` vuelve a ser `Project | null` y haría falta un `!` que afirma algo
   * que ya se comprobó más arriba.
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
   *
   * ⚠️ Sigue haciendo falta **aunque el proyecto salga de la lista filtrada**:
   * sin slug el proyecto viene ya filtrado por `permission`, pero con slug lo ha
   * elegido quien escribió la URL y puede ser cualquiera.
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
   * Va junto con lo que no depende de él: los miembros, las etiquetas y la
   * cuota, que hacen falta con lienzo y sin él. La lista de proyectos ya está
   * en vuelo desde arriba.
   */
  const [lienzo, proyectos, members, etiquetas, cuota, detalle] = await Promise.all([
    api
      .get<LienzoGuardado>(`/projects/${projectId}/reports/layout`)
      /**
       * Un lienzo que no se puede leer no tumba la pantalla: perder la
       * disposición es molesto, perder Análisis entero es peor.
       *
       * ⚠️ **Pero `null` es «no se pudo leer», no «no hay ninguno»** (invariante
       * 6), y desde que existe un lienzo por defecto la diferencia tiene
       * consecuencias: devolver aquí un `{ widgets: [], actualizadoEn: null }`
       * haría que un fallo pasajero se leyera como «primera vez» y pintara los
       * tres de partida encima del lienzo de alguien. Y como el lienzo se guarda
       * al mover un gráfico, **el siguiente arrastre habría borrado su
       * disposición de verdad**.
       */
      .catch(() => null),
    listaPromesa,
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
    /**
     * El árbol del proyecto, solo por los **tableros** del filtro.
     *
     * ⚠️ **Con slug en la URL ya lo tenemos y no se vuelve a pedir.** Aquella
     * rama resolvió el slug con `GET /projects/:id`, que devuelve un
     * `ProjectDetail` entero; sin slug, el proyecto sale del listado y ese no
     * trae `workspaces`. Así que el viaje extra lo paga solo `/reports` a secas,
     * y viaja aquí dentro —en paralelo con los otros cuatro— en vez de
     * encadenarse.
     *
     * Degrada a `null`: sin tableros, el desplegable no se pinta y los otros
     * cinco filtros siguen funcionando. Ver invariante 6.
     */
    'workspaces' in project
      ? Promise.resolve(project as ProjectDetail)
      : api.get<ProjectDetail>(`/projects/${projectId}`).catch(() => null),
  ]);

  /* Cada tablero con su espacio delante cuando hay más de uno: dos proyectos
     pueden tener un «Desarrollo» cada uno, igual que pasaba con las columnas. */
  const espacios = detalle?.workspaces ?? [];
  const tableros = espacios.flatMap((espacio) =>
    (espacio.boards ?? []).map((tablero) => ({
      id: tablero.id,
      name: espacios.length > 1 ? `${tablero.name} · ${espacio.name}` : tablero.name,
    })),
  );

  /**
   * El lienzo, o el de partida si nunca se guardó ninguno.
   *
   * ⚠️ **La condición es `actualizadoEn`, no que la lista esté vacía.** Un lienzo
   * guardado *a propósito* sin ningún gráfico también llega con `widgets: []`, y
   * volver a rellenárselo sería devolverle cada vez lo que acaba de quitar.
   * `actualizadoEn` es lo único que distingue «nunca ha tocado esto» de «lo dejó
   * así».
   *
   * El de partida son los tres que salen de `snapshot` — ver `lienzoPorDefecto`,
   * donde está el porqué de que sean esos tres y no los cinco de antes.
   */
  const guardado = lienzo?.widgets ?? [];
  /* `lienzo !== null` es lo que impide que un fallo de lectura se disfrace de
     lienzo nuevo. Ver el `catch` de arriba. */
  const primeraVez = lienzo !== null && lienzo.actualizadoEn === null;
  const widgets = primeraVez && guardado.length === 0 ? lienzoPorDefecto() : guardado;
  const partes = partesNecesarias(widgets);

  /**
   * La instantánea se pide **siempre**, aunque el lienzo no la use.
   *
   * Es la única que sabe si el historial de este proyecto está fabricado, y ese
   * aviso no puede depender de qué gráficos tenga puesto cada cual: durante una
   * demostración nadie distingue un dato medido de uno generado, y quien lo vea
   * se llevará una conclusión falsa sobre gente real. Es además la más barata:
   * es una foto del momento y no recorre el historial.
   */
  /**
   * Los informes del lienzo, en **una** petición.
   *
   * ## Eran siete, y el coste no era el ida y vuelta
   *
   * Cada una de aquellas siete peticiones pasaba por `ProjectPermissionGuard`,
   * que resuelve los permisos efectivos **preguntando a projects-service por
   * TCP**. Pintar esta pantalla costaba siete resoluciones de permisos idénticas
   * y siete travesías del proxy de la zona, para siete cálculos que ya iban en
   * paralelo al otro lado.
   *
   * ⚠️ **Se piden solo los que el lienzo necesita**, igual que antes: quien tenga
   * dos gráficos no paga los siete cálculos. Lo que cambia es cuántas peticiones
   * hacen falta para traerlos, no cuáles.
   *
   * ⚠️ **Y `days` no viaja.** Cada informe tiene su propio defecto y no
   * significan lo mismo: 60 días de historial en el flujo, pero 7 días **sin
   * moverse** en «bloqueadas». Un `days` global convertía este último en otra
   * pregunta distinta con el mismo nombre.
   */
  /* Si el paquete entero falla, se degrada a vacío y cada tarjeta enseña su
     «no disponible», que es lo que hacía cada `.catch(() => null)` por su
     cuenta. Un fallo de un informe suelto ya vuelve como `null` desde el
     servidor sin llevarse a los demás. */
  const informes = await api
    .get<Partial<Record<string, unknown>>>(
      `/projects/${projectId}/reports?include=${partes.join(',')}${filtrosAQuery(filtros)}`,
    )
    .catch(() => ({}) as Partial<Record<string, unknown>>);

  const snapshot = (informes.snapshot ?? null) as ReportSnapshot | null;
  const flow = (informes.flow ?? null) as ReportFlow | null;
  const cycle = (informes['cycle-time'] ?? null) as ReportCycleTime | null;
  const forecast = (informes.forecast ?? null) as ReportForecast | null;
  const people = (informes.people ?? null) as ReportPerson[] | null;
  const blocked = (informes.blocked ?? null) as ReportBlocked | null;
  const weekly = (informes.weekly ?? null) as ReportWeekly | null;
  const dynamics = (informes.dynamics ?? null) as ReportDynamics | null;
  const columnTime = (informes['column-time'] ?? null) as ReportColumnTime | null;

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
   * `commons/api/directory.ts`, que es donde vive el arreglo bueno.
   */
  const directorio = await resolveProfiles(api, [...members.map((m) => m.userId), project.ownerId]);

  const usersById = directorio.perfiles;

  /**
   * `userId` → nombre, para que una propuesta no hable en UUID.
   *
   * Vía `personName` y no con un literal: distingue «esta cuenta ya no
   * existe» de «no se pudo preguntar al directorio», que antes se leían igual.
   */
  const nombres = Object.fromEntries(
    members.map((miembro) => {
      return [miembro.userId, personName(directorio, miembro.userId)];
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
      case 'dinamica':
        return dynamics ? <DinamicaWidget dynamics={dynamics} /> : <NoDisponible />;
      case 'tiempo_por_columna':
        return <TiempoPorColumnaWidget columnTime={columnTime} />;
      case 'generado': {
        if (!widget.grafico) return <NoDisponible />;
        const matrices: Record<string, any> = {};
        for (const [key, val] of Object.entries(informes)) {
          if (key.startsWith('matrix:') && val) {
            matrices[key] = val;
          }
        }
        const datos = construirDatos(
          widget.grafico,
          { snapshot, people, blocked, flow, weekly, dynamics, columnTime, matrices, cycle },
          { personas: nombres, etiquetas: nombresDeEtiquetas },
        );
        /* Los avisos viajan con el gráfico, no dentro de `construirDatos`: son
           algo que hay que decir sobre el dato, no una forma de recortarlo.

           Se encadenan con `??` y no se concatenan porque **no pueden coincidir
           nunca**: uno es de las métricas semanales y el otro de las que miden
           tiempo, y ninguna está en las dos listas. Si algún día lo estuviera,
           esto se queda con el primero en silencio — y entonces hay que pasar a
           una lista de avisos. */
        const aviso =
          (widget.grafico.metrica === 'cierres_por_semana' ||
          widget.grafico.metrica === 'creadas_por_semana'
            ? avisoDeSemanaIncompleta(weekly)
            : null) ?? avisoDeDiasNaturales(widget.grafico.metrica);
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
        {/**
         * La cabecera, en dos columnas desde `lg`.
         *
         * ⚠️ **El selector de proyecto sube a la misma línea que el titular**, y
         * antes iba debajo del bloque de texto. En una pantalla cuyo primer
         * trabajo es contestar «¿de qué proyecto son estos números?», el control
         * que lo cambia estaba por debajo del titular y de una frase de dos
         * líneas: había que leer para encontrarlo. Ahora los dos están a la misma
         * altura, que es donde se busca el contexto.
         *
         * En móvil se apila, y el orden es el mismo: primero de qué se habla,
         * después la explicación.
         */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between bg-surface-elevated p-6 rounded-3xl border border-border shadow-sm">
          <div className="flex min-w-0 flex-col gap-2">
            <h2 className="font-display text-3xl text-text-primary sm:text-4xl">
              Análisis del Proyecto
            </h2>
            <p className="max-w-2xl font-sans text-sm text-text-secondary">
              Monta la vista que necesites. Se guarda y te espera la próxima vez.
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-stretch gap-3 lg:items-end">
            <ProjectPicker
              projects={proyectos.items}
              activeId={projectId}
              paths={Object.fromEntries(
                proyectos.items.map((proyecto) => [proyecto.id, reportPath(proyecto)]),
              )}
              vacio="No tienes ningún proyecto con análisis abierto."
            />

            {proyectos.items.length > 1 && (
              <Link
                href="/overview"
                className="font-sans text-sm font-medium text-primary hover:text-primary-hover transition-colors flex items-center gap-1"
              >
                Ver los {proyectos.items.length} proyectos →
              </Link>
            )}
          </div>
        </div>

        {/**
         * ⚠️ **Aquí había una `key` atada a los filtros, y hacía daño.**
         *
         * La puse para que «Quitar filtros» limpiara los dos selectores de fecha,
         * que llevan su valor por dentro (`defaultValue`, sin controlar) y en una
         * navegación **suave** del App Router no se desmontan. Funcionaba, y de
         * paso remontaba el organismo entero en **cada** cambio de filtro: el
         * panel desplegado se cerraba solo después de elegir cada cosa, así que
         * acumular tres filtros eran tres viajes de abrir y volver a abrir.
         *
         * La `key` se mudó a los dos `SelectorDeFecha`, que es lo único que la
         * necesitaba. El estado de «abierto» vive donde tiene que vivir y ya no
         * lo pisa nadie.
         */}
        <AnalysisFilters
          basePath={reportPath(project)}
          puestos={filtros}
          tableros={tableros}
          personas={members.map((miembro) => ({
            id: miembro.userId,
            nombre: personName(directorio, miembro.userId),
          }))}
          etiquetas={etiquetas.map((etiqueta) => ({
            id: etiqueta.id,
            nombre: etiqueta.name,
          }))}
        />

        {/* `projectId` y no el parámetro de la ruta: las acciones del asistente
            llaman a `/projects/:projectId/assistant/...`, que espera el UUID.
            Con el slug de la URL respondían 403. */}
        <AnalysisScreen
          projectId={projectId}
          projectSlug={project.slug}
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
 * No hay ningún proyecto cuyo informe se pueda abrir.
 *
 * ⚠️ **Son dos motivos distintos y confundirlos manda a la gestión
 * equivocada**: no estar en ningún proyecto se arregla pidiendo que te añadan;
 * estar en varios sin `canViewReports` se arregla pidiendo el permiso a quien
 * administra el proyecto. La segunda consulta solo se hace en este caso, que es
 * el raro, y con `limit=1` porque de esa lista únicamente se mira el `total`.
 */
async function SinNingunProyecto({ api }: { api: ReturnType<typeof createServerApiClient> }) {
  const todos = await api.get<Paginated<Project>>('/projects?limit=1').catch(() => null);

  return (
    <AppHeader title="Análisis">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-3xl text-text-primary sm:text-4xl">
            Cómo va el trabajo
          </h2>
          <p className="max-w-2xl font-serif text-lg italic text-text-secondary">
            Cuánto hay, cómo se mueve, cuánto tarda y qué cabe esperar.
          </p>
        </div>

        {todos && todos.total > 0 ? (
          <NoReportsAccess />
        ) : (
          <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
            <p className="font-display text-lg text-text-primary">
              Todavía no estás en ningún proyecto
            </p>
            <p className="mt-1 font-sans text-sm text-text-secondary">
              Los reportes se calculan sobre el trabajo de un proyecto, así que necesitas estar en
              al menos uno.
            </p>
          </div>
        )}
      </div>
    </AppHeader>
  );
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
