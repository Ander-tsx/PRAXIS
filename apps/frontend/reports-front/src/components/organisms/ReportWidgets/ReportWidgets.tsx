import { HowToRead, NotEnoughData, Stat } from '@/components/molecules/ChartCard';
import { CycleTimeScatter, DistributionBars, FlowChart } from '@/components/organisms/Charts';
import {
  PRIORITY_COLOR,
  PRIORITY_ORDER,
  type ReportCycleTime,
  type ReportFlow,
  type ReportForecast,
  type ReportPerson,
  type ReportSnapshot,
  cuentaTableros,
  etiquetaDeColumna,
  formatDuration,
  tokenColor,
} from '@/lib/reports';
import type { ProjectMember, UserProfile } from '@praxis/commons';
import { personLabel } from '@praxis/commons';

/**
 * El contenido de cada gráfico del lienzo, **sin el marco**.
 *
 * La cabecera —título, descripción, tirador y botón de quitar— la pone
 * `WidgetShell`, que es de cliente porque tiene que responder a los gestos.
 * Estos son componentes de servidor y reciben los datos ya pedidos por la page:
 * es la misma división que ya tenía la pantalla anterior entre `ChartCard` y las
 * islas de Recharts, solo que ahora el marco lo comparten todos.
 *
 * **El «cómo se lee» sobrevivió al cambio, y era lo que más riesgo corría.** Al
 * convertir cinco informes en widgets de una cuadrícula, lo primero que sobra
 * aparentemente es el párrafo que explica qué mira cada uno. Es justo al revés:
 * en una pantalla que ahora puede tener seis gráficos elegidos por alguien
 * distinto cada vez, la explicación importa más, no menos. Sigue plegada, sigue
 * siendo un `<details>` nativo, y sigue cerrada por defecto.
 */

/* ─── Resumen ──────────────────────────────────────────────────────────── */

export function ResumenWidget({ snapshot }: { snapshot: ReportSnapshot }) {
  const abiertas = snapshot.total - snapshot.completed;
  const checklistPct =
    snapshot.checklistItems > 0
      ? Math.round((snapshot.checklistDone / snapshot.checklistItems) * 100)
      : null;

  return (
    <div className="flex h-full flex-col justify-center gap-3">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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

      {snapshot.unassigned > 0 && (
        <p className="font-sans text-sm text-text-disabled">
          <strong className="tabular-nums text-text-secondary">{snapshot.unassigned}</strong>{' '}
          {snapshot.unassigned === 1
            ? 'tarea no tiene a nadie asignado.'
            : 'tareas no tienen a nadie asignado.'}
        </p>
      )}
    </div>
  );
}

/* ─── Dónde está el trabajo ────────────────────────────────────────────── */

export function PorColumnaWidget({ snapshot }: { snapshot: ReportSnapshot }) {
  /* Con varios tableros, el nombre de la columna solo no identifica nada: casi
     todos tienen su «Por hacer». Ver `etiquetaDeColumna`. */
  const variosTableros = cuentaTableros(snapshot.byColumn) > 1;

  return (
    <div className="flex flex-col gap-3">
      <DistributionBars
        unit="tareas"
        data={snapshot.byColumn.map((columna) => ({
          name: etiquetaDeColumna(columna, variosTableros),
          value: columna.count,
          color: tokenColor(columna.color),
        }))}
      />
      <HowToRead>
        <p>
          Es una <strong>foto del momento</strong>, no una evolución. No necesita historial:
          funciona desde el primer día del proyecto.
        </p>
        <p>
          Busca <strong>acumulaciones</strong>. Una columna intermedia con muchas más tareas que sus
          vecinas señala un cuello de botella: entra trabajo más rápido de lo que sale.
        </p>
        <p>
          Cuenta <strong>todos los tableros del proyecto</strong>, de todos los espacios. Si hay más
          de uno, cada barra lleva el suyo detrás del nombre — dos tableros suelen tener su propia
          columna «Por hacer», y sin esa marca serían indistinguibles.
        </p>
      </HowToRead>
    </div>
  );
}

/* ─── Reparto por prioridad ────────────────────────────────────────────── */

const ETIQUETA_PRIORIDAD: Record<string, string> = {
  URGENT: 'Urgente',
  HIGH: 'Alta',
  MEDIUM: 'Media',
  LOW: 'Baja',
};

