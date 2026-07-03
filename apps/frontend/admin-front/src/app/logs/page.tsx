'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Log {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  module: string;
  date: string;
}

export default function AdminLogsPage() {
  const pathname = usePathname();
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter states
  const [moduleFilter, setModuleFilter] = useState<'all' | 'Proyectos' | 'Administración'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'pm' | 'colaborador'>('all');

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/mock/logs');
      const data = await res.json();
      setLogs(data);
    } catch (err) {
      console.error('Error fetching system logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Filter logs
  const filteredLogs = logs.filter((log) => {
    const matchesModule = moduleFilter === 'all' || log.module === moduleFilter;
    const matchesRole = roleFilter === 'all' || log.userRole === roleFilter;
    return matchesModule && matchesRole;
  });

  // Sub-header tabs for Administration
  const adminTabs = [
    { name: 'Usuarios', href: '/users' },
    { name: 'Roles', href: '/roles' },
    { name: 'Matriz de Privilegios', href: '/privileges' },
    { name: 'Proyectos Globales', href: '/projects' },
    { name: 'Bitácora Global', href: '/logs' },
  ];

  return (
    <div className="space-y-6">
      {/* ── ADMIN TABS ────────────────────────────────────────── */}
      <div className="flex overflow-x-auto border-b border-[#2A3045] gap-2 pb-px scrollbar-none">
        {adminTabs.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.name}
              href={tab.href}
              className={`pb-3 px-5 text-sm font-semibold transition-all border-b-2 whitespace-nowrap ${
                isActive
                  ? 'border-[#6C63FF] text-[#E8EAF0]'
                  : 'border-transparent text-[#4A5168] hover:text-[#9AA0B4]'
              }`}
            >
              {tab.name}
            </Link>
          );
        })}
      </div>

      <div className="space-y-4">
        {/* Header and Filter Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-serif font-extrabold text-white">
              Bitácora Global de Actividad
            </h2>
            <p className="text-xs text-[#9AA0B4] mt-0.5">
              Auditoría completa del sistema Praxis en tiempo real.
            </p>
          </div>

          <div className="flex gap-3">
            <select
              value={moduleFilter}
              onChange={(e: any) => setModuleFilter(e.target.value)}
              className="bg-[#161B27] border border-[#2A3045] text-xs text-[#E8EAF0] h-10 px-3 rounded-lg focus:outline-none cursor-pointer"
            >
              <option value="all">Todos los Módulos</option>
              <option value="Proyectos">Proyectos</option>
              <option value="Administración">Administración</option>
            </select>

            <select
              value={roleFilter}
              onChange={(e: any) => setRoleFilter(e.target.value)}
              className="bg-[#161B27] border border-[#2A3045] text-xs text-[#E8EAF0] h-10 px-3 rounded-lg focus:outline-none cursor-pointer"
            >
              <option value="all">Todos los Roles</option>
              <option value="admin">Admin</option>
              <option value="user">User</option>
            </select>
          </div>
        </div>

        {/* ── LOGS TABLE ────────────────────────────────────────── */}
        <div className="bg-[#161B27] border border-[#2A3045] rounded-xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm text-[#9AA0B4]">
              <thead className="bg-[#0D0F14] text-xs font-semibold uppercase tracking-wider text-white border-b border-[#2A3045]">
                <tr>
                  <th className="px-6 py-4">Usuario</th>
                  <th className="px-6 py-4">Rol</th>
                  <th className="px-6 py-4">Acción Realizada</th>
                  <th className="px-6 py-4">Módulo</th>
                  <th className="px-6 py-4">Fecha & Hora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2A3045] bg-[#161B27]">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#1E2535]/35 transition-colors">
                    <td className="px-6 py-4 font-semibold text-white">
                      <div className="flex items-center gap-2">
                        <span className="h-6 w-6 rounded-full bg-[#6C63FF]/20 flex items-center justify-center text-[10px] font-bold text-[#6C63FF]">
                          {log.userName[0]}
                        </span>
                        <span className="text-xs">{log.userName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#0D0F14] border border-[#2A3045] text-[#9AA0B4]">
                        {log.userRole}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-[#E8EAF0]">{log.action}</td>
                    <td className="px-6 py-4 text-xs">{log.module}</td>
                    <td className="px-6 py-4 font-mono text-xs text-[#4A5168]">
                      {new Date(log.date).toLocaleString([], {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
