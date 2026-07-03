'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ROLE_PRIVILEGES, type Role } from '@praxis/commons';

export default function AdminRolesPage() {
  const pathname = usePathname();

  // Sub-header tabs for Administration
  const adminTabs = [
    { name: 'Usuarios', href: '/users' },
    { name: 'Roles', href: '/roles' },
    { name: 'Matriz de Privilegios', href: '/privileges' },
    { name: 'Proyectos Globales', href: '/projects' },
    { name: 'Bitácora Global', href: '/logs' },
  ];

  const roleDetails = [
    {
      role: 'admin',
      name: 'Administrador del Sistema',
      description:
        'Acceso total y configuración de gobernanza de la plataforma. Puede auditar la bitácora global, alterar roles globales y configurar la matriz de privilegios.',
      color: 'border-l-[#F87171]',
      badgeColor: 'bg-[#F87171]/10 text-[#F87171] border-[#F87171]/20',
    },
    {
      role: 'user',
      name: 'Usuario Normal',
      description:
        'Rol base del sistema. Cuenta con accesos a los tableros Kanban a los que es invitado. Si crea un proyecto nuevo, se convierte automáticamente en el PM de dicho proyecto con control total para invitar colaboradores y definir permisos.',
      color: 'border-l-[#6C63FF]',
      badgeColor: 'bg-[#6C63FF]/10 text-[#6C63FF] border-[#6C63FF]/20',
    },
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {roleDetails.map((rd) => {
          const privileges = ROLE_PRIVILEGES[rd.role as Role] || [];
          return (
            <div
              key={rd.role}
              className={`bg-[#161B27] border border-[#2A3045] rounded-xl p-5 border-l-4 ${rd.color} shadow-lg flex flex-col justify-between`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-bold text-white">{rd.name}</h3>
                  <span
                    className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${rd.badgeColor}`}
                  >
                    {rd.role}
                  </span>
                </div>

                <p className="text-xs text-[#9AA0B4] leading-relaxed mb-6">{rd.description}</p>
              </div>

              <div>
                <h4 className="text-[10px] font-bold text-[#E8EAF0] uppercase tracking-widest mb-3">
                  Privilegios Asignados ({privileges.length})
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {privileges.map((p) => (
                    <span
                      key={p}
                      className="text-[9px] font-semibold font-mono bg-[#0D0F14] border border-[#2A3045] text-[#9AA0B4] px-2 py-0.5 rounded"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