export function PorPrioridadWidget({ snapshot }: { snapshot: ReportSnapshot }) {
  return (
    <div className="flex flex-col gap-3">
      <DistributionBars
        unit="tareas"
        data={PRIORITY_ORDER.map((prioridad) => ({
          name: ETIQUETA_PRIORIDAD[prioridad],
          value: snapshot.byPriority.find((fila) => fila.priority === prioridad)?.count ?? 0,
          color: PRIORITY_COLOR[prioridad],
        })).filter((fila) => fila.value > 0)}
      />
      <HowToRead>
        <p>
          Un reparto operativo tiene forma de pirámide: pocas urgentes, muchas medias. Si la barra
          de <strong>Urgente</strong> es la más larga, la prioridad ha dejado de discriminar y todo
          compite por el mismo puesto.
        </p>
        <p>
          Conviene cruzarlo con las vencidas: una tarea urgente y antigua pesa más que diez urgentes
          recién creadas.
        </p>
      </HowToRead>
    </div>
  );
}

/* ─── Flujo acumulado ──────────────────────────────────────────────────── */

export function FlujoWidget({ flow }: { flow: ReportFlow | null }) {
  return (
    <div className="flex flex-col gap-3">
      {flow && flow.serie.length > 1 ? (
        <FlowChart flow={flow} />
      ) : (
        <NotEnoughData faltanTareas={0} faltanDias={2} />
      )}
      <HowToRead>
        <p>
          Cada banda es una columna, apiladas <strong>en el orden del tablero</strong>. Su grosor es
          el número de tareas que hay ahí ese día.
        </p>
        <p>
          <strong>Bandas paralelas:</strong> el trabajo entra y sale al mismo ritmo.{' '}
          <strong>Una banda que engorda:</strong> se está acumulando en esa columna.{' '}
          <strong>La banda superior plana:</strong> no se está cerrando nada.
        </p>
        <p>
          El ancho <em>horizontal</em> de las bandas intermedias aproxima el tiempo de tránsito por
          el tablero. Si se ensancha, los tiempos están creciendo.
        </p>
        <p>
          Solo refleja movimientos <strong>registrados</strong>: lo anterior al inicio del historial
          no aparece.
        </p>
      </HowToRead>
    </div>
  );
}

/* ─── Cuánto tarda una tarea ───────────────────────────────────────────── */

export function TiemposWidget({ cycle }: { cycle: ReportCycleTime | null }) {
  const suficiente = cycle?.suficiencia.suficiente === true;

  return (
    <div className="flex flex-col gap-3">
      {suficiente && cycle && (
        <div className="flex gap-6">
          <Stat value={formatDuration(cycle.lead.p50)} label="mediana" tone="primary" />
          <Stat value={formatDuration(cycle.lead.p85)} label="p85" tone="warning" />
        </div>
      )}

      {suficiente && cycle ? (
        <CycleTimeScatter cycle={cycle} />
      ) : (
        <NotEnoughData
          faltanTareas={cycle?.suficiencia.faltanTareas ?? 10}
          faltanDias={cycle?.suficiencia.faltanDias ?? 0}
        />
      )}

      <HowToRead>
        <p>
          <strong>La mediana (p50)</strong> es el tiempo que no supera la mitad de las tareas.{' '}
          <strong>El p85</strong> es el que cumplen 85 de cada 100, y es el que sirve para
          comprometer una fecha.
        </p>
        <p>
          <strong>No se muestra la media, y es deliberado.</strong> La distribución tiene cola larga
          y la media se desplaza hacia los casos extremos, describiendo un escenario que no
          representa al conjunto.
        </p>
        <p>
          Observa <strong>la dispersión</strong>, no solo las líneas. Dos equipos con la misma
          mediana y distinta dispersión no ofrecen la misma previsibilidad.
        </p>
      </HowToRead>
    </div>
  );
}

/* ─── Tiempo de ciclo ──────────────────────────────────────────────────── */

