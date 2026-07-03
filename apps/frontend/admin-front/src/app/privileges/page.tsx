'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

interface UserDb {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'inactive';
  privileges: string[];
}

const ACTION_PRIVILEGES = [
  { key: 'proyecto:ver', label: 'Ver Proyectos', module: 'Proyectos' },
  { key: 'proyecto:crear', label: 'Crear Proyectos', module: 'Proyectos' },
  { key: 'tarea:ver', label: 'Ver Tareas', module: 'Tareas' },
  { key: 'tarea:crear', label: 'Crear Tareas', module: 'Tareas' },
  { key: 'tarea:mover', label: 'Mover Tareas (Kanban)', module: 'Tareas' },
  { key: 'costos:ver', label: 'Ver Costos/Estimaciones', module: 'Finanzas' },
  { key: 'reporte:ver', label: 'Ver Reportes', module: 'Reportes' },
  { key: 'reporte:exportar', label: 'Exportar Reportes', module: 'Reportes' },
];

export default function AdminPrivilegesPage() {
  const pathname = usePathname();
  const [users, setUsers] = useState<UserDb[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/mock/users');
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleTogglePrivilege = async (user: UserDb, privilegeKey: string) => {
    setSavingId(user.id);
    const hasPriv = user.privileges.includes(privilegeKey);
    const nextPrivileges = hasPriv
      ? user.privileges.filter((p) => p !== privilegeKey)
      : [...user.privileges, privilegeKey];

    // Optimistic UI update
    setUsers(users.map((u) => (u.id === user.id ? { ...u, privileges: nextPrivileges } : u)));

    try {
      await fetch(`/api/mock/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privileges: nextPrivileges }),
      });
      fetchUsers();
    } catch (err) {
      console.error('Error toggling privilege:', err);
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

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
        <div>
          <h2 className="text-lg font-serif font-extrabold text-white">
            Matriz de Privilegios Dinámicos
          </h2>
          <p className="text-xs text-[#9AA0B4] mt-0.5">
            Asigna o revoca accesos específicos por usuario. Los cambios tendrán efecto inmediato en
            la sesión del usuario.
          </p>
        </div>

        {/* ── PRIVILEGES MATRIX GRID ────────────────────────────── */}
        <div className="bg-[#161B27] border border-[#2A3045] rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm text-[#9AA0B4]">
              <thead className="bg-[#0D0F14] text-xs font-semibold uppercase tracking-wider text-white border-b border-[#2A3045]">
                <tr>
                  <th className="px-6 py-4 min-w-[200px] sticky left-0 bg-[#0D0F14] z-10">
                    Usuario
                  </th>
                  <th className="px-4 py-4 text-center">Rol Base</th>
                  {ACTION_PRIVILEGES.map((ap) => (
                    <th key={ap.key} className="px-4 py-4 text-center min-w-[120px]">
                      <div>
                        <span className="block text-white font-bold">{ap.label}</span>
                        <span className="text-[9px] text-[#4A5168] block mt-0.5 font-mono font-medium">
                          {ap.key}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2A3045] bg-[#161B27]">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-[#1E2535]/35 transition-colors">
                    {/* Sticky Name Column */}
                    <td className="px-6 py-4 font-semibold text-white sticky left-0 bg-[#161B27] border-r border-[#2A3045] z-10">
                      <div className="flex items-center gap-2">
                        <span className="h-6 w-6 rounded-full bg-[#6C63FF]/20 flex items-center justify-center text-[10px] font-bold text-[#6C63FF]">
                          {user.name[0]}
                        </span>
                        <div className="truncate max-w-[150px]">
                          <span className="block text-sm leading-none">{user.name}</span>
                          <span className="text-[10px] text-[#4A5168] font-mono mt-1 block leading-none">
                            {user.email}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Base Role */}
                    <td className="px-4 py-4 text-center">
                      <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#0D0F14] text-[#E8EAF0] border border-[#2A3045]">
                        {user.role}
                      </span>
                    </td>

                    {/* Matrix Checkboxes */}
                    {ACTION_PRIVILEGES.map((ap) => {
                      const hasPriv = user.privileges.includes(ap.key);
                      return (
                        <td key={ap.key} className="px-4 py-4 text-center">
                          <input
                            type="checkbox"
                            checked={hasPriv}
                            onChange={() => handleTogglePrivilege(user, ap.key)}
                            disabled={savingId === user.id}
                            className="h-4 w-4 bg-[#0D0F14] border-[#2A3045] text-[#6C63FF] focus:ring-offset-0 focus:ring-[#6C63FF] rounded transition-all cursor-pointer disabled:opacity-50"
                          />
                        </td>
                      );
                    })}
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
