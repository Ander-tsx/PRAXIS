'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getActiveRoleClient, getActiveUserClient, hasPrivilege, type Role, type User } from '@praxis/commons';
import { Button, Input } from '@praxis/commons/atoms';
import { ProgressBar } from '@praxis/commons/molecules/ProgressBar';

interface ProjectMember {
  userId: string;
  userName: string;
  userEmail: string;
  permissions: string[];
}

interface Project {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'paused' | 'closed';
  progress: number;
  pm: string;
  pmUserId: string;
  deadline: string;
  members: ProjectMember[];
}

export default function ProjectsPage() {
  const [role, setRole] = useState<Role | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'closed'>('all');
  const [loading, setLoading] = useState(true);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/mock/projects');
      const data = await res.json();
      setProjects(data);
    } catch (e) {
      console.error('Error fetching projects:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const activeRole = getActiveRoleClient();
    setRole(activeRole);
    setCurrentUser(getActiveUserClient());
    fetchProjects();
  }, []);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !deadline || !currentUser) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/mock/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          status: 'active',
          progress: 0,
          pm: currentUser.name,
          pmUserId: currentUser.id,
          deadline,
          members: [],
        }),
      });
      if (res.ok) {
        // Reset form
        setName('');
        setDescription('');
        setDeadline('');
        setModalOpen(false);
        fetchProjects();
      }
    } catch (err) {
      console.error('Error creating project:', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !role || !currentUser) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const canCreate = currentUser.role === 'user' || currentUser.role === 'admin';

  const filteredProjects = projects.filter((p) => {
    // 1. Filtrar por participación (si no es admin)
    if (currentUser.role !== 'admin') {
      const isPm = p.pmUserId === currentUser.id;
      const isMember = p.members && p.members.some((m) => m.userId === currentUser.id);
      if (!isPm && !isMember) return false;
    }
    // 2. Filtrar por estado
    if (filter === 'all') return true;
    return p.status === filter;
  });

  return (
    <div className="space-y-6">
      {/* ── HEADER & ACCIONES ─────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-serif font-extrabold text-white tracking-tight">
            Proyectos del Sistema
          </h2>
          <p className="text-sm text-[#9AA0B4]">
            Monitorea, gestiona y participa en los tableros Kanban.
          </p>
        </div>
        {canCreate && (
          <Button variant="primary" onClick={() => setModalOpen(true)}>
            <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Crear Proyecto
          </Button>
        )}
      </div>

      {/* ── FILTROS DE ESTADO ─────────────────────────────────── */}
      <div className="flex gap-2 border-b border-[#2A3045] pb-px">
        {(['all', 'active', 'paused', 'closed'] as const).map((status) => {
          const labels = {
            all: 'Todos',
            active: 'Activos',
            paused: 'Pausados',
            closed: 'Cerrados',
          };
          const isActive = filter === status;
          return (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`pb-3 px-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                isActive
                  ? 'border-[#6C63FF] text-[#E8EAF0]'
                  : 'border-transparent text-[#4A5168] hover:text-[#9AA0B4]'
              }`}
            >
              {labels[status]}
            </button>
          );
        })}
      </div>

      {/* ── LISTADO DE PROYECTOS ──────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredProjects.length === 0 ? (
          <div className="col-span-full py-16 text-center text-[#9AA0B4] border border-[#2A3045] border-dashed rounded-xl">
            No se encontraron proyectos en esta categoría.
          </div>
        ) : (
          filteredProjects.map((p) => (
            <div
              key={p.id}
              id={p.id}
              className="bg-[#161B27] border border-[#2A3045] rounded-xl p-5 flex flex-col justify-between hover:border-[#6C63FF]/60 hover:shadow-2xl transition-all duration-300 group"
            >
              <div>
                {/* Estatus & Deadline */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                      p.status === 'active'
                        ? 'bg-[#4ADE80]/10 text-[#4ADE80]'
                        : p.status === 'paused'
                          ? 'bg-[#FBBF24]/10 text-[#FBBF24]'
                          : 'bg-gray-500/10 text-gray-400'
                    }`}
                  >
                    {p.status === 'active'
                      ? 'Activo'
                      : p.status === 'paused'
                        ? 'Pausado'
                        : 'Cerrado'}
                  </span>
                  <span className="text-xs text-[#9AA0B4] font-mono">Límite: {p.deadline}</span>
                </div>

                {/* Title */}
                <h3 className="text-lg font-bold text-white group-hover:text-[#6C63FF] transition-colors mb-2">
                  {p.name}
                </h3>

                {/* Description */}
                <p className="text-xs text-[#9AA0B4] line-clamp-3 mb-5 leading-relaxed">
                  {p.description}
                </p>
              </div>

              {/* Progress & Bottom Actions */}
              <div className="space-y-4 pt-4 border-t border-[#2A3045]/50">
                <div>
                  <div className="flex justify-between text-xs text-[#9AA0B4] mb-1">
                    <span>Avance General</span>
                    <span className="font-mono text-white font-bold">{p.progress}%</span>
                  </div>
                  <ProgressBar percentage={p.progress} />
                </div>

                <div className="flex items-center justify-between gap-4 pt-1">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-[#6C63FF]/20 flex items-center justify-center text-[10px] text-[#6C63FF] font-bold">
                      {p.pm[0]}
                    </div>
                    <span className="text-[10px] text-[#9AA0B4] font-medium">{p.pm}</span>
                  </div>

                  <Link href={`/${p.id}`}>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="group-hover:bg-[#6C63FF] group-hover:text-white group-hover:border-transparent transition-all"
                    >
                      Abrir Tablero
                      <svg
                        className="h-3 w-3 ml-1"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── MODAL: CREAR PROYECTO ─────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-[#080A0F]/80 backdrop-blur-sm"
            onClick={() => setModalOpen(false)}
          />

          <form
            onSubmit={handleCreateProject}
            className="relative w-full max-w-lg bg-[#161B27] border border-[#2A3045] rounded-xl shadow-2xl p-6 space-y-4"
          >
            <div>
              <h3 className="text-lg font-serif font-extrabold text-white">Nuevo Proyecto</h3>
              <p className="text-xs text-[#9AA0B4]">
                Declara los datos iniciales para el nuevo tablero.
              </p>
            </div>

            <div className="space-y-3">
              <Input
                id="proj-name"
                label="Nombre del Proyecto"
                placeholder="Ej. Integración Slack CRM"
                value={name}
                onChange={(e) => setName(e.target.value)}
                fullWidth
                required
              />

              <div>
                <label className="block text-xs font-semibold text-[#9AA0B4] uppercase tracking-wider mb-1">
                  Descripción
                </label>
                <textarea
                  placeholder="Detalles sobre los entregables y alcance..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full min-h-24 bg-[#0D0F14] border border-[#2A3045] focus:border-[#6C63FF] rounded-lg p-3 text-sm text-white focus:outline-none transition-colors"
                />
              </div>

              <div className="grid grid-cols-1">
                <Input
                  id="proj-deadline"
                  label="Fecha Límite"
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  fullWidth
                  required
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={submitting}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" isLoading={submitting} disabled={submitting}>
                Crear Tablero
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
