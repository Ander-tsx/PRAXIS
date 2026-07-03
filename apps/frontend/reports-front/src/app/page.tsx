'use client';

import { type Role, getActiveRoleClient, hasPrivilege } from '@praxis/commons';
import { Button } from '@praxis/commons/atoms';
import { useEffect, useState } from 'react';

interface Project {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'paused' | 'closed';
  progress: number;
  pm: string;
  deadline: string;
}

interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  assignee: string;
  priority: 'alta' | 'media' | 'baja';
  limitDate: string;
  status: 'todo' | 'doing' | 'done';
}

interface Log {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  module: string;
  date: string;
}

export default function ReportsPage() {
  const [role, setRole] = useState<Role | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);

  // Tabs
  const [activeTab, setActiveTab] = useState<'deviation' | 'productivity' | 'burndown' | 'logs'>(
    'deviation',
  );

  // Export PDF State
  const [exporting, setExporting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Logs filters
  const [moduleFilter, setModuleFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchData = async () => {
    try {
      const [projRes, tasksRes, logsRes] = await Promise.all([
        fetch('/api/mock/projects'),
        fetch('/api/mock/tasks'),
        fetch('/api/mock/logs'),
      ]);
      const projData = await projRes.json();
      const tasksData = await tasksRes.json();
      const logsData = await logsRes.json();

      setProjects(projData);
      setTasks(tasksData);
      setLogs(logsData);
    } catch (e) {
      console.error('Error fetching reports data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const activeRole = getActiveRoleClient();
    setRole(activeRole);
    fetchData();
  }, []);

  if (loading || !role) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const canExport = hasPrivilege(role, 'reporte:exportar');

  const handleExportPDF = () => {
    if (!canExport) return;
    setExporting(true);
    setTimeout(() => {
      setExporting(false);
      setToastMessage('📄 Reporte PDF exportado con éxito y descargado en segundo plano.');
      setTimeout(() => setToastMessage(null), 4000);
    }, 2000);
  };

  // ── 1. REPORT CALCULATIONS ──────────────────────────────
  // Deviation
  const deviationData = projects.map((p, idx) => {
    const projTasks = tasks.filter((t) => t.projectId === p.id);
    const completedTasksCount = projTasks.filter((t) => t.status === 'done').length;

    // Simulating hours
    const estimatedHours = projTasks.length * 15;
    const realHours =
      completedTasksCount * 14.5 + projTasks.filter((t) => t.status === 'doing').length * 4;

    return {
      id: p.id,
      name: p.name,
      status: p.status,
      estimatedHours,
      realHours: Math.round(realHours),
      hoursDiff: Math.round(realHours - estimatedHours),
    };
  });

  // Productivity
  const collaborators = [
    { name: 'Carlos Colaborador', role: 'Diseñador UI/UX', completed: 0, pending: 0 },
    { name: 'Sofía Desarrolladora', role: 'Full Stack Dev', completed: 0, pending: 0 },
  ];

  collaborators.forEach((colab) => {
    const colabTasks = tasks.filter((t) =>
      t.assignee.toLowerCase().includes(colab.name.split(' ')[0].toLowerCase()),
    );
    colab.completed = colabTasks.filter((t) => t.status === 'done').length;
    colab.pending = colabTasks.filter((t) => t.status !== 'done').length;
  });

  // Bitacora logs
  const filteredLogs = logs.filter((log) => {
    const matchesModule = moduleFilter === 'all' || log.module === moduleFilter;
    const matchesSearch =
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.userName.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesModule && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* ── HEADER & ACCIONES ─────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-serif font-extrabold text-white tracking-tight">
            Reportes de Control
          </h2>
          <p className="text-sm text-[#9AA0B4]">
            Audita desviaciones en horas, productividad del equipo y avance histórico.
          </p>
        </div>

        {canExport && (
          <Button
            variant="accent"
            onClick={handleExportPDF}
            isLoading={exporting}
            disabled={exporting}
          >
            <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Exportar a PDF
          </Button>
        )}
      </div>

      {/* ── TOAST MESSAGE ─────────────────────────────────────── */}
      {toastMessage && (
        <div className="p-4 rounded-lg bg-[#4ADE80]/10 text-[#4ADE80] border border-[#4ADE80]/20 flex items-center gap-2 shadow-lg animate-bounce">
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* ── PESTAÑAS ──────────────────────────────────────────── */}
      <div className="flex overflow-x-auto border-b border-[#2A3045] gap-2 pb-px scrollbar-none">
        {[
          { id: 'deviation', label: 'Reporte de Desviación' },
          { id: 'productivity', label: 'Productividad de Equipo' },
          { id: 'burndown', label: 'Gráfico Burndown' },
          { id: 'logs', label: 'Bitácora de Auditoría' },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`pb-3 px-5 text-sm font-semibold transition-all cursor-pointer border-b-2 whitespace-nowrap ${
                isActive
                  ? 'border-[#6C63FF] text-[#E8EAF0]'
                  : 'border-transparent text-[#4A5168] hover:text-[#9AA0B4]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── TAB CONTENT ───────────────────────────────────────── */}
      <div className="min-h-[40vh]">
        {/* ── 1. DEVIATION ────────────────────────────────────── */}
        {activeTab === 'deviation' && (
          <div className="bg-[#161B27] border border-[#2A3045] rounded-xl p-5 shadow-lg space-y-6">
            <h3 className="text-base font-bold text-white uppercase tracking-wider">
              Desviación de Horas del Proyecto
            </h3>

            <div className="overflow-x-auto rounded-lg border border-[#2A3045]">
              <table className="w-full border-collapse text-left text-sm text-[#9AA0B4]">
                <thead className="bg-[#0D0F14] text-xs font-semibold text-white border-b border-[#2A3045]">
                  <tr>
                    <th className="px-6 py-3.5">Proyecto</th>
                    <th className="px-6 py-3.5">Horas Estimadas</th>
                    <th className="px-6 py-3.5">Horas Reales</th>
                    <th className="px-6 py-3.5 text-right">Desviación Horas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2A3045] bg-[#161B27]">
                  {deviationData.map((d) => (
                    <tr key={d.id} className="hover:bg-[#1E2535]/35 transition-colors">
                      <td className="px-6 py-4 font-semibold text-white">{d.name}</td>
                      <td className="px-6 py-4 font-mono">{d.estimatedHours}h</td>
                      <td className="px-6 py-4 font-mono">{d.realHours}h</td>
                      <td
                        className={`px-6 py-4 font-mono font-bold text-right ${
                          d.hoursDiff > 0
                            ? 'text-[#F87171]'
                            : d.hoursDiff < 0
                              ? 'text-[#4ADE80]'
                              : 'text-white'
                        }`}
                      >
                        {d.hoursDiff > 0 ? `+${d.hoursDiff}h` : `${d.hoursDiff}h`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── 2. PRODUCTIVITY ─────────────────────────────────── */}
        {activeTab === 'productivity' && (
          <div className="bg-[#161B27] border border-[#2A3045] rounded-xl p-5 shadow-lg space-y-6">
            <h3 className="text-base font-bold text-white uppercase tracking-wider">
              Productividad del Equipo Técnico
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {collaborators.map((c) => (
                <div
                  key={c.name}
                  className="p-5 rounded-lg bg-[#0D0F14] border border-[#2A3045] flex flex-col justify-between shadow-md"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-10 w-10 rounded-full bg-[#6C63FF]/20 flex items-center justify-center font-bold text-[#6C63FF]">
                      {c.name[0]}
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-sm leading-none">{c.name}</h4>
                      <span className="text-[10px] text-[#9AA0B4] mt-1 block">{c.role}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 border-t border-[#2A3045]/50 pt-4">
                    <div>
                      <span className="text-[10px] text-[#9AA0B4] uppercase font-bold tracking-wider">
                        Terminadas
                      </span>
                      <span className="block text-2xl font-serif font-black text-[#4ADE80] mt-1">
                        {c.completed}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#9AA0B4] uppercase font-bold tracking-wider">
                        Pendientes
                      </span>
                      <span className="block text-2xl font-serif font-black text-[#D4A843] mt-1">
                        {c.pending}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 3. BURNDOWN ─────────────────────────────────────── */}
        {activeTab === 'burndown' && (
          <div className="bg-[#161B27] border border-[#2A3045] rounded-xl p-5 shadow-lg space-y-6">
            <div>
              <h3 className="text-base font-bold text-white uppercase tracking-wider">
                Burndown Chart Global
              </h3>
              <p className="text-xs text-[#9AA0B4] mt-1">
                Velocidad del equipo vs Planificación ideal (Sprint actual - 10 días).
              </p>
            </div>

            {/* Custom SVG Burndown chart */}
            <div className="relative p-4 bg-[#0D0F14] border border-[#2A3045] rounded-xl">
              <svg
                viewBox="0 0 500 200"
                className="w-full overflow-visible"
                style={{ height: 200 }}
              >
                {/* Grid lines */}
                <line
                  x1="30"
                  y1="20"
                  x2="480"
                  y2="20"
                  stroke="#2A3045"
                  strokeWidth="0.5"
                  strokeDasharray="3"
                />
                <line
                  x1="30"
                  y1="65"
                  x2="480"
                  y2="65"
                  stroke="#2A3045"
                  strokeWidth="0.5"
                  strokeDasharray="3"
                />
                <line
                  x1="30"
                  y1="110"
                  x2="480"
                  y2="110"
                  stroke="#2A3045"
                  strokeWidth="0.5"
                  strokeDasharray="3"
                />
                <line
                  x1="30"
                  y1="155"
                  x2="480"
                  y2="155"
                  stroke="#2A3045"
                  strokeWidth="0.5"
                  strokeDasharray="3"
                />

                {/* Axis lines */}
                <line x1="30" y1="20" x2="30" y2="170" stroke="#2A3045" strokeWidth="1" />
                <line x1="30" y1="170" x2="480" y2="170" stroke="#2A3045" strokeWidth="1" />

                {/* Plan Ideal (Red/Dashed Line) */}
                <line
                  x1="30"
                  y1="20"
                  x2="480"
                  y2="170"
                  stroke="#F87171"
                  strokeWidth="2"
                  strokeDasharray="4"
                />
                <text
                  x="350"
                  y="100"
                  fill="#F87171"
                  className="text-[8px] font-bold"
                  transform="rotate(18, 350, 100)"
                >
                  Línea Ideal
                </text>

                {/* Avance Real (Blue Line with dots) */}
                <path
                  d="M 30 20 L 75 25 L 120 40 L 165 50 L 210 90 L 255 105 L 300 115 L 345 130 L 390 155"
                  fill="none"
                  stroke="#6C63FF"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Points dots */}
                <circle cx="30" cy="20" r="4.5" fill="#6C63FF" stroke="white" strokeWidth={1} />
                <circle cx="75" cy="25" r="4.5" fill="#6C63FF" />
                <circle cx="120" cy="40" r="4.5" fill="#6C63FF" />
                <circle cx="165" cy="50" r="4.5" fill="#6C63FF" />
                <circle cx="210" cy="90" r="4.5" fill="#6C63FF" />
                <circle cx="255" cy="105" r="4.5" fill="#6C63FF" />
                <circle cx="300" cy="115" r="4.5" fill="#6C63FF" />
                <circle cx="345" cy="130" r="4.5" fill="#6C63FF" />
                <circle cx="390" cy="155" r="4.5" fill="#6C63FF" />

                {/* Labels */}
                <text x="25" y="182" fill="#4A5168" className="text-[8px] font-mono">
                  Día 1
                </text>
                <text x="115" y="182" fill="#4A5168" className="text-[8px] font-mono">
                  Día 3
                </text>
                <text x="205" y="182" fill="#4A5168" className="text-[8px] font-mono">
                  Día 5
                </text>
                <text x="295" y="182" fill="#4A5168" className="text-[8px] font-mono">
                  Día 7
                </text>
                <text x="385" y="182" fill="#4A5168" className="text-[8px] font-mono">
                  Día 9
                </text>
                <text x="465" y="182" fill="#4A5168" className="text-[8px] font-mono">
                  Día 10
                </text>

                <text x="15" y="23" fill="#4A5168" className="text-[8px] font-mono">
                  30
                </text>
                <text x="15" y="98" fill="#4A5168" className="text-[8px] font-mono">
                  15
                </text>
                <text x="18" y="173" fill="#4A5168" className="text-[8px] font-mono">
                  0
                </text>
              </svg>
            </div>
          </div>
        )}

        {/* ── 4. LOGS ─────────────────────────────────────────── */}
        {activeTab === 'logs' && (
          <div className="bg-[#161B27] border border-[#2A3045] rounded-xl p-5 shadow-lg space-y-4">
            {/* Log filter controls */}
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
              <input
                type="text"
                placeholder="Filtrar por acción o usuario..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:max-w-xs bg-[#0D0F14] border border-[#2A3045] focus:border-[#6C63FF] rounded-lg h-10 px-3 text-sm text-white focus:outline-none"
              />

              <select
                value={moduleFilter}
                onChange={(e: any) => setModuleFilter(e.target.value)}
                className="bg-[#0D0F14] border border-[#2A3045] text-xs text-[#E8EAF0] h-10 px-3 rounded-lg focus:outline-none cursor-pointer"
              >
                <option value="all">Todos los Módulos</option>
                <option value="Proyectos">Proyectos</option>
                <option value="Administración">Administración</option>
              </select>
            </div>

            {/* List */}
            <div className="overflow-x-auto rounded-lg border border-[#2A3045]">
              <table className="w-full border-collapse text-left text-sm text-[#9AA0B4]">
                <thead className="bg-[#0D0F14] text-xs font-semibold text-white border-b border-[#2A3045]">
                  <tr>
                    <th className="px-6 py-3">Usuario</th>
                    <th className="px-6 py-3">Módulo</th>
                    <th className="px-6 py-3">Acción</th>
                    <th className="px-6 py-3">Fecha & Hora</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2A3045]">
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-[#1E2535]/25 transition-colors">
                      <td className="px-6 py-4 font-semibold text-white">{log.userName}</td>
                      <td className="px-6 py-4">{log.module}</td>
                      <td className="px-6 py-4 text-xs text-[#E8EAF0]">{log.action}</td>
                      <td className="px-6 py-4 font-mono text-xs text-[#4A5168]">
                        {new Date(log.date).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
