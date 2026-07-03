'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Badge } from '../../atoms/Badge';
import { MOCK_USERS, type User, getActiveUserClient, setDemoUserClient } from '../../auth';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    const u = getActiveUserClient();
    if (u) {
      setCurrentUser(u);
    } else {
      // Redirigir a landing si no hay sesión
      router.push('/');
    }
  }, [router]);

  if (!mounted || !currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0D0F14] text-[#9AA0B4]">
        <div className="flex flex-col items-center gap-3">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="font-sans text-sm font-medium">Cargando...</p>
        </div>
      </div>
    );
  }

  const handleUserChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setDemoUserClient(val);
    window.location.reload();
  };

  const handleLogout = async () => {
    // 1. Limpiar cookie de demo
    setDemoUserClient('logged_out');

    // 2. Llamar a endpoint de logout real de auth-front (por si tiene sesión activa)
    try {
      await fetch('/auth/api/logout', { method: 'POST' });
    } catch {}

    // 3. Redirigir a landing
    window.location.href = '/';
  };

  // Enlaces de la barra lateral, filtrados por privilegios
  const navigationItems = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z"
          />
        </svg>
      ),
      visible: true,
    },
    {
      name: 'Proyectos',
      href: '/projects',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 002 2h2a2 2 0 002-2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
          />
        </svg>
      ),
      visible: true,
    },
    {
      name: 'Reportes',
      href: '/reports',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      ),
      visible: true,
    },
    {
      name: 'Administración',
      href: '/admin/users',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
          />
        </svg>
      ),
      visible: currentUser.role === 'admin',
    },
  ];

  // Helper para determinar el rol contextual de la persona de cara a la insignia
  const getContextualLabel = (userId: string) => {
    if (userId === 'usr-1') return 'ADMIN';
    if (userId === 'usr-2') return 'PM';
    if (userId === 'usr-3') return 'COLABORADOR';
    if (userId === 'usr-5') return 'OBSERVADORA';
    return 'USER';
  };

  const getContextualVariant = (userId: string) => {
    if (userId === 'usr-1') return 'error';
    if (userId === 'usr-2') return 'primary';
    if (userId === 'usr-3') return 'accent';
    return 'info';
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#0D0F14] text-[#E8EAF0] font-sans">
      {/* ── SIDEBAR (DESKTOP) ─────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-64 bg-[#161B27] border-r border-[#2A3045] shrink-0">
        {/* Header/Logo */}
        <div className="h-16 flex items-center px-6 border-b border-[#2A3045]">
          <span className="font-serif text-xl font-extrabold text-[#E8EAF0] tracking-tight">
            PRAXIS <span className="text-[#6C63FF] font-mono text-sm">.</span>
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
          {navigationItems
            .filter((item) => item.visible)
            .map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <a
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-[#6C63FF] text-[#FFFFFF] shadow-lg shadow-[#6C63FF]/20 font-semibold'
                      : 'text-[#9AA0B4] hover:bg-[#1E2535] hover:text-[#E8EAF0]'
                  }`}
                >
                  {item.icon}
                  {item.name}
                </a>
              );
            })}
        </nav>

        {/* Footer / Profile */}
        <div className="p-4 border-t border-[#2A3045] bg-[#0D0F14]/50">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-full bg-[#6C63FF]/20 flex items-center justify-center font-bold text-[#6C63FF] border border-[#6C63FF]/45">
              {currentUser.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate text-[#E8EAF0]">{currentUser.name}</p>
              <p className="text-xs text-[#9AA0B4] truncate">{currentUser.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 h-9 rounded-lg border border-[#2A3045] text-xs font-semibold text-[#F87171] hover:bg-[#F87171]/10 transition-colors cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT AREA ────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-[#2A3045] bg-[#161B27] flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4">
            {/* Mobile menu trigger */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-1 rounded-md text-[#9AA0B4] hover:text-[#E8EAF0] focus:outline-none"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>

            <h1 className="font-serif text-lg font-bold text-[#E8EAF0] tracking-tight">
              {pathname.includes('/dashboard') && 'Dashboard'}
              {pathname.includes('/projects') && 'Gestión de Proyectos'}
              {pathname.includes('/reports') && 'Reportes & Analíticas'}
              {pathname.includes('/admin') && 'Administración del Sistema'}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            {/* DEMO USER SELECTOR (FLOATING IN NAVBAR) */}
            <div className="flex items-center gap-2 bg-[#1E2535] border border-[#2A3045] py-1 px-2.5 rounded-full shadow-inner">
              <span className="hidden sm:inline text-xs font-semibold text-[#D4A843] uppercase tracking-wider">
                Demo Persona:
              </span>
              <select
                value={currentUser.id}
                onChange={handleUserChange}
                className="bg-transparent text-xs font-bold text-[#E8EAF0] border-none focus:outline-none focus:ring-0 cursor-pointer pr-1"
                style={{ WebkitAppearance: 'none', MozAppearance: 'none' }}
              >
                <option value="usr-1" className="bg-[#161B27]">
                  Alejandro (Admin)
                </option>
                <option value="usr-2" className="bg-[#161B27]">
                  Patricia (PM en Alfa/Core)
                </option>
                <option value="usr-3" className="bg-[#161B27]">
                  Carlos (Colaborador / PM Identidad)
                </option>
                <option value="usr-5" className="bg-[#161B27]">
                  Sofía (Observadora en Alfa)
                </option>
              </select>
            </div>

            <div className="hidden sm:flex">
              <Badge variant={getContextualVariant(currentUser.id)}>
                {getContextualLabel(currentUser.id)}
              </Badge>
            </div>
          </div>
        </header>

        {/* Content body */}
        <main className="flex-1 overflow-y-auto bg-[#0D0F14] relative">
          <div className="p-6 max-w-[1400px] mx-auto w-full">{children}</div>
        </main>
      </div>

      {/* ── MOBILE MENU DRAWER ────────────────────────────────── */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Overlay backdrop */}
          <div
            className="fixed inset-0 bg-[#080A0F]/80 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer content */}
          <div className="fixed inset-y-0 left-0 w-64 bg-[#161B27] border-r border-[#2A3045] p-5 flex flex-col justify-between z-10 animate-slide-in">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <span className="font-serif text-lg font-extrabold text-[#E8EAF0]">PRAXIS</span>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 rounded-md text-[#9AA0B4] hover:text-[#E8EAF0] focus:outline-none"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              <nav className="flex-1 space-y-1">
                {navigationItems
                  .filter((item) => item.visible)
                  .map((item) => {
                    const isActive = pathname.startsWith(item.href);
                    return (
                      <a
                        key={item.name}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-[#6C63FF] text-[#FFFFFF] font-semibold'
                            : 'text-[#9AA0B4] hover:bg-[#1E2535] hover:text-[#E8EAF0]'
                        }`}
                      >
                        {item.icon}
                        {item.name}
                      </a>
                    );
                  })}
              </nav>
            </div>

            <div className="pt-4 border-t border-[#2A3045]">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-full bg-[#6C63FF]/20 flex items-center justify-center font-bold text-[#6C63FF]">
                  {currentUser.name[0]}
                </div>
                <div className="truncate">
                  <p className="text-sm font-semibold truncate text-[#E8EAF0]">
                    {currentUser.name}
                  </p>
                  <p className="text-xs text-[#9AA0B4] truncate">{currentUser.email}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 h-9 rounded-lg border border-[#2A3045] text-xs font-semibold text-[#F87171] hover:bg-[#F87171]/10 transition-colors"
              >
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
