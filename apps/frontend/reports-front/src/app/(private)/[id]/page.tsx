import {
  AppHeader,
  type EffectivePermissions,
  type Paginated,
  type ProjectDetail,
  type ProjectMember,
  TabNav,
  type UserProfile,
  personLabel,
  tabLinkClasses,
} from '@praxis/commons';
import { createServerApiClient } from '@praxis/commons/auth';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChartCard, NotEnoughData, Stat, SyntheticBanner } from '@/components/molecules/ChartCard';
import { CycleTimeScatter, DistributionBars, FlowChart } from '@/components/organisms/Charts';
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

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const project = await createServerApiClient().get<ProjectDetail>(`/projects/${id}`);
    return { title: `Reportes · ${project.name}` };
  } catch {
    return { title: 'Reportes' };
  }
}

const TABS = [
  { id: 'instantanea', label: 'Instantánea' },
  { id: 'flujo', label: 'Flujo' },
  { id: 'tiempos', label: 'Tiempos' },
  { id: 'equipo', label: 'Equipo' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const PRIORITY_LABEL: Record<string, string> = {
  URGENT: 'Urgente',
  HIGH: 'Alta',
  MEDIUM: 'Media',
  LOW: 'Baja',
};

/**
 * Los reportes de un proyecto.
 *
 * **Cada pestaña pide solo lo suyo.** El flujo y los tiempos recorren el
 * historial entero, así que cargarlos todos en cada visita haría lento lo único
 * que siempre funciona —la instantánea— por culpa de dos pantallas que quizá no
 * se abran.
 *
 * `canViewReports` decide si aparece la pestaña de equipo. Se lee del mapa
 * efectivo, no se deduce de nada: es el mismo criterio que en el detalle del
 * proyecto.
 */
export default async function ProjectReportsPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { tab } = await searchParams;
  const api = createServerApiClient();

  const activeTab: TabId = TABS.some((t) => t.id === tab) ? (tab as TabId) : 'instantanea';

  const project = await api.get<ProjectDetail>(`/projects/${id}`).catch(() => null);
  if (!project) return notFound();

  const [effective, snapshot] = await Promise.all([
    api.get<EffectivePermissions>(`/projects/${id}/permissions/me`),
    api.get<ReportSnapshot>(`/projects/${id}/reports/snapshot`),
  ]);

  const puedeVerPersonas = effective.permissions.canViewReports;

  /* Solo lo que la pestaña abierta necesita. */
  const flow =
    activeTab === 'flujo'
      ? await api.get<ReportFlow>(`/projects/${id}/reports/flow?days=60`).catch(() => null)
      : null;

  const [cycle, forecast] =
    activeTab === 'tiempos'
      ? await Promise.all([
          api.get<ReportCycleTime>(`/projects/${id}/reports/cycle-time`).catch(() => null),
          api.get<ReportForecast>(`/projects/${id}/reports/forecast`).catch(() => null),
        ])
      : [null, null];

  /**
   * El equipo cruza ids con nombres, así que necesita miembros y directorio.
   * Si falta `canViewReports` ni siquiera se pide: el 403 sería esperado y
   * pedirlo para descartarlo es justo lo que evita `permissions/me`.
   */
  const [people, members, directory] =
    activeTab === 'equipo' && puedeVerPersonas
      ? await Promise.all([
          api.get<ReportPerson[]>(`/projects/${id}/reports/people`).catch(() => []),
          api.get<ProjectMember[]>(`/projects/${id}/members`).catch(() => []),
          api
            .get<Paginated<UserProfile>>('/users?limit=100')
            .catch(() => ({ items: [] as UserProfile[], total: 0 })),
        ])
      : [[], [], { items: [] as UserProfile[], total: 0 }];

  const usersById = new Map(directory.items.map((user) => [user.id, user]));

  const visibleTabs = TABS.filter((t) => t.id !== 'equipo' || puedeVerPersonas);

  const abiertas = snapshot.total - snapshot.completed;
  const checklistPct =
    snapshot.checklistItems > 0
      ? Math.round((snapshot.checklistDone / snapshot.checklistItems) * 100)
      : null;

  return (
    <AppHeader title={`Reportes · ${project.name}`}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          {/* `/` es la lista de proyectos de esta zona. */}
          <Link
            href="/"
            className="w-fit font-sans text-sm text-text-secondary transition-colors hover:text-text-primary"
          >
            ← Todos los proyectos
          </Link>
          <h2 className="font-display text-3xl text-text-primary sm:text-4xl">{project.name}</h2>
        </div>

        {snapshot.eventosSinteticos > 0 && (
          <SyntheticBanner eventos={snapshot.eventosSinteticos} />
        )}

        <TabNav
          tabs={visibleTabs.map((t) => ({ ...t }))}
          activeId={activeTab}
          renderLink={(t, isActive, content) => (
            <Link
              key={t.id}
              href={`/${id}?tab=${t.id}`}
              aria-current={isActive ? 'page' : undefined}
              className={tabLinkClasses(isActive)}
              replace
            >
              {content}
            </Link>
          )}
        />

        {activeTab === 'instantanea' && (
          <div className="flex flex-col gap-4">
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
              >
                <DistributionBars
                  unit="tareas"
                  data={PRIORITY_ORDER.map((prioridad) => ({
                    name: PRIORITY_LABEL[prioridad],
                    value:
                      snapshot.byPriority.find((p) => p.priority === prioridad)?.count ?? 0,
                    color: PRIORITY_COLOR[prioridad],
                  })).filter((fila) => fila.value > 0)}
                />
              </ChartCard>
            </div>

            {snapshot.unassigned > 0 && (
              <p className="font-sans text-sm text-text-disabled">
                <strong className="text-text-secondary tabular-nums">
                  {snapshot.unassigned}
                </strong>{' '}
                {snapshot.unassigned === 1
                  ? 'tarea no tiene a nadie asignado.'
                  : 'tareas no tienen a nadie asignado.'}
              </p>
            )}
          </div>
        )}

        {activeTab === 'flujo' && (
          <ChartCard
            title="Flujo acumulado"
            description="Cuántas tareas hay en cada columna, día a día. Una banda que engorda es trabajo que entra más rápido de lo que sale."
          >
            {flow && flow.serie.length > 1 ? (
              <FlowChart flow={flow} />
            ) : (
              <NotEnoughData faltanTareas={0} faltanDias={2} />
            )}
          </ChartCard>
        )}

        {activeTab === 'tiempos' && (
          <div className="flex flex-col gap-4">
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
                description="Del primer movimiento a cerrar: lo que tarda el trabajo una vez empieza de verdad. Siempre menor que el de entrega."
                highlight={
                  <div className="flex gap-6">
                    <Stat value={formatDuration(cycle.cycle.p50)} label="mediana" tone="primary" />
                    <Stat value={formatDuration(cycle.cycle.p85)} label="p85" tone="warning" />
                  </div>
                }
              >
                <p className="font-sans text-sm text-text-secondary">
                  Sobre{' '}
                  <strong className="text-text-primary tabular-nums">
                    {cycle.cycle.muestrasConMovimiento}
                  </strong>{' '}
                  tareas que se movieron antes de cerrarse. Las que se crearon ya
                  terminadas no tienen tiempo de ciclo y no entran en el cálculo.
                </p>
              </ChartCard>
            )}

            <ChartCard
              title="Cuándo estaría vacío el tablero"
              description="Simulación sobre el ritmo de las últimas semanas, no sobre estimaciones: se remuestrea cuántas tareas se cerraron cada día, 5 000 veces."
              highlight={
                forecast?.prediccion ? (
                  <div className="flex gap-6">
                    <Stat value={`${forecast.prediccion.p50} d`} label="mitad de las veces" />
                    <Stat value={`${forecast.prediccion.p85} d`} label="85 de cada 100" tone="warning" />
                  </div>
                ) : undefined
              }
            >
              {forecast?.prediccion ? (
                <p className="font-sans text-sm text-text-secondary">
                  Quedan{' '}
                  <strong className="text-text-primary tabular-nums">
                    {forecast.pendientes}
                  </strong>{' '}
                  tareas abiertas y se cierran{' '}
                  <strong className="text-text-primary tabular-nums">
                    {forecast.throughputDiario?.media.toFixed(2).replace('.', ',')}
                  </strong>{' '}
                  al día de media. Con ese ritmo, el tablero queda vacío en{' '}
                  <strong className="text-text-primary">{forecast.prediccion.p50} días</strong> la
                  mitad de las veces, y en{' '}
                  <strong className="text-text-primary">{forecast.prediccion.p85}</strong> en 85 de
                  cada 100. El peor caso simulado son {forecast.prediccion.p95} días.
                </p>
              ) : (
                <NotEnoughData
                  faltanTareas={forecast?.suficiencia.faltanTareas ?? 10}
                  faltanDias={forecast?.suficiencia.faltanDias ?? 0}
                />
              )}
            </ChartCard>
          </div>
        )}

        {activeTab === 'equipo' && puedeVerPersonas && (
          <ChartCard
            title="Cómo está repartido el trabajo"
            description="Carga y flujo de cada persona. No es una clasificación: estos números no saben de dificultad ni de contexto, así que ordenan tareas, no a la gente."
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
        )}
      </div>
    </AppHeader>
  );
}
