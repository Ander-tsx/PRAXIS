'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button, Input } from '@praxis/commons/atoms';

interface UserDb {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'inactive';
  privileges: string[];
}

export default function AdminUsersPage() {
  const pathname = usePathname();
  const [users, setUsers] = useState<UserDb[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  // Modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserDb | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('user');
  const [submitting, setSubmitting] = useState(false);

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

  const handleToggleStatus = async (user: UserDb) => {
    const nextStatus = user.status === 'active' ? 'inactive' : 'active';

    // Optimistic UI update
    setUsers(users.map((u) => (u.id === user.id ? { ...u, status: nextStatus } : u)));

    try {
      await fetch(`/api/mock/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      fetchUsers();
    } catch (err) {
      console.error('Error toggling status:', err);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/mock/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          role,
          status: 'active',
          privileges: role === 'admin' ? ['admin:acceder', 'proyecto:crear'] : ['proyecto:ver'],
        }),
      });
      if (res.ok) {
        setName('');
        setEmail('');
        setRole('user');
        setCreateModalOpen(false);
        fetchUsers();
      }
    } catch (err) {
      console.error('Error creating user:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser || !name || !email) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/mock/users/${editUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, role }),
      });
      if (res.ok) {
        setEditUser(null);
        setName('');
        setEmail('');
        fetchUsers();
      }
    } catch (err) {
      console.error('Error updating user:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (user: UserDb) => {
    setEditUser(user);
    setName(user.name);
    setEmail(user.email);
    setRole(user.role);
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()),
  );

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

      {/* ── USER HEADER ACTIONS ─────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <input
          type="text"
          placeholder="Buscar por nombre o email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full sm:max-w-xs bg-[#161B27] border border-[#2A3045] focus:border-[#6C63FF] rounded-lg h-10 px-3 text-sm text-white focus:outline-none"
        />

        <Button variant="primary" onClick={() => setCreateModalOpen(true)}>
          Crear Usuario
        </Button>
      </div>

      {/* ── USERS TABLE ───────────────────────────────────────── */}
      <div className="bg-[#161B27] border border-[#2A3045] rounded-xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm text-[#9AA0B4]">
            <thead className="bg-[#0D0F14] text-xs font-semibold uppercase tracking-wider text-white border-b border-[#2A3045]">
              <tr>
                <th className="px-6 py-3.5">Nombre</th>
                <th className="px-6 py-3.5">Email</th>
                <th className="px-6 py-3.5">Rol de Sistema</th>
                <th className="px-6 py-3.5">Estado</th>
                <th className="px-6 py-3.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2A3045] bg-[#161B27]">
              {filteredUsers.map((u) => (
                <tr key={u.id} className="hover:bg-[#1E2535]/35 transition-colors">
                  <td className="px-6 py-4 font-semibold text-white">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-[#6C63FF]/20 flex items-center justify-center text-xs text-[#6C63FF] font-bold">
                        {u.name[0]}
                      </div>
                      <span>{u.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs">{u.email}</td>
                  <td className="px-6 py-4">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#1E2535] text-[#E8EAF0] border border-[#2A3045]">
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleToggleStatus(u)}
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full cursor-pointer border ${
                        u.status === 'active'
                          ? 'bg-[#4ADE80]/10 text-[#4ADE80] border-[#4ADE80]/30 hover:bg-[#4ADE80]/20'
                          : 'bg-[#F87171]/10 text-[#F87171] border-[#F87171]/30 hover:bg-[#F87171]/20'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${u.status === 'active' ? 'bg-[#4ADE80]' : 'bg-[#F87171]'}`}
                      />
                      {u.status === 'active' ? 'Activo' : 'Inactivo'}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => openEdit(u)}
                      className="text-xs text-[#6C63FF] hover:text-[#5A52D5] font-bold hover:underline cursor-pointer"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-12 italic text-[#4A5168]">
                    No se encontraron usuarios.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── MODAL: CREAR USUARIO ──────────────────────────────── */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-[#080A0F]/80 backdrop-blur-sm"
            onClick={() => setCreateModalOpen(false)}
          />

          <form
            onSubmit={handleCreateUser}
            className="relative w-full max-w-md bg-[#161B27] border border-[#2A3045] rounded-xl shadow-2xl p-6 space-y-4"
          >
            <div>
              <h3 className="text-lg font-serif font-extrabold text-white">Crear Usuario</h3>
              <p className="text-xs text-[#9AA0B4]">Registra un nuevo usuario en la plataforma.</p>
            </div>

            <div className="space-y-3">
              <Input
                id="new-name"
                label="Nombre Completo"
                placeholder="Ej. Roberto Gómez"
                value={name}
                onChange={(e) => setName(e.target.value)}
                fullWidth
                required
              />

              <Input
                id="new-email"
                label="Email"
                type="email"
                placeholder="roberto@praxis.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                fullWidth
                required
              />

              <div>
                <label className="block text-xs font-semibold text-[#9AA0B4] uppercase tracking-wider mb-1">
                  Rol de Sistema
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full h-10 bg-[#0D0F14] border border-[#2A3045] rounded-lg px-3 text-sm text-white focus:outline-none focus:border-[#6C63FF]"
                >
                  <option value="admin">Administrador</option>
                  <option value="user">Usuario</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="ghost"
                onClick={() => setCreateModalOpen(false)}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button type="submit" variant="primary" isLoading={submitting} disabled={submitting}>
                Crear
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* ── MODAL: EDITAR USUARIO ──────────────────────────────── */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-[#080A0F]/80 backdrop-blur-sm"
            onClick={() => setEditUser(null)}
          />

          <form
            onSubmit={handleEditUser}
            className="relative w-full max-w-md bg-[#161B27] border border-[#2A3045] rounded-xl shadow-2xl p-6 space-y-4"
          >
            <div>
              <h3 className="text-lg font-serif font-extrabold text-white">Editar Usuario</h3>
              <p className="text-xs text-[#9AA0B4]">Actualiza los detalles básicos del usuario.</p>
            </div>

            <div className="space-y-3">
              <Input
                id="edit-name"
                label="Nombre Completo"
                value={name}
                onChange={(e) => setName(e.target.value)}
                fullWidth
                required
              />

              <Input
                id="edit-email"
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                fullWidth
                required
              />

              <div>
                <label className="block text-xs font-semibold text-[#9AA0B4] uppercase tracking-wider mb-1">
                  Rol de Sistema
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full h-10 bg-[#0D0F14] border border-[#2A3045] rounded-lg px-3 text-sm text-white focus:outline-none focus:border-[#6C63FF]"
                >
                  <option value="admin">Administrador</option>
                  <option value="user">Usuario</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setEditUser(null)} disabled={submitting}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" isLoading={submitting} disabled={submitting}>
                Guardar
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
