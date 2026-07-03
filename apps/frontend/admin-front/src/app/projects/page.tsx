'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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

export default function AdminProjectsPage() {
  const pathname = usePathname();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit State
  const [editingProj, setEditingProj] = useState<Project | null>(null);
  const [pmName, setPmName] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/mock/projects');
      const data = await res.json();
      setProjects(data);
    } catch (err) {
      console.error('Error fetching global projects:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleUpdatePm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProj || !pmName) return;
    setSavingId(editingProj.id);

    try {
      const res = await fetch(`/api/mock/projects/${editingProj.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pm: pmName }),
      });
      if (res.ok) {
        setEditingProj(null);
        fetchProjects();
      }
    } catch (err) {
      console.error('Error updating project PM:', err);
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
            Gestión de Proyectos Globales
          </h2>
          <p className="text-xs text-[#9AA0B4] mt-0.5">
            Listado centralizado de todos los tableros creados en el monorepo Praxis y edición de
            directores (Project Managers) asignados.
          </p>
        </div>

        {/* ── PROJECTS TABLE ────────────────────────────────────── */}
        <div className="bg-[#161B27] border border-[#2A3045] rounded-xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm text-[#9AA0B4]">
              <thead className="bg-[#0D0F14] text-xs font-semibold uppercase tracking-wider text-white border-b border-[#2A3045]">
                <tr>
                  <th className="px-6 py-4">Proyecto</th>
                  <th className="px-6 py-4">PM Asignado</th>
                  <th className="px-6 py-4">Progreso</th>
                  <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2A3045] bg-[#161B27]">
                {projects.map((p) => (
                  <tr key={p.id} className="hover:bg-[#1E2535]/35 transition-colors">
                    <td className="px-6 py-4 font-semibold text-white">
                      <div>
                        <span className="block">{p.name}</span>
                        <span className="text-[10px] text-[#4A5168] font-mono mt-0.5 block truncate max-w-sm">
                          {p.description}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-[#6C63FF]/20 flex items-center justify-center text-[10px] text-[#6C63FF] font-bold">
                          {p.pm[0]}
                        </div>
                        <span className="text-xs text-[#E8EAF0]">{p.pm}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono font-bold text-white">{p.progress}%</td>
                    <td className="px-6 py-4">
                      <span
                        className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                          p.status === 'active'
                            ? 'bg-[#4ADE80]/15 text-[#4ADE80]'
                            : p.status === 'paused'
                              ? 'bg-[#FBBF24]/15 text-[#FBBF24]'
                              : 'bg-gray-500/15 text-gray-400'
                        }`}
                      >
                        {p.status === 'active'
                          ? 'Activo'
                          : p.status === 'paused'
                            ? 'Pausado'
                            : 'Cerrado'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => {
                          setEditingProj(p);
                          setPmName(p.pm);
                        }}
                        className="text-xs text-[#6C63FF] hover:text-[#5A52D5] font-bold hover:underline cursor-pointer"
                      >
                        Reasignar PM
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── MODAL: EDIT PM ────────────────────────────────────── */}
      {editingProj && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-[#080A0F]/80 backdrop-blur-sm"
            onClick={() => setEditingProj(null)}
          />

          <form
            onSubmit={handleUpdatePm}
            className="relative w-full max-w-md bg-[#161B27] border border-[#2A3045] rounded-xl shadow-2xl p-6 space-y-4"
          >
            <div>
              <h3 className="text-lg font-serif font-extrabold text-white">Reasignar PM</h3>
              <p className="text-xs text-[#9AA0B4]">
                Cambia el Project Manager asignado a {editingProj.name}.
              </p>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-semibold text-[#9AA0B4] uppercase tracking-wider mb-1">
                Nombre del PM
              </label>
              <select
                value={pmName}
                onChange={(e) => setPmName(e.target.value)}
                className="w-full h-10 bg-[#0D0F14] border border-[#2A3045] rounded-lg px-3 text-sm text-white focus:outline-none focus:border-[#6C63FF] cursor-pointer"
              >
                <option value="Patricia Manager">Patricia Manager</option>
                <option value="Alejandro Admin">Alejandro Admin</option>
                <option value="Carlos Colaborador">Carlos Colaborador</option>
              </select>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditingProj(null)}
                className="px-4 py-2 text-xs font-semibold text-[#9AA0B4] hover:text-white cursor-pointer"
                disabled={savingId === editingProj.id}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold bg-[#6C63FF] hover:bg-[#5A52D5] text-white rounded-lg shadow cursor-pointer disabled:opacity-50"
                disabled={savingId === editingProj.id}
              >
                Guardar Reasignación
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
