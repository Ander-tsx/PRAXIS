import { ChartCard, NotEnoughData, Stat, SyntheticBanner } from '@/components/molecules/ChartCard';
import { NoReportsAccess } from '@/components/molecules/NoReportsAccess';
import { AssistantChat } from '@/components/organisms/AssistantChat';
import { CycleTimeScatter, DistributionBars, FlowChart } from '@/components/organisms/Charts';
import { ProjectPicker } from '@/components/organisms/ProjectPicker';
import type { AssistantQuota } from '@/lib/assistant';
import {
  PRIORITY_COLOR,
  PRIORITY_ORDER,
  type ReportCycleTime,
  type ReportFlow,
  type ReportForecast,
  type ReportPerson,
  type ReportSnapshot,
  formatDuration,
  tokenColor,
} from '@/lib/reports';
import {
  AppHeader,
  type EffectivePermissions,
  type Label,
  type Paginated,
  type Project,
  type ProjectDetail,
  type ProjectMember,
  type UserProfile,
  personLabel,
} from '@praxis/commons';
import { createServerApiClient } from '@praxis/commons/auth';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

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

const PRIORITY_LABEL: Record<string, string> = {
  URGENT: 'Urgente',
  HIGH: 'Alta',
  MEDIUM: 'Media',
  LOW: 'Baja',
};

/**
 * Los reportes de un proyecto, **todos en la misma página**.
 *
 * Estuvieron repartidos en cuatro pestañas y se juntaron. El motivo es que las
 * cuatro cuentan partes de una misma historia: cuánto trabajo hay, cómo se
 * mueve, cuánto tarda y qué cabe esperar. Separadas, comparar dos de ellas
 * obligaba a recordar la primera mientras se cargaba la segunda, que es
 * exactamente lo que un informe debería ahorrarte.
 *
 * El coste es explícito y se acepta: **se piden los cinco informes en cada
 * carga**, también los que recorren el historial. Van en paralelo y el servicio
 * los cachea 60 s, así que la espera es la del más lento, no la suma.
 *
 * Cambiar de proyecto es un desplegable, no un viaje a otra pantalla: comparar
 * dos proyectos era ida y vuelta cada vez.
 */