export function CicloWidget({ cycle }: { cycle: ReportCycleTime | null }) {
  if (!cycle?.suficiencia.suficiente) {
    return (
      <NotEnoughData
        faltanTareas={cycle?.suficiencia.faltanTareas ?? 10}
        faltanDias={cycle?.suficiencia.faltanDias ?? 0}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-6">
        <Stat value={formatDuration(cycle.cycle.p50)} label="mediana" tone="primary" />
        <Stat value={formatDuration(cycle.cycle.p85)} label="p85" tone="warning" />
      </div>

      <p className="font-sans text-sm text-text-secondary">
        Sobre{' '}
        <strong className="tabular-nums text-text-primary">
          {cycle.cycle.muestrasConMovimiento}
        </strong>{' '}
        tareas que se movieron antes de cerrarse. Las que se crearon ya terminadas no tienen tiempo
        de ciclo y no entran en el cálculo.
      </p>

      <HowToRead>
        <p>
          Es <strong>siempre menor</strong> que el tiempo de entrega, por definición: empieza a
          contar más tarde. La diferencia entre ambos es <strong>el tiempo de espera</strong> previo
          al inicio de la tarea.
        </p>
        <p>
          Si la entrega supera con mucho al ciclo, el margen de mejora está en cuándo se abren las
          tareas, no en la velocidad de ejecución.
        </p>
      </HowToRead>
    </div>
  );
}

/* ─── Predicción ───────────────────────────────────────────────────────── */

export function PrediccionWidget({ forecast }: { forecast: ReportForecast | null }) {
  return (
    <div className="flex flex-col gap-3">
      {forecast?.prediccion ? (
        <>
          <div className="flex gap-6">
            <Stat value={`${forecast.prediccion.p50} d`} label="mitad de las veces" />
            <Stat value={`${forecast.prediccion.p85} d`} label="85 de cada 100" tone="warning" />
          </div>
          <p className="font-sans text-sm text-text-secondary">
            Quedan <strong className="tabular-nums text-text-primary">{forecast.pendientes}</strong>{' '}
            tareas abiertas y se cierran{' '}
            <strong className="tabular-nums text-text-primary">
              {forecast.throughputDiario?.media.toFixed(2).replace('.', ',')}
            </strong>{' '}
            al día de media. El peor caso simulado son {forecast.prediccion.p95} días.
          </p>
        </>
      ) : (
        <NotEnoughData
          faltanTareas={forecast?.suficiencia.faltanTareas ?? 10}
          faltanDias={forecast?.suficiencia.faltanDias ?? 0}
        />
      )}

      <HowToRead>
        <p>
          Es una <strong>simulación de Monte Carlo</strong>: se muestrea al azar el ritmo de cierre
          diario del historial, día tras día, hasta agotar las tareas abiertas. Repetido{' '}
          <strong>5 000 veces</strong>, el reparto de resultados es la predicción.
        </p>
        <p>
          De ahí que se dé un rango y no un dato único. <strong>Usa el p85 para comprometer</strong>{' '}
          una fecha y el p50 como referencia interna.
        </p>
        <p>
          Incluye <strong>los días sin cierres</strong>. Omitirlos inflaría el ritmo y sesgaría la
          predicción hacia el optimismo.
        </p>
        <p>
          Asume que el ritmo se mantiene. Un cambio de equipo, un periodo de vacaciones o una
          variación de alcance la invalidan.
        </p>
      </HowToRead>
    </div>
  );
}

/* ─── Reparto por persona ──────────────────────────────────────────────── */

export function PersonasWidget({
  people,
  members,
  usersById,
}: {
  people: ReportPerson[];
  members: ProjectMember[];
  usersById: Map<string, UserProfile>;
}) {
  return (
    <div className="flex flex-col gap-3">
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

      <HowToRead>
        <p>
          Mide <strong>reparto de carga</strong>, no rendimiento. Cuenta tareas sin ponderar
          dificultad ni alcance, así que dos filas iguales pueden representar trabajos muy
          distintos.
        </p>
        <p>
          Lo que sí indica bien es el <strong>equilibrio</strong>: una persona con el triple de
          tareas abiertas que el resto apunta a un problema de asignación, y las{' '}
          <strong>vencidas concentradas</strong> suelen ser síntoma de sobrecarga.
        </p>
        <p>
          La <strong>mediana</strong> corresponde a sus tareas cerradas, de creación a cierre. Con
          pocas tareas cerradas un caso atípico la desplaza entera: conviene leerla junto a la
          columna «cerradas».
        </p>
      </HowToRead>
    </div>
  );
}
