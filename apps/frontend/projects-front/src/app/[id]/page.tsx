'use client';

import {
  type Role,
  type User,
  getActiveRoleClient,
  getActiveUserClient,
  hasPrivilege,
} from '@praxis/commons';
import { Badge, Button, Input } from '@praxis/commons/atoms';
import { ProgressBar } from '@praxis/commons/molecules/ProgressBar';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';

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

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const projectId = resolvedParams.id;

  const [role, setRole] = useState<Role | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  // Invitation inputs
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePermission, setInvitePermission] = useState<string>('tarea:ver');
  const [invitingState, setInvitingState] = useState(false);

  // Tab control
  const [activeTab, setActiveTab] = useState<'board' | 'tasks' | 'costs' | 'estimations' | 'team'>(
    'board',
  );

  // Kanban Drag State
  const [isDragging, setIsDragging] = useState(false);

  // Modal State (Edit Task)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('');
  const [taskPriority, setTaskPriority] = useState<'alta' | 'media' | 'baja'>('media');
  const [taskLimitDate, setTaskLimitDate] = useState('');
  const [taskStatus, setTaskStatus] = useState<'todo' | 'doing' | 'done'>('todo');

  // Modal State (Create Task)
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Filters for Task List tab
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'todo' | 'doing' | 'done'>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'alta' | 'media' | 'baja'>('all');

  const todayStr = '2026-07-03'; // Simulation date

  const fetchProjectDetails = async () => {
    try {
      const [projRes, tasksRes] = await Promise.all([
        fetch(`/api/mock/projects/${projectId}`),
        fetch(`/api/mock/tasks?projectId=${projectId}`),
      ]);

      if (!projRes.ok) {
        router.push('/');
        return;
      }

      const projData = await projRes.json();
      const tasksData = await tasksRes.json();

      setProject(projData);
      setTasks(tasksData);
    } catch (e) {
      console.error('Error fetching project detail:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const activeRole = getActiveRoleClient();
    setRole(activeRole);
    setCurrentUser(getActiveUserClient());
    fetchProjectDetails();
  }, [projectId]);

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !project || !currentUser) return;
    setInvitingState(true);

    const alreadyMember = project.members?.some(
      (m) => m.userEmail.toLowerCase() === inviteEmail.toLowerCase(),
    );
    if (alreadyMember) {
      alert('El usuario ya participa en el proyecto.');
      setInvitingState(false);
      return;
    }

    let invitedUser = {
      id: `usr-mock-${Date.now()}`,
      name: inviteEmail.split('@')[0],
      email: inviteEmail,
    };

    try {
      const usersRes = await fetch('/api/mock/users');
      const allUsers = await usersRes.json();
      const matched = allUsers.find(
        (u: any) => u.email.toLowerCase() === inviteEmail.toLowerCase(),
      );
      if (matched) {
        invitedUser = {
          id: matched.id,
          name: matched.name,
          email: matched.email,
        };
      }
    } catch (err) {
      console.error(err);
    }

    const newMember = {
      userId: invitedUser.id,
      userName: invitedUser.name,
      userEmail: invitedUser.email,
      permissions:
        invitePermission === 'tarea:crear'
          ? ['tarea:ver', 'tarea:mover', 'tarea:crear']
          : invitePermission === 'tarea:mover'
            ? ['tarea:ver', 'tarea:mover']
            : ['tarea:ver'],
    };

    const updatedMembers = [...(project.members || []), newMember];

    try {
      const res = await fetch(`/api/mock/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ members: updatedMembers }),
      });
      if (res.ok) {
        setInviteEmail('');
        fetchProjectDetails();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setInvitingState(false);
    }
  };

  const handleUpdateMemberPermission = async (
    memberId: string,
    level: 'ver' | 'mover' | 'crear',
  ) => {
    if (!project) return;
    const updatedMembers = project.members.map((m) => {
      if (m.userId === memberId) {
        return {
          ...m,
          permissions:
            level === 'crear'
              ? ['tarea:ver', 'tarea:mover', 'tarea:crear']
              : level === 'mover'
                ? ['tarea:ver', 'tarea:mover']
                : ['tarea:ver'],
        };
      }
      return m;
    });

    try {
      const res = await fetch(`/api/mock/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ members: updatedMembers }),
      });
      if (res.ok) {
        fetchProjectDetails();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!project) return;
    const updatedMembers = project.members.filter((m) => m.userId !== memberId);

    try {
      const res = await fetch(`/api/mock/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ members: updatedMembers }),
      });
      if (res.ok) {
        fetchProjectDetails();
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading || !role || !project || !currentUser) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Permissions check
  const isPm = project.pmUserId === currentUser.id || currentUser.role === 'admin';
  const projectMember = project.members?.find((m) => m.userId === currentUser.id);
  const canMove =
    isPm || (projectMember?.permissions && projectMember.permissions.includes('tarea:mover'));
  const canCreateTask =
    isPm || (projectMember?.permissions && projectMember.permissions.includes('tarea:crear'));
  const canSeeCosts = true;

  // ── DRAG & DROP HANDLERS ────────────────────────────────
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    if (!canMove) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/plain', taskId);
    setIsDragging(true);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent, status: 'todo' | 'doing' | 'done') => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    if (!taskId) return;

    // Optimistic UI update
    const updatedTasks = tasks.map((t) => (t.id === taskId ? { ...t, status } : t));
    setTasks(updatedTasks);
    setIsDragging(false);

    try {
      await fetch(`/api/mock/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      fetchProjectDetails(); // Sync with actual progress recalc
    } catch (err) {
      console.error('Error updating task status:', err);
    }
  };

  // ── TASK EDIT HANDLERS ──────────────────────────────────
  const openEditModal = (task: Task) => {
    setSelectedTask(task);
    setTaskTitle(task.title);
    setTaskDesc(task.description);
    setTaskAssignee(task.assignee);
    setTaskPriority(task.priority);
    setTaskLimitDate(task.limitDate);
    setTaskStatus(task.status);
  };

  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask) return;

    try {
      const res = await fetch(`/api/mock/tasks/${selectedTask.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: taskTitle,
          description: taskDesc,
          assignee: taskAssignee,
          priority: taskPriority,
          limitDate: taskLimitDate,
          status: taskStatus,
        }),
      });

      if (res.ok) {
        setSelectedTask(null);
        fetchProjectDetails();
      }
    } catch (err) {
      console.error('Error saving task edits:', err);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle || !taskLimitDate) return;

    try {
      const res = await fetch('/api/mock/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          title: taskTitle,
          description: taskDesc,
          assignee: taskAssignee || 'Sin Asignar',
          priority: taskPriority,
          limitDate: taskLimitDate,
          status: 'todo',
        }),
      });

      if (res.ok) {
        setCreateModalOpen(false);
        setTaskTitle('');
        setTaskDesc('');
        setTaskAssignee('');
        setTaskPriority('media');
        setTaskLimitDate('');
        fetchProjectDetails();
      }
    } catch (err) {
      console.error('Error creating task:', err);
    }
  };

  // ── TABS CALCULATIONS ───────────────────────────────────
  // Collaborators workload and hours efforts data (dynamic from members and tasks!)
  const projectMembers = [
    { userId: project.pmUserId, userName: project.pm, roleName: 'Project Manager' },
    ...(project.members || []).map((m) => ({
      userId: m.userId,
      userName: m.userName,
      roleName: m.permissions.includes('tarea:crear')
        ? 'Creador de Tareas'
        : m.permissions.includes('tarea:mover')
          ? 'Colaborador Técnico'
          : 'Observador',
    })),
  ];

  const collaboratorEfforts = projectMembers.map((m) => {
    // Buscar tareas asignadas a este miembro
    const memberTasks = tasks.filter((t) =>
      t.assignee.toLowerCase().includes(m.userName.split(' ')[0].toLowerCase()),
    );

    // Calcular horas estimadas y reales
    const estimated = memberTasks.length * 12;
    const real =
      memberTasks.filter((t) => t.status === 'done').length * 11 +
      memberTasks.filter((t) => t.status === 'doing').length * 3;

    return {
      name: m.userName,
      role: m.roleName,
      estimatedHours: estimated,
      realHours: real,
      diff: real - estimated,
    };
  });

  const totalEffortEstimatedHours = collaboratorEfforts.reduce(
    (acc, curr) => acc + curr.estimatedHours,
    0,
  );
  const totalEffortRealHours = collaboratorEfforts.reduce((acc, curr) => acc + curr.realHours, 0);
  const effortHoursDiff = totalEffortRealHours - totalEffortEstimatedHours;
  const effortPercent =
    totalEffortEstimatedHours > 0
      ? Math.round((totalEffortRealHours / totalEffortEstimatedHours) * 100)
      : 0;

  // Estimations deviation calculations
  const estimationTasks = tasks.map((t, idx) => {
    // Deterministic simulation numbers for hours
    const baseEst = (idx + 1) * 8 + 6;
    const baseReal =
      t.status === 'done' ? baseEst + (idx % 2 === 0 ? -4 : 6) : baseEst - (idx % 3 === 0 ? 2 : 0);
    return {
      title: t.title,
      estimated: baseEst,
      real: t.status === 'done' ? baseReal : 0,
      diff: t.status === 'done' ? baseReal - baseEst : 0,
      status: t.status,
    };
  });

  const totalEstimatedHours = estimationTasks.reduce((acc, curr) => acc + curr.estimated, 0);
  const totalRealHours = estimationTasks.reduce((acc, curr) => acc + curr.real, 0);
  const hoursDiff = totalRealHours - totalEstimatedHours;

  // Filter tasks list
  const filteredTaskList = tasks.filter((t) => {
    const matchesSearch =
      t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || t.priority === priorityFilter;
    return matchesSearch && matchesStatus && matchesPriority;
  });

  return (
    <div className="space-y-6">
      {/* ── HEADER ────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 bg-[#161B27] border border-[#2A3045] hover:border-[#6C63FF] rounded-lg text-[#9AA0B4] hover:text-white transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
          </Link>
          <div>
            <h2 className="text-xl font-serif font-extrabold text-white tracking-tight">
              {project.name}
            </h2>
            <p className="text-xs text-[#9AA0B4] mt-0.5">{project.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {canCreateTask && activeTab === 'board' && (
            <Button variant="primary" size="sm" onClick={() => setCreateModalOpen(true)}>
              Nueva Tarea
            </Button>
          )}
          <span
            className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded ${
              project.status === 'active'
                ? 'bg-[#4ADE80]/10 text-[#4ADE80] border border-[#4ADE80]/20'
                : project.status === 'paused'
                  ? 'bg-[#FBBF24]/10 text-[#FBBF24] border border-[#FBBF24]/20'
                  : 'bg-gray-500/10 text-gray-400 border border-gray-500/20'
            }`}
          >
            {project.status === 'active'
              ? 'Activo'
              : project.status === 'paused'
                ? 'Pausado'
                : 'Cerrado'}
          </span>
        </div>
      </div>

      {/* ── PESTAÑAS ──────────────────────────────────────────── */}
      <div className="flex overflow-x-auto border-b border-[#2A3045] gap-2 pb-px scrollbar-none">
        {[
          { id: 'board', label: 'Tablero' },
          { id: 'tasks', label: 'Tareas' },
          { id: 'costs', label: 'Esfuerzo' },
          { id: 'estimations', label: 'Estimaciones' },
          { id: 'team', label: 'Equipo' },
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

      {/* ── RENDIMIENTO DE TABS ────────────────────────────────── */}
      <div className="min-h-[45vh]">
        {/* ── TAB 1: KANBAN BOARD ──────────────────────────────── */}
        {activeTab === 'board' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {(['todo', 'doing', 'done'] as const).map((column) => {
              const colLabels = { todo: 'Por Hacer', doing: 'En Progreso', done: 'Terminado' };
              const colTasks = tasks.filter((t) => t.status === column);
              const colColors = {
                todo: 'border-t-[#9AA0B4]',
                doing: 'border-t-[#D4A843]',
                done: 'border-t-[#4ADE80]',
              };

              return (
                <div
                  key={column}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e, column)}
                  className={`bg-[#161B27] border border-[#2A3045] rounded-xl flex flex-col min-h-[50vh] transition-all p-4 border-t-4 ${colColors[column]} ${
                    isDragging ? 'bg-[#1E2535]/50 border-dashed' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#2A3045]/50">
                    <span className="text-sm font-bold text-white uppercase tracking-wider">
                      {colLabels[column]}
                    </span>
                    <span className="font-mono text-xs font-bold bg-[#0D0F14] px-2 py-0.5 rounded-full text-[#9AA0B4]">
                      {colTasks.length}
                    </span>
                  </div>

                  <div className="flex-1 space-y-3 overflow-y-auto max-h-[50vh]">
                    {colTasks.map((t) => {
                      const isOverdue = t.limitDate < todayStr && t.status !== 'done';
                      return (
                        <div
                          key={t.id}
                          draggable={canMove}
                          onDragStart={(e) => handleDragStart(e, t.id)}
                          onDragEnd={handleDragEnd}
                          onClick={() => openEditModal(t)}
                          className={`p-4 rounded-lg bg-[#0D0F14] border hover:border-[#6C63FF]/70 transition-all shadow cursor-pointer select-none group relative overflow-hidden ${
                            isOverdue
                              ? 'border-[#F87171] border-l-4 border-l-[#F87171]'
                              : 'border-[#2A3045]'
                          } ${canMove ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
                        >
                          {/* Priority badge */}
                          <div className="flex justify-between items-center mb-2">
                            <span
                              className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                t.priority === 'alta'
                                  ? 'bg-[#F87171]/15 text-[#F87171]'
                                  : t.priority === 'media'
                                    ? 'bg-[#FBBF24]/15 text-[#FBBF24]'
                                    : 'bg-[#60A5FA]/15 text-[#60A5FA]'
                              }`}
                            >
                              {t.priority}
                            </span>

                            <span className="text-[10px] text-[#4A5168] font-mono">
                              {t.limitDate}
                            </span>
                          </div>

                          <h4 className="text-sm font-bold text-white group-hover:text-[#6C63FF] transition-colors">
                            {t.title}
                          </h4>
                          <p className="text-xs text-[#9AA0B4] line-clamp-2 mt-1 leading-relaxed">
                            {t.description}
                          </p>

                          {/* Assignee */}
                          <div className="flex items-center gap-2 mt-4 pt-2 border-t border-[#2A3045]/40 justify-between">
                            <div className="flex items-center gap-1.5">
                              <div className="h-5 w-5 rounded-full bg-[#6C63FF]/20 flex items-center justify-center text-[8px] font-bold text-[#6C63FF]">
                                {t.assignee[0]}
                              </div>
                              <span className="text-[10px] text-[#9AA0B4] font-medium truncate max-w-28">
                                {t.assignee}
                              </span>
                            </div>

                            {isOverdue && (
                              <span className="text-[8px] font-black uppercase text-[#F87171] bg-[#F87171]/10 px-1 py-0.5 rounded animate-pulse">
                                Atrasada
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {colTasks.length === 0 && (
                      <div className="flex items-center justify-center h-28 border border-dashed border-[#2A3045] text-xs text-[#4A5168] rounded-lg">
                        Arrastra tareas aquí
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── TAB 2: TASKS LIST ────────────────────────────────── */}
        {activeTab === 'tasks' && (
          <div className="bg-[#161B27] border border-[#2A3045] rounded-xl p-5 shadow-lg space-y-4">
            {/* Filter controls */}
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
              <input
                type="text"
                placeholder="Buscar tareas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:max-w-xs bg-[#0D0F14] border border-[#2A3045] focus:border-[#6C63FF] rounded-lg h-10 px-3 text-sm text-white focus:outline-none"
              />

              <div className="flex flex-wrap gap-3 w-full sm:w-auto justify-end">
                <select
                  value={statusFilter}
                  onChange={(e: any) => setStatusFilter(e.target.value)}
                  className="bg-[#0D0F14] border border-[#2A3045] text-xs text-[#E8EAF0] h-10 px-3 rounded-lg focus:outline-none"
                >
                  <option value="all">Todos los Estados</option>
                  <option value="todo">Por Hacer</option>
                  <option value="doing">En Progreso</option>
                  <option value="done">Terminado</option>
                </select>

                <select
                  value={priorityFilter}
                  onChange={(e: any) => setPriorityFilter(e.target.value)}
                  className="bg-[#0D0F14] border border-[#2A3045] text-xs text-[#E8EAF0] h-10 px-3 rounded-lg focus:outline-none"
                >
                  <option value="all">Todas las Prioridades</option>
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baja">Baja</option>
                </select>
              </div>
            </div>

            {/* List table */}
            <div className="overflow-x-auto rounded-lg border border-[#2A3045]">
              <table className="w-full border-collapse text-left text-sm text-[#9AA0B4]">
                <thead className="bg-[#0D0F14] text-xs font-semibold uppercase tracking-wider text-white border-b border-[#2A3045]">
                  <tr>
                    <th className="px-6 py-3">Título</th>
                    <th className="px-6 py-3">Responsable</th>
                    <th className="px-6 py-3">Estado</th>
                    <th className="px-6 py-3">Prioridad</th>
                    <th className="px-6 py-3">Vencimiento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2A3045] bg-[#161B27]">
                  {filteredTaskList.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => openEditModal(t)}
                      className="hover:bg-[#1E2535]/40 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4 font-semibold text-white">
                        <div>
                          <span>{t.title}</span>
                          <span className="text-[10px] text-[#4A5168] block font-medium mt-0.5 line-clamp-1">
                            {t.description}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">{t.assignee}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                            t.status === 'done'
                              ? 'bg-[#4ADE80]/15 text-[#4ADE80]'
                              : t.status === 'doing'
                                ? 'bg-[#FBBF24]/15 text-[#FBBF24]'
                                : 'bg-gray-500/15 text-gray-400'
                          }`}
                        >
                          {t.status === 'todo'
                            ? 'Por hacer'
                            : t.status === 'doing'
                              ? 'En progreso'
                              : 'Terminado'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider ${
                            t.priority === 'alta'
                              ? 'text-[#F87171]'
                              : t.priority === 'media'
                                ? 'text-[#FBBF24]'
                                : 'text-[#60A5FA]'
                          }`}
                        >
                          {t.priority}
                        </span>
                      </td>
                      <td
                        className={`px-6 py-4 font-mono text-xs ${
                          t.limitDate < todayStr && t.status !== 'done'
                            ? 'text-[#F87171] font-bold'
                            : ''
                        }`}
                      >
                        {t.limitDate}
                      </td>
                    </tr>
                  ))}
                  {filteredTaskList.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-10 italic">
                        No se encontraron tareas con los filtros activos.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 3: EFFORT / WORKLOAD (REPLACED COSTS) ───────── */}
        {activeTab === 'costs' && (
          <div className="bg-[#161B27] border border-[#2A3045] rounded-xl p-5 shadow-lg space-y-6">
            <div>
              <h3 className="text-base font-bold text-white uppercase tracking-wider">
                Esfuerzo y Carga Horaria
              </h3>
              <p className="text-xs text-[#9AA0B4] mt-0.5">
                Control de horas estimadas vs horas reales registradas por el equipo.
              </p>
            </div>

            {/* Effort Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-[#0D0F14] border border-[#2A3045] p-5 rounded-lg">
                <span className="text-xs text-[#9AA0B4] font-semibold uppercase tracking-wider">
                  Horas Estimadas Totales
                </span>
                <h4 className="text-2xl font-serif font-black text-white mt-1">
                  {totalEffortEstimatedHours}h
                </h4>
              </div>
              <div className="bg-[#0D0F14] border border-[#2A3045] p-5 rounded-lg">
                <span className="text-xs text-[#9AA0B4] font-semibold uppercase tracking-wider">
                  Horas Reales Acumuladas
                </span>
                <h4 className="text-2xl font-serif font-black text-[#6C63FF] mt-1">
                  {totalEffortRealHours}h
                </h4>
              </div>
              <div className="bg-[#0D0F14] border border-[#2A3045] p-5 rounded-lg">
                <span className="text-xs text-[#9AA0B4] font-semibold uppercase tracking-wider">
                  Desviación de Esfuerzo
                </span>
                <h4
                  className={`text-2xl font-serif font-black mt-1 ${
                    effortHoursDiff > 0
                      ? 'text-[#F87171]'
                      : effortHoursDiff < 0
                        ? 'text-[#4ADE80]'
                        : 'text-white'
                  }`}
                >
                  {effortHoursDiff > 0 ? `+${effortHoursDiff}h` : `${effortHoursDiff}h`}
                </h4>
              </div>
            </div>

            {/* Progress bar */}
            <div className="p-4 rounded-lg bg-[#0D0F14] border border-[#2A3045]">
              <div className="flex justify-between text-xs text-[#9AA0B4] mb-2">
                <span>Avance de Esfuerzo</span>
                <span className="font-mono text-white font-bold">{effortPercent}%</span>
              </div>
              <ProgressBar percentage={effortPercent} />
            </div>

            {/* Hours breakdown table */}
            <div>
              <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-3">
                Esfuerzo por Integrante
              </h4>
              <div className="overflow-x-auto rounded-lg border border-[#2A3045]">
                <table className="w-full border-collapse text-left text-sm text-[#9AA0B4]">
                  <thead className="bg-[#0D0F14] text-xs font-semibold text-white border-b border-[#2A3045]">
                    <tr>
                      <th className="px-6 py-3">Nombre</th>
                      <th className="px-6 py-3">Rol del Proyecto</th>
                      <th className="px-6 py-3">Horas Estimadas</th>
                      <th className="px-6 py-3">Horas Reales</th>
                      <th className="px-6 py-3 text-right">Desviación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2A3045]">
                    {collaboratorEfforts.map((c) => (
                      <tr key={c.name} className="hover:bg-[#1E2535]/25 transition-colors">
                        <td className="px-6 py-4 font-semibold text-white">{c.name}</td>
                        <td className="px-6 py-4">
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded bg-[#1E2535] text-[#9AA0B4] border border-[#2A3045]">
                            {c.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono">{c.estimatedHours}h</td>
                        <td className="px-6 py-4 font-mono text-[#E8EAF0]">{c.realHours}h</td>
                        <td
                          className={`px-6 py-4 font-mono font-bold text-right ${
                            c.diff > 0
                              ? 'text-[#F87171]'
                              : c.diff < 0
                                ? 'text-[#4ADE80]'
                                : 'text-[#9AA0B4]'
                          }`}
                        >
                          {c.diff > 0 ? `+${c.diff}h` : `${c.diff}h`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 4: ESTIMATIONS ───────────────────────────────── */}
        {activeTab === 'estimations' && (
          <div className="bg-[#161B27] border border-[#2A3045] rounded-xl p-5 shadow-lg space-y-6">
            {!canSeeCosts ? (
              <div className="text-center py-16 text-[#F87171] flex flex-col items-center justify-center gap-3">
                <svg
                  className="h-10 w-10 text-[#F87171]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m0-8V5m0 10a3 3 0 100-6 3 3 0 000 6zm-7 9h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                <span className="font-bold text-lg">Acceso Denegado</span>
                <p className="text-sm text-[#9AA0B4] max-w-sm">
                  No cuentas con el privilegio `costos:ver` necesario para visualizar las
                  estimaciones de horas de este proyecto.
                </p>
              </div>
            ) : (
              <>
                {/* Summary hours */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-[#0D0F14] border border-[#2A3045] p-5 rounded-lg">
                    <span className="text-xs text-[#9AA0B4] font-semibold uppercase tracking-wider">
                      Horas Estimadas
                    </span>
                    <h4 className="text-2xl font-serif font-black text-white mt-1">
                      {totalEstimatedHours}h
                    </h4>
                  </div>
                  <div className="bg-[#0D0F14] border border-[#2A3045] p-5 rounded-lg">
                    <span className="text-xs text-[#9AA0B4] font-semibold uppercase tracking-wider">
                      Horas Reales (Tareas Done)
                    </span>
                    <h4 className="text-2xl font-serif font-black text-white mt-1">
                      {totalRealHours}h
                    </h4>
                  </div>
                  <div className="bg-[#0D0F14] border border-[#2A3045] p-5 rounded-lg">
                    <span className="text-xs text-[#9AA0B4] font-semibold uppercase tracking-wider">
                      Desviación Total
                    </span>
                    <h4
                      className={`text-2xl font-serif font-black mt-1 ${hoursDiff > 0 ? 'text-[#F87171]' : 'text-[#4ADE80]'}`}
                    >
                      {hoursDiff > 0 ? `+${hoursDiff}h` : `${hoursDiff}h`}
                    </h4>
                  </div>
                </div>

                {/* Table breakdown */}
                <div>
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-3">
                    Estimaciones vs Real por Tarea
                  </h4>
                  <div className="overflow-x-auto rounded-lg border border-[#2A3045]">
                    <table className="w-full border-collapse text-left text-sm text-[#9AA0B4]">
                      <thead className="bg-[#0D0F14] text-xs font-semibold text-white border-b border-[#2A3045]">
                        <tr>
                          <th className="px-6 py-3">Tarea</th>
                          <th className="px-6 py-3">Estimado</th>
                          <th className="px-6 py-3">Real Billed</th>
                          <th className="px-6 py-3">Desviación</th>
                          <th className="px-6 py-3">Estado Tarea</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#2A3045]">
                        {estimationTasks.map((et, idx) => (
                          <tr key={idx} className="hover:bg-[#1E2535]/25 transition-colors">
                            <td className="px-6 py-4 font-semibold text-white">{et.title}</td>
                            <td className="px-6 py-4 font-mono">{et.estimated}h</td>
                            <td className="px-6 py-4 font-mono">
                              {et.status === 'done' ? `${et.real}h` : '-'}
                            </td>
                            <td
                              className={`px-6 py-4 font-mono font-bold ${
                                et.status !== 'done'
                                  ? 'text-gray-500'
                                  : et.diff > 0
                                    ? 'text-[#F87171]'
                                    : et.diff < 0
                                      ? 'text-[#4ADE80]'
                                      : 'text-white'
                              }`}
                            >
                              {et.status !== 'done'
                                ? '-'
                                : et.diff > 0
                                  ? `+${et.diff}h`
                                  : `${et.diff}h`}
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-[9px] uppercase font-bold tracking-wider">
                                {et.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── TAB 5: TEAM (NOTION SHARE STYLE) ─────────────────── */}
        {activeTab === 'team' && (
          <div className="bg-[#161B27] border border-[#2A3045] rounded-xl p-5 shadow-lg space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="text-lg font-serif font-extrabold text-white">
                  Miembros y Accesos del Proyecto
                </h3>
                <p className="text-xs text-[#9AA0B4] mt-0.5">
                  Gestiona las personas del equipo y sus permisos contextuales en este tablero.
                </p>
              </div>

              {/* Invite Section (PM Only) */}
              {isPm && (
                <form onSubmit={handleInviteMember} className="flex gap-2 w-full sm:w-auto">
                  <input
                    type="email"
                    placeholder="Invitar por correo..."
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                    className="bg-[#0D0F14] border border-[#2A3045] focus:border-[#6C63FF] rounded-lg h-9 px-3 text-xs text-white focus:outline-none w-full sm:max-w-xs"
                  />
                  <select
                    value={invitePermission}
                    onChange={(e) => setInvitePermission(e.target.value)}
                    className="bg-[#0D0F14] border border-[#2A3045] text-xs text-[#E8EAF0] h-9 px-2 rounded-lg focus:outline-none cursor-pointer"
                  >
                    <option value="tarea:ver">Lectura (Observador)</option>
                    <option value="tarea:mover">Colaborador (Mover)</option>
                    <option value="tarea:crear">Creador (Crear/Mover)</option>
                  </select>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    isLoading={invitingState}
                    disabled={invitingState}
                  >
                    Invitar
                  </Button>
                </form>
              )}
            </div>

            {/* Member List */}
            <div className="space-y-4">
              <div className="border border-[#2A3045] rounded-lg overflow-hidden bg-[#0D0F14]/30 divide-y divide-[#2A3045]">
                {/* PM Owner row */}
                <div className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-[#6C63FF]/20 flex items-center justify-center font-bold text-[#6C63FF]">
                      {project.pm[0]}
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-sm">{project.pm}</h4>
                      <span className="text-[10px] text-[#9AA0B4] block font-mono">
                        Propietario / PM
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-[#D4A843] font-bold uppercase tracking-widest bg-[#D4A843]/10 border border-[#D4A843]/20 px-2.5 py-0.5 rounded-full">
                    Control Total
                  </span>
                </div>

                {/* Invited members rows */}
                {(project.members || []).map((m) => {
                  const hasCreate = m.permissions.includes('tarea:crear');
                  const hasMove = m.permissions.includes('tarea:mover');
                  const currentLevel = hasCreate ? 'crear' : hasMove ? 'mover' : 'ver';

                  // Calculate task count for each member
                  const memberTasksCount = tasks.filter(
                    (t) =>
                      t.assignee.toLowerCase().includes(m.userName.split(' ')[0].toLowerCase()) &&
                      t.status !== 'done',
                  ).length;

                  return (
                    <div
                      key={m.userId}
                      className="p-4 flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-gray-500/20 flex items-center justify-center font-bold text-gray-300">
                          {m.userName[0]}
                        </div>
                        <div>
                          <h4 className="font-bold text-white text-sm">{m.userName}</h4>
                          <span className="text-xs text-[#9AA0B4] block truncate max-w-[200px] font-mono">
                            {m.userEmail}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                        <div className="text-left sm:text-right shrink-0">
                          <span className="text-[10px] text-[#9AA0B4] block uppercase font-bold tracking-wider">
                            Tareas Activas
                          </span>
                          <span className="text-xs font-mono font-bold text-white">
                            {memberTasksCount} pendientes
                          </span>
                        </div>

                        {/* Permission selector */}
                        {isPm ? (
                          <select
                            value={currentLevel}
                            onChange={(e) =>
                              handleUpdateMemberPermission(m.userId, e.target.value as any)
                            }
                            className="bg-[#0D0F14] border border-[#2A3045] text-xs text-[#E8EAF0] h-9 px-2 rounded-lg focus:outline-none cursor-pointer animate-none"
                          >
                            <option value="ver">Lectura (Observador)</option>
                            <option value="mover">Colaborador (Mover)</option>
                            <option value="crear">Creador (Crear/Mover)</option>
                          </select>
                        ) : (
                          <span className="text-xs text-[#9AA0B4] font-semibold bg-[#161B27] border border-[#2A3045] px-2.5 py-1 rounded-lg">
                            {currentLevel === 'crear'
                              ? 'Creador'
                              : currentLevel === 'mover'
                                ? 'Colaborador'
                                : 'Lectura'}
                          </span>
                        )}

                        {/* Remove button */}
                        {isPm && (
                          <button
                            onClick={() => handleRemoveMember(m.userId)}
                            className="text-xs text-[#F87171] hover:text-[#f85151] hover:underline font-bold cursor-pointer h-9 px-3 hover:bg-[#F87171]/5 rounded-lg border border-transparent hover:border-[#F87171]/10 transition-colors"
                          >
                            Quitar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {(!project.members || project.members.length === 0) && (
                  <div className="p-8 text-center text-[#9AA0B4] text-xs italic">
                    No hay colaboradores invitados a este tablero todavía.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL: EDIT/DETAIL TASK ──────────────────────────── */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-[#080A0F]/80 backdrop-blur-sm"
            onClick={() => setSelectedTask(null)}
          />

          <form
            onSubmit={handleUpdateTask}
            className="relative w-full max-w-lg bg-[#161B27] border border-[#2A3045] rounded-xl shadow-2xl p-6 space-y-4"
          >
            <div>
              <h3 className="text-lg font-serif font-extrabold text-white">Editar Tarea</h3>
              <p className="text-xs text-[#9AA0B4]">Detalles de la tarea y asignaciones.</p>
            </div>

            <div className="space-y-3">
              <Input
                id="task-title"
                label="Título de la Tarea"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                fullWidth
                required
              />

              <div>
                <label className="block text-xs font-semibold text-[#9AA0B4] uppercase tracking-wider mb-1">
                  Descripción
                </label>
                <textarea
                  value={taskDesc}
                  onChange={(e) => setTaskDesc(e.target.value)}
                  className="w-full min-h-24 bg-[#0D0F14] border border-[#2A3045] focus:border-[#6C63FF] rounded-lg p-3 text-sm text-white focus:outline-none transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  id="task-assignee"
                  label="Responsable"
                  value={taskAssignee}
                  onChange={(e) => setTaskAssignee(e.target.value)}
                  fullWidth
                  required
                />

                <Input
                  id="task-limitDate"
                  label="Fecha Límite"
                  type="date"
                  value={taskLimitDate}
                  onChange={(e) => setTaskLimitDate(e.target.value)}
                  fullWidth
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#9AA0B4] uppercase tracking-wider mb-1">
                    Prioridad
                  </label>
                  <select
                    value={taskPriority}
                    onChange={(e: any) => setTaskPriority(e.target.value)}
                    className="w-full h-10 bg-[#0D0F14] border border-[#2A3045] rounded-lg px-3 text-sm text-white focus:outline-none focus:border-[#6C63FF]"
                  >
                    <option value="alta">Alta</option>
                    <option value="media">Media</option>
                    <option value="baja">Baja</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#9AA0B4] uppercase tracking-wider mb-1">
                    Estado
                  </label>
                  <select
                    value={taskStatus}
                    onChange={(e: any) => setTaskStatus(e.target.value)}
                    className="w-full h-10 bg-[#0D0F14] border border-[#2A3045] rounded-lg px-3 text-sm text-white focus:outline-none focus:border-[#6C63FF]"
                  >
                    <option value="todo">Por Hacer</option>
                    <option value="doing">En Progreso</option>
                    <option value="done">Terminado</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setSelectedTask(null)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary">
                Guardar Cambios
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* ── MODAL: CREATE TASK ────────────────────────────────── */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-[#080A0F]/80 backdrop-blur-sm"
            onClick={() => setCreateModalOpen(false)}
          />

          <form
            onSubmit={handleCreateTask}
            className="relative w-full max-w-lg bg-[#161B27] border border-[#2A3045] rounded-xl shadow-2xl p-6 space-y-4"
          >
            <div>
              <h3 className="text-lg font-serif font-extrabold text-white">Nueva Tarea</h3>
              <p className="text-xs text-[#9AA0B4]">
                Registrar una nueva tarea en el tablero Kanban.
              </p>
            </div>

            <div className="space-y-3">
              <Input
                id="new-task-title"
                label="Título de la Tarea"
                placeholder="Ej. Escribir pruebas unitarias"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                fullWidth
                required
              />

              <div>
                <label className="block text-xs font-semibold text-[#9AA0B4] uppercase tracking-wider mb-1">
                  Descripción
                </label>
                <textarea
                  placeholder="Detalles sobre los requisitos..."
                  value={taskDesc}
                  onChange={(e) => setTaskDesc(e.target.value)}
                  className="w-full min-h-24 bg-[#0D0F14] border border-[#2A3045] focus:border-[#6C63FF] rounded-lg p-3 text-sm text-white focus:outline-none transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  id="new-task-assignee"
                  label="Responsable (Nombre)"
                  placeholder="Carlos Colaborador"
                  value={taskAssignee}
                  onChange={(e) => setTaskAssignee(e.target.value)}
                  fullWidth
                />

                <Input
                  id="new-task-limitDate"
                  label="Fecha Límite"
                  type="date"
                  value={taskLimitDate}
                  onChange={(e) => setTaskLimitDate(e.target.value)}
                  fullWidth
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#9AA0B4] uppercase tracking-wider mb-1">
                  Prioridad
                </label>
                <select
                  value={taskPriority}
                  onChange={(e: any) => setTaskPriority(e.target.value)}
                  className="w-full h-10 bg-[#0D0F14] border border-[#2A3045] rounded-lg px-3 text-sm text-white focus:outline-none focus:border-[#6C63FF]"
                >
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baja">Baja</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setCreateModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary">
                Crear Tarea
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