export default async function ProjectReportsPage({ params }: PageProps) {
  const { id } = await params;
  const api = createServerApiClient();

  const project = await api.get<ProjectDetail>(`/projects/${id}`).catch(() => null);
  if (!project) return notFound();

  /**
   * `canViewReports` es la puerta del informe entero, no solo del desglose por
   * persona: sin él no hay agregados, ni tabla de personas, ni asistente.
   *
   * Se comprueba aquí aunque el gateway ya lo exija en las nueve rutas, porque
   * el `Promise.all` de abajo caería en cascada a `null` y la pantalla
   * enseñaría cinco tarjetas rotas en vez de decir qué pasa. El guard es la
   * seguridad; esto es la explicación.
   */
  const effective = await api.get<EffectivePermissions>(`/projects/${project.id}/permissions/me`);
  if (!effective.permissions.canViewReports) {
    return (
      <AppHeader title={`${project.name}`}>
        <NoReportsAccess projectName={project.name} />
      </AppHeader>
    );
  }

  /**
   * Todo a la vez. Cada informe que falle cae a `null` y su tarjeta lo dice, en
   * vez de tumbar la página entera: perder un gráfico es mucho mejor que perder
   * el informe completo, y es el mismo criterio que ya usa el tablero con sus
   * tareas por tablero.
   */
  const [proyectos, snapshot, flow, cycle, forecast, people, members, etiquetas, cuota] =
    await Promise.all([
      /* El selector solo ofrece lo que se puede abrir. `permission` filtra en la
         consulta, así que no hace falta preguntar por los permisos de cada
         proyecto uno a uno para acabar descartando casi todos. */
      api
        .get<Paginated<Project>>('/projects?limit=100&permission=canViewReports')
        .catch(() => ({ items: [] as Project[], total: 0 })),
      api.get<ReportSnapshot>(`/projects/${project.id}/reports/snapshot`),
      api.get<ReportFlow>(`/projects/${project.id}/reports/flow?days=60`).catch(() => null),
      api.get<ReportCycleTime>(`/projects/${project.id}/reports/cycle-time`).catch(() => null),
      api.get<ReportForecast>(`/projects/${project.id}/reports/forecast`).catch(() => null),
      /* Ya no va condicionado: si llegas hasta aquí tienes `canViewReports`, y
         el desglose por persona dejó de ser un permiso aparte. */
      api
        .get<ReportPerson[]>(`/projects/${project.id}/reports/people`)
        .catch(() => []),
      /* Los miembros y el directorio piden solo `canViewProject`: el asistente
         necesita poner nombre a un `userId` para pintar una propuesta, y esas
         dos rutas también las usa quien nunca abre esta pantalla. */
      api
        .get<ProjectMember[]>(`/projects/${project.id}/members`)
        .catch(() => []),
      /* El vocabulario con el que el modelo clasifica: en la propuesta viaja el
         id, y la tarjeta tiene que enseñar el nombre. */
      api
        .get<Label[]>(`/projects/${project.id}/labels`)
        .catch(() => [] as Label[]),
      /* La cuota, al cargar y antes de escribir nada: poner el coste a la vista
         de quien lo gasta evita encontrarse el límite de golpe. */
      api
        .get<AssistantQuota>(`/projects/${project.id}/assistant/quota`)
        .catch(() => null),
    ]);

  /**
   * Los perfiles de quienes salen en esta pantalla, **pedidos por id**.
   *
   * ⚠️ Esto pedía `/users?limit=100` y cruzaba en memoria — la primera página del
   * directorio de toda la plataforma, con el `limit` topado en 100 por el DTO.
   * Con más de cien cuentas, los miembros de este proyecto dejaban de caber ahí y
   * el asistente pintaba propuestas con el UUID en crudo donde va un nombre.
   *
   * Es el mismo fallo que tenía la pestaña Equipo de projects-front. Se arregló
   * allí primero y este se quedó atrás: se corrigió el síntoma y no el patrón.
   * Por eso ahora se piden solo los ids que hacen falta, que aquí son los
   * miembros del proyecto y nadie más.
   */
  const idsDePersonas = [...new Set([...members.map((m) => m.userId), project.ownerId])];

  const personas = await Promise.all(
    idsDePersonas.map((id) => api.get<UserProfile>(`/users/${id}`).catch(() => null)),
  );

  const usersById = new Map(
    personas.filter((u): u is UserProfile => u !== null).map((user) => [user.id, user]),
  );

  /** `userId` → nombre, para que una propuesta no hable en UUID. */
  const nombres = Object.fromEntries(
    members.map((miembro) => {
      const user = usersById.get(miembro.userId);
      return [miembro.userId, user ? personLabel(user) : 'Alguien que ya no está'];
    }),
  );
  const nombresDeEtiquetas = Object.fromEntries(
    etiquetas.map((etiqueta) => [etiqueta.id, etiqueta.name]),
  );

  const abiertas = snapshot.total - snapshot.completed;
  const checklistPct =
    snapshot.checklistItems > 0
      ? Math.round((snapshot.checklistDone / snapshot.checklistItems) * 100)
      : null;

  return (
    <AppHeader title={`${project.name}`}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h2 className="font-display text-3xl text-text-primary sm:text-4xl">
              Cómo va el trabajo
            </h2>
            <p className="max-w-2xl font-serif text-lg italic text-text-secondary">
              Cuánto hay, cómo se mueve, cuánto tarda y qué cabe esperar.
            </p>
          </div>

          {/* El id resuelto, no el parámetro de la ruta: el selector busca cuál
              de los proyectos es el activo, y comparando contra el slug de la
              URL no encontraba ninguno — el desplegable se quedaba en «Elige un
              proyecto» con el informe ya cargado debajo. */}
          <ProjectPicker projects={proyectos.items} activeId={project.id} />
        </div>

        {snapshot.eventosSinteticos > 0 && <SyntheticBanner eventos={snapshot.eventosSinteticos} />}

        {/* Arriba del todo y no al final: lee este mismo informe, y quien llega
            con una pregunta concreta no debería tener que recorrer cinco
            gráficos antes de poder hacerla. */}
        {/* `project.id` y no el parámetro de la ruta: las acciones del asistente
            llaman a `/projects/:projectId/assistant/...`, que espera el UUID.
            Con el slug de la URL respondían 403. */}
        <AssistantChat
          projectId={project.id}
          cuotaInicial={cuota}
          nombres={nombres}
          etiquetas={nombresDeEtiquetas}
        />

        {/* ── 1. Dónde está el trabajo ahora ─────────────────────────── */}

        <div className="grid grid-cols-2 gap-4 rounded-2xl border border-border bg-surface p-5 sm:grid-cols-4">
          <Stat value={snapshot.total} label="Tareas" />
          <Stat value={abiertas} label="Abiertas" tone="muted" />
          <Stat
            value={snapshot.overdue}
            label="Vencidas"
            tone={snapshot.overdue > 0 ? 'error' : 'muted'}
          />
          <Stat
            value={checklistPct === null ? '—' : `${checklistPct}%`}
            label="Checklist"
            tone="success"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard
            title="Dónde está el trabajo"
            description="Cuántas tareas hay ahora mismo en cada columna del tablero."
            howToRead={
              <>
                <p>
                  Es una <strong>foto del momento</strong>, no una evolución. No necesita historial:
                  funciona desde el primer día del proyecto.
                </p>
                <p>
                  Busca <strong>acumulaciones</strong>. Una columna intermedia con muchas más tareas
                  que sus vecinas señala un cuello de botella: entra trabajo más rápido de lo que
                  sale.
                </p>
              </>
            }
          >
            <DistributionBars
              unit="tareas"
              data={snapshot.byColumn.map((columna) => ({
                name: columna.name,
                value: columna.count,
                color: tokenColor(columna.color),
              }))}
            />
          </ChartCard>

          <ChartCard
            title="Reparto por prioridad"
            description="Si casi todo es urgente, en la práctica no hay prioridades."
            howToRead={
              <>
                <p>
                  Un reparto operativo tiene forma de pirámide: pocas urgentes, muchas medias. Si la
                  barra de <strong>Urgente</strong> es la más larga, la prioridad ha dejado de
                  discriminar y todo compite por el mismo puesto.
                </p>
                <p>
                  Conviene cruzarlo con las vencidas: una tarea urgente y antigua pesa más que diez
                  urgentes recién creadas.
                </p>
              </>
            }
          >
            <DistributionBars
              unit="tareas"
              data={PRIORITY_ORDER.map((prioridad) => ({
                name: PRIORITY_LABEL[prioridad],
                value: snapshot.byPriority.find((p) => p.priority === prioridad)?.count ?? 0,
                color: PRIORITY_COLOR[prioridad],
              })).filter((fila) => fila.value > 0)}
            />
          </ChartCard>
        </div>

        {snapshot.unassigned > 0 && (
          <p className="font-sans text-sm text-text-disabled">
            <strong className="text-text-secondary tabular-nums">{snapshot.unassigned}</strong>{' '}
            {snapshot.unassigned === 1
              ? 'tarea no tiene a nadie asignado.'
              : 'tareas no tienen a nadie asignado.'}
          </p>
        )}

        {/* ── 2. Cómo se mueve ───────────────────────────────────────── */}

        <ChartCard
          title="Flujo acumulado"
          description="Cuántas tareas hay en cada columna, día a día, durante los últimos 60 días."
          howToRead={
            <>
              <p>
                Cada banda es una columna, apiladas <strong>en el orden del tablero</strong>. Su
                grosor es el número de tareas que hay ahí ese día.
              </p>
              <p>
                <strong>Bandas paralelas:</strong> el trabajo entra y sale al mismo ritmo.{' '}
                <strong>Una banda que engorda:</strong> se está acumulando en esa columna.{' '}
                <strong>La banda superior plana:</strong> no se está cerrando nada.
              </p>
              <p>
                El ancho <em>horizontal</em> de las bandas intermedias aproxima el tiempo de
                tránsito por el tablero. Si se ensancha, los tiempos están creciendo.
              </p>
              <p>
                Solo refleja movimientos <strong>registrados</strong>: lo anterior al inicio del
                historial no aparece.
              </p>
            </>
          }
        >
          {flow && flow.serie.length > 1 ? (
            <FlowChart flow={flow} />
          ) : (
            <NotEnoughData faltanTareas={0} faltanDias={2} />
          )}
        </ChartCard>

        {/* ── 3. Cuánto tarda ────────────────────────────────────────── */}

        <ChartCard
          title="Cuánto tarda una tarea"
          description="De crear a cerrar. Cada punto es una tarea; las líneas marcan la mediana y el percentil 85."
          highlight={
            cycle?.suficiencia.suficiente ? (
              <div className="flex gap-6">
                <Stat value={formatDuration(cycle.lead.p50)} label="mediana" tone="primary" />
                <Stat value={formatDuration(cycle.lead.p85)} label="p85" tone="warning" />
              </div>
            ) : undefined
          }
          howToRead={
            <>
              <p>
                <strong>La mediana (p50)</strong> es el tiempo que no supera la mitad de las tareas.{' '}
                <strong>El p85</strong> es el que cumplen 85 de cada 100, y es el que sirve para
                comprometer una fecha.
              </p>
              <p>
                <strong>No se muestra la media, y es deliberado.</strong> La distribución tiene cola
                larga y la media se desplaza hacia los casos extremos, describiendo un escenario que
                no representa al conjunto.
              </p>
              <p>
                Observa <strong>la dispersión</strong>, no solo las líneas. Dos equipos con la misma
                mediana y distinta dispersión no ofrecen la misma previsibilidad.
              </p>
              <p>Puntos que ascienden conforme avanza la fecha indican tiempos crecientes.</p>
            </>
          }
        >
          {cycle?.suficiencia.suficiente ? (
            <CycleTimeScatter cycle={cycle} />
          ) : (
            <NotEnoughData
              faltanTareas={cycle?.suficiencia.faltanTareas ?? 10}
              faltanDias={cycle?.suficiencia.faltanDias ?? 0}
            />
          )}
        </ChartCard>

        {cycle?.suficiencia.suficiente && (
          <ChartCard
            title="Tiempo de ciclo"
            description="Del primer movimiento a cerrar: lo que tarda el trabajo una vez empieza de verdad."
            highlight={
              <div className="flex gap-6">
                <Stat value={formatDuration(cycle.cycle.p50)} label="mediana" tone="primary" />
                <Stat value={formatDuration(cycle.cycle.p85)} label="p85" tone="warning" />
              </div>
            }
            howToRead={
              <>
                <p>
                  Es <strong>siempre menor</strong> que el tiempo de entrega, por definición:
                  empieza a contar más tarde. La diferencia entre ambos es{' '}
                  <strong>el tiempo de espera</strong> previo al inicio de la tarea.
                </p>
                <p>
                  Si la entrega supera con mucho al ciclo, el margen de mejora está en cuándo se
                  abren las tareas, no en la velocidad de ejecución.
                </p>
              </>
            }
          >
            <p className="font-sans text-sm text-text-secondary">
              Sobre{' '}
              <strong className="text-text-primary tabular-nums">
                {cycle.cycle.muestrasConMovimiento}
              </strong>{' '}
              tareas que se movieron antes de cerrarse. Las que se crearon ya terminadas no tienen
              tiempo de ciclo y no entran en el cálculo.
            </p>
          </ChartCard>
        )}

        {/* ── 4. Qué cabe esperar ────────────────────────────────────── */}

        <ChartCard
          title="Cuándo estaría vacío el tablero"
          description="Simulación sobre el ritmo de las últimas semanas, no sobre estimaciones."
          highlight={
            forecast?.prediccion ? (
              <div className="flex gap-6">
                <Stat value={`${forecast.prediccion.p50} d`} label="mitad de las veces" />
                <Stat
                  value={`${forecast.prediccion.p85} d`}
                  label="85 de cada 100"
                  tone="warning"
                />
              </div>
            ) : undefined
          }
          howToRead={
            <>
              <p>
                Es una <strong>simulación de Monte Carlo</strong>: se muestrea al azar el ritmo de
                cierre diario del historial, día tras día, hasta agotar las tareas abiertas.
                Repetido <strong>5 000 veces</strong>, el reparto de resultados es la predicción.
              </p>
              <p>
                De ahí que se dé un rango y no un dato único.{' '}
                <strong>Usa el p85 para comprometer</strong> una fecha y el p50 como referencia
                interna.
              </p>
              <p>
                <strong>No emplea estimaciones de esfuerzo:</strong> el dato se deriva del propio
                flujo del tablero, sin nada que mantener a mano en cada tarjeta.
              </p>
              <p>
                Incluye <strong>los días sin cierres</strong>. Omitirlos inflaría el ritmo y
                sesgaría la predicción hacia el optimismo.
              </p>
              <p>
                Asume que el ritmo se mantiene. Un cambio de equipo, un periodo de vacaciones o una
                variación de alcance la invalidan.
              </p>
            </>
          }
        >
          {forecast?.prediccion ? (
            <p className="font-sans text-sm text-text-secondary">
              Quedan{' '}
              <strong className="text-text-primary tabular-nums">{forecast.pendientes}</strong>{' '}
              tareas abiertas y se cierran{' '}
              <strong className="text-text-primary tabular-nums">
                {forecast.throughputDiario?.media.toFixed(2).replace('.', ',')}
              </strong>{' '}
              al día de media. Con ese ritmo, el tablero queda vacío en{' '}
              <strong className="text-text-primary">{forecast.prediccion.p50} días</strong> la mitad
              de las veces, y en{' '}
              <strong className="text-text-primary">{forecast.prediccion.p85}</strong> en 85 de cada
              100. El peor caso simulado son {forecast.prediccion.p95} días.
            </p>
          ) : (
            <NotEnoughData
              faltanTareas={forecast?.suficiencia.faltanTareas ?? 10}
              faltanDias={forecast?.suficiencia.faltanDias ?? 0}
            />
          )}
        </ChartCard>

        {/* ── 5. Quién lleva qué ─────────────────────────────────────── */}

        <ChartCard
          title="Cómo está repartido el trabajo"
          description="Carga y flujo de cada persona."
          howToRead={
            <>
              <p>
                Mide <strong>reparto de carga</strong>, no rendimiento. Cuenta tareas sin ponderar
                dificultad ni alcance, así que dos filas iguales pueden representar trabajos muy
                distintos.
              </p>
              <p>
                Lo que sí indica bien es el <strong>equilibrio</strong>: una persona con el triple
                de tareas abiertas que el resto apunta a un problema de asignación, y las{' '}
                <strong>vencidas concentradas</strong> suelen ser síntoma de sobrecarga.
              </p>
              <p>
                La <strong>mediana</strong> corresponde a sus tareas cerradas, de creación a cierre.
                Con pocas tareas cerradas un caso atípico la desplaza entera: conviene leerla junto
                a la columna «cerradas».
              </p>
            </>
          }
        >
          {people.length === 0 ? (
            <p className="py-8 text-center font-sans text-sm text-text-disabled">
              Nadie tiene tareas asignadas todavía.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse">
                <thead>
                  <tr className="border-b border-border text-left">
                    {['Persona', 'Abiertas', 'Cerradas', 'Vencidas', 'Mediana'].map((th) => (
                      <th
                        key={th}
                        className="pb-2 font-sans text-xs uppercase tracking-wider text-text-disabled"
                      >
                        {th}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {people.map((persona) => {
                    const user = usersById.get(persona.userId);
                    const rol = members.find((m) => m.userId === persona.userId)?.projectRole;
                    return (
                      <tr key={persona.userId} className="border-b border-border-subtle">
                        <td className="py-3 font-sans text-sm text-text-primary">
                          {user ? personLabel(user) : 'Alguien que ya no está'}
                          {rol && (
                            <span className="ml-2 font-sans text-xs text-text-disabled">
                              {rol.name}
                            </span>
                          )}
                        </td>
                        <td className="py-3 font-sans text-sm tabular-nums text-text-secondary">
                          {persona.abiertas}
                        </td>
                        <td className="py-3 font-sans text-sm tabular-nums text-success">
                          {persona.cerradas}
                        </td>
                        <td
                          className={`py-3 font-sans text-sm tabular-nums ${
                            persona.vencidas > 0 ? 'text-error' : 'text-text-disabled'
                          }`}
                        >
                          {persona.vencidas}
                        </td>
                        <td className="py-3 font-sans text-sm tabular-nums text-text-secondary">
                          {formatDuration(persona.medianaHoras)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>
      </div>
    </AppHeader>
  );
}
