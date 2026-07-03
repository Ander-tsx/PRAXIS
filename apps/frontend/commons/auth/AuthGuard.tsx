'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getActiveRoleClient } from './index';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const role = getActiveRoleClient();
    if (!role) {
      // Redirigir a la landing page si no está logueado
      router.push('/');
    } else {
      setAuthorized(true);
    }
  }, [router]);

  if (!authorized) {
    return (
      <div
        className="flex h-screen w-screen items-center justify-center"
        style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-text-secondary)' }}
      >
        <div className="flex flex-col items-center gap-3">
          <span
            className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
            style={{
              borderColor:
                'var(--color-primary) transparent var(--color-primary) var(--color-primary)',
            }}
          />
          <p className="font-sans text-sm font-medium">Verificando credenciales...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
