'use client';

import { Button } from '@praxis/commons';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

type Estado = 'comprobando' | 'listo' | 'fallo' | 'sin-token';

/**
 * Confirma el correo con el token del enlace.
 *
 * A diferencia de restablecer la contraseña, aquí **sí** se canjea al cargar:
 * el enlace no lleva a ningún formulario, así que pedir «pulsa para confirmar»
 * sería un clic sin ninguna decisión detrás.
 *
 * ⚠️ El canje se lanza **una sola vez** aunque el efecto se ejecute dos —React
 * en desarrollo monta, desmonta y vuelve a montar—. Sin el cerrojo, la segunda
 * llamada encuentra el token ya usado y la pantalla dice que el enlace no vale
 * justo después de haberlo canjeado bien.
 */
export default function VerifyEmailPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <Suspense fallback={<p className="font-sans text-sm text-text-secondary">Comprobando…</p>}>
        <Comprobacion />
      </Suspense>
    </main>
  );
}

function Comprobacion() {
  const token = useSearchParams().get('token') ?? '';
  const [estado, setEstado] = useState<Estado>(token ? 'comprobando' : 'sin-token');
  const [mensaje, setMensaje] = useState('');
  const lanzado = useRef(false);

  useEffect(() => {
    if (!token || lanzado.current) return;
    lanzado.current = true;

    (async () => {
      const respuesta = await fetch('/auth/api/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      if (respuesta.ok) {
        setEstado('listo');
        return;
      }

      const cuerpo = await respuesta.json().catch(() => ({}));
      setMensaje(cuerpo.message ?? 'Este enlace ya no sirve.');
      setEstado('fallo');
    })();
  }, [token]);

  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8">
      {estado === 'comprobando' && (
        <>
          <h1 className="mb-2 font-display text-3xl text-text-primary">Confirmando…</h1>
          <p className="font-sans text-sm text-text-secondary">Un momento.</p>
        </>
      )}

      {estado === 'listo' && (
        <>
          <h1 className="mb-2 font-display text-3xl text-text-primary">Correo confirmado</h1>
          <p className="mb-6 font-sans text-sm leading-relaxed text-text-secondary">
            Tu cuenta ya está lista. Entra con tu correo y tu contraseña.
          </p>
          <Link href="/auth/login">
            <Button fullWidth>Entrar</Button>
          </Link>
        </>
      )}

      {(estado === 'fallo' || estado === 'sin-token') && (
        <>
          <h1 className="mb-2 font-display text-3xl text-text-primary">Este enlace no vale</h1>
          <p className="mb-6 font-sans text-sm leading-relaxed text-text-secondary">
            {estado === 'sin-token'
              ? 'Esta pantalla se abre desde el enlace que te mandamos por correo.'
              : mensaje}{' '}
            Intenta entrar y te ofreceremos mandarte uno nuevo.
          </p>
          <Link href="/auth/login">
            <Button fullWidth variant="secondary">
              Ir a entrar
            </Button>
          </Link>
        </>
      )}
    </div>
  );
}
