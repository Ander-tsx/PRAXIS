'use client';

import { type Role, type User, getActiveRoleClient, getActiveUserClient } from '@praxis/commons';
import { ProgressBar } from '@praxis/commons/molecules/ProgressBar';
import Link from 'next/link';
import { useEffect, useState } from 'react';

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

interface Log {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  module: string;
  date: string;
}

interface UserDb {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'inactive';
}

export default function DashboardPage() {
  const [role, setRole] = useState<Role | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [users, setUsers] = useState<UserDb[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const activeRole = getActiveRoleClient();
    setRole(activeRole);
    setCurrentUser(getActiveUserClient());

    const fetchData = async () => {
      try {
        const [projRes, taskRes, logRes, userRes] = await Promise.all([
          fetch('/api/mock/projects').then((res) => res.json()),
          fetch('/api/mock/tasks').then((res) => res.json()),
          fetch('/api/mock/logs').then((res) => res.json()),
          fetch('/api/mock/users').then((res) => res.json()),
        ]);

        setProjects(projRes);
        setTasks(taskRes);
        setLogs(logRes);
        setUsers(userRes);
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading || !role || !currentUser) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const todayStr = '2026-07-03'; // Fecha de simulación

  // 1. Filtrar tareas asignadas al usuario
  const myTasks = tasks.filter((t) => {
    if (currentUser.role === 'admin') return true;
    // Los PMs ven todas las tareas de sus propios proyectos
    const myOwnedProjs = projects.filter((p) => p.pmUserId === currentUser.id).map((p) => p.id);
    if (myOwnedProjs.includes(t.projectId)) return true;
    // Colaboradores ven las asignadas
    return t.assignee.toLowerCase().includes(currentUser.name.split(' ')[0].toLowerCase());
  });

  // Tareas pendientes
  const pendingTasks = myTasks.filter((t) => t.status !== 'done');

  // Tareas atrasadas (vencidas antes de hoy)
  const overdueTasks = pendingTasks.filter((t) => t.limitDate < todayStr);

  // Tareas de hoy (vencen hoy)
  const todayTasks = pendingTasks.filter((t) => t.limitDate === todayStr);

  // 2. Proyectos del usuario
  const myProjects = projects.filter((p) => {
    if (currentUser.role === 'admin') return true;
    // PM
    if (p.pmUserId === currentUser.id) return true;
    // Colaborador/Miembro
    return p.members && p.members.some((m) => m.userId === currentUser.id);
  });

  // 3. Actividad reciente
  const recentLogs = logs.slice(0, 5);

  // 4. Usuarios activos
  const activeUsersCount = users.filter((u) => u.status === 'active').length;

  return (
    <div className="space-y-6">
      {/* ── BIENVENIDA ────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-6 rounded-2xl bg-[#161B27] border border-[#2A3045] relative overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#6C63FF]/5 rounded-full blur-3xl -z-10" />
        <div>
          <h2 className="text-2xl font-serif font-extrabold tracking-tight text-white mb-1">
            ¡Hola de nuevo, {currentUser.name}!
          </h2>
          <p className="text-sm text-[#9AA0B4]">
            Aquí tienes el resumen del estado de tus proyectos para hoy.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <span className="text-xs text-[#9AA0B4] block uppercase tracking-widest font-bold">
              Fecha Simulación
            </span>
            <span className="text-sm font-bold text-[#D4A843] font-mono">Julio 3, 2026</span>
          </div>
        </div>
      </div>

      {/* ── METRICAS RAPIDAS ──────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 */}
        <div className="bg-[#161B27] border border-[#2A3045] p-5 rounded-xl flex items-center justify-between shadow-lg">
          <div>
            <span className="text-xs font-semibold text-[#9AA0B4] uppercase tracking-wider">
              Mis Proyectos
            </span>
            <h3 className="text-3xl font-serif font-black text-white mt-1">{myProjects.length}</h3>
          </div>
          <div className="h-12 w-12 rounded-lg bg-[#6C63FF]/15 border border-[#6C63FF]/30 flex items-center justify-center text-[#6C63FF]">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
          </div>
        </div>

        {/* Card 2 */}
        <div className="bg-[#161B27] border border-[#2A3045] p-5 rounded-xl flex items-center justify-between shadow-lg">
          <div>
            <span className="text-xs font-semibold text-[#9AA0B4] uppercase tracking-wider">
              Tareas Pendientes
            </span>
            <h3 className="text-3xl font-serif font-black text-white mt-1">
              {pendingTasks.length}
            </h3>
          </div>
          <div className="h-12 w-12 rounded-lg bg-[#60A5FA]/15 border border-[#60A5FA]/30 flex items-center justify-center text-[#60A5FA]">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
        </div>

        {/* Card 3 */}
        <div className="bg-[#161B27] border border-[#2A3045] p-5 rounded-xl flex items-center justify-between shadow-lg relative overflow-hidden">
          {overdueTasks.length > 0 && (
            <div className="absolute top-0 left-0 right-0 h-1 bg-[#F87171]" />
          )}
          <div>
            <span className="text-xs font-semibold text-[#9AA0B4] uppercase tracking-wider">
              Tareas Atrasadas
            </span>
            <h3
              className={`text-3xl font-serif font-black mt-1 ${overdueTasks.length > 0 ? 'text-[#F87171]' : 'text-white'}`}
            >
              {overdueTasks.length}
            </h3>
          </div>
          <div
            className={`h-12 w-12 rounded-lg flex items-center justify-center ${
              overdueTasks.length > 0
                ? 'bg-[#F87171]/15 border border-[#F87171]/30 text-[#F87171]'
                : 'bg-gray-500/10 border border-gray-500/20 text-[#9AA0B4]'
            }`}
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
        </div>

        {/* Card 4 (Condicional por Rol) */}
        {currentUser.role === 'admin' ? (
          <div className="bg-[#161B27] border border-[#2A3045] p-5 rounded-xl flex items-center justify-between shadow-lg">
            <div>
              <span className="text-xs font-semibold text-[#9AA0B4] uppercase tracking-wider">
                Usuarios Activos
              </span>
              <h3 className="text-3xl font-serif font-black text-white mt-1">{activeUsersCount}</h3>
            </div>
            <div className="h-12 w-12 rounded-lg bg-[#4ADE80]/15 border border-[#4ADE80]/30 flex items-center justify-center text-[#4ADE80]">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </div>
          </div>
        ) : (
          <div className="bg-[#161B27] border border-[#2A3045] p-5 rounded-xl flex items-center justify-between shadow-lg">
            <div>
              <span className="text-xs font-semibold text-[#9AA0B4] uppercase tracking-wider">
                Horas Reportadas
              </span>
              <h3 className="text-3xl font-serif font-black text-white mt-1">72h</h3>
            </div>
            <div className="h-12 w-12 rounded-lg bg-[#D4A843]/15 border border-[#D4A843]/30 flex items-center justify-center text-[#D4A843]">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* ── CUERPO PRINCIPAL (2 COLUMNAS) ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna Izquierda / Centro: Proyectos y Tareas */}
        <div className="lg:col-span-2 space-y-6">
          {/* Listado de Proyectos */}
          <section className="bg-[#161B27] border border-[#2A3045] rounded-xl p-5 shadow-lg">
            <h3 className="text-lg font-serif font-extrabold text-white mb-4 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#6C63FF] inline-block animate-pulse" />
              Proyectos bajo mi cargo
            </h3>

            <div className="space-y-4">
              {myProjects.length === 0 ? (
                <p className="text-sm text-[#9AA0B4] italic">No tienes proyectos asignados.</p>
              ) : (
                myProjects.map((p) => (
                  <div
                    key={p.id}
                    className="p-4 rounded-lg bg-[#0D0F14] border border-[#2A3045] hover:border-[#6C63FF]/50 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                      <div>
                        <h4 className="font-bold text-white hover:text-[#6C63FF] transition-colors">
                          <a href={`/projects#${p.id}`}>{p.name}</a>
                        </h4>
                        <span className="text-xs text-[#9AA0B4] block truncate max-w-sm mt-0.5">
                          {p.description}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            p.status === 'active'
                              ? 'bg-[#4ADE80]/10 text-[#4ADE80] border border-[#4ADE80]/20'
                              : p.status === 'paused'
                                ? 'bg-[#FBBF24]/10 text-[#FBBF24] border border-[#FBBF24]/20'
                                : 'bg-gray-500/10 text-gray-400 border border-gray-500/20'
                          }`}
                        >
                          {p.status === 'active'
                            ? 'Activo'
                            : p.status === 'paused'
                              ? 'Pausado'
                              : 'Cerrado'}
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-xs text-[#9AA0B4] mb-1">
                        <span>Avance</span>
                        <span className="font-mono font-bold text-white">{p.progress}%</span>
                      </div>
                      <ProgressBar percentage={p.progress} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Tareas de Hoy / Urgentes */}
          <section className="bg-[#161B27] border border-[#2A3045] rounded-xl p-5 shadow-lg">
            <h3 className="text-lg font-serif font-extrabold text-white mb-4 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#F87171] inline-block animate-pulse" />
              Tareas críticas y de hoy
            </h3>

            <div className="space-y-3">
              {overdueTasks.length === 0 && todayTasks.length === 0 ? (
                <div className="text-center py-6 text-[#9AA0B4] text-sm">
                  🎉 ¡Felicidades! No tienes tareas críticas o atrasadas para hoy.
                </div>
              ) : (
                <>
                  {/* Tareas Atrasadas */}
                  {overdueTasks.map((t) => (
                    <div
                      key={t.id}
                      className="p-3.5 rounded-lg bg-[#F87171]/5 border border-[#F87171]/20 flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <span className="text-[10px] font-bold text-[#F87171] uppercase tracking-wider bg-[#F87171]/15 px-2 py-0.5 rounded mr-2">
                          Atrasada
                        </span>
                        <h4 className="font-bold text-white mt-1 text-sm truncate">{t.title}</h4>
                        <p className="text-xs text-[#9AA0B4] truncate mt-0.5">{t.description}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="text-xs font-mono text-[#F87171] block font-bold">
                          Venció: {t.limitDate}
                        </span>
                        <span className="text-[10px] text-gray-500 block truncate max-w-28">
                          {t.assignee}
                        </span>
                      </div>
                    </div>
                  ))}

                  {/* Tareas de Hoy */}
                  {todayTasks.map((t) => (
                    <div
                      key={t.id}
                      className="p-3.5 rounded-lg bg-[#D4A843]/5 border border-[#D4A843]/20 flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <span className="text-[10px] font-bold text-[#D4A843] uppercase tracking-wider bg-[#D4A843]/15 px-2 py-0.5 rounded mr-2">
                          Hoy
                        </span>
                        <h4 className="font-bold text-white mt-1 text-sm truncate">{t.title}</h4>
                        <p className="text-xs text-[#9AA0B4] truncate mt-0.5">{t.description}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="text-xs font-mono text-[#D4A843] block font-bold">
                          Vence Hoy
                        </span>
                        <span className="text-[10px] text-gray-500 block truncate max-w-28">
                          {t.assignee}
                        </span>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </section>
        </div>

        {/* Columna Derecha: Bitácora de Actividad / Costos globales */}
        <div className="space-y-6">
          {/* Resumen de Esfuerzo de Proyectos (Solo Admin/PM/dueño) */}
          {(currentUser.role === 'admin' ||
            currentUser.id === 'usr-2' ||
            currentUser.id === 'usr-3') && (
            <section className="bg-[#161B27] border border-[#2A3045] rounded-xl p-5 shadow-lg">
              <h3 className="text-lg font-serif font-extrabold text-white mb-4">
                Horas de Trabajo Totales
              </h3>

              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-[#0D0F14] border border-[#2A3045]">
                  <div className="flex justify-between text-xs text-[#9AA0B4] mb-1">
                    <span>Portal de Clientes Alfa</span>
                    <span className="font-mono text-white">45h / 75h estimadas</span>
                  </div>
                  <ProgressBar percentage={60} />
                  <span className="text-[10px] text-[#4ADE80] block mt-1.5 font-semibold">
                    Dentro del esfuerzo proyectado (60% consumido)
                  </span>
                </div>

                <div className="p-4 rounded-lg bg-[#0D0F14] border border-[#2A3045]">
                  <div className="flex justify-between text-xs text-[#9AA0B4] mb-1">
                    <span>Migración Core Postgres</span>
                    <span className="font-mono text-white">15h / 45h estimadas</span>
                  </div>
                  <ProgressBar percentage={33} />
                  <span className="text-[10px] text-[#4ADE80] block mt-1.5 font-semibold">
                    Dentro del esfuerzo proyectado (33% consumido)
                  </span>
                </div>
              </div>
            </section>
          )}

          {/* Recientes Actividades del Sistema */}
          <section className="bg-[#161B27] border border-[#2A3045] rounded-xl p-5 shadow-lg">
            <h3 className="text-lg font-serif font-extrabold text-white mb-4">
              Actividad del equipo
            </h3>

            <div className="flow-root">
              <ul className="-mb-8">
                {recentLogs.map((log, logIdx) => (
                  <li key={log.id}>
                    <div className="relative pb-8">
                      {logIdx !== recentLogs.length - 1 ? (
                        <span
                          className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-[#2A3045]"
                          aria-hidden="true"
                        />
                      ) : null}
                      <div className="relative flex space-x-3">
                        <div>
                          <span className="h-8 w-8 rounded-full bg-[#6C63FF]/15 border border-[#6C63FF]/30 flex items-center justify-center text-[#6C63FF] text-[10px] font-bold">
                            {log.userName[0]}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0 pt-1.5">
                          <p className="text-xs text-[#E8EAF0]">
                            <span className="font-bold">{log.userName}</span> ({log.userRole}):{' '}
                            <span className="text-[#9AA0B4]">{log.action}</span>
                          </p>
                          <div className="text-[10px] text-[#4A5168] mt-1">
                            {new Date(log.date).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}{' '}
                            — en {log.module}
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
