'use client';

import { AuthForm, Button, Input } from '@praxis/commons';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useState } from 'react';

/**
 * Elegir contraseña nueva con el enlace del correo.
 *
 * ⚠️ **El token llega en la URL y no se envía a ningún sitio hasta que se pulsa
 * guardar.** No se «canjea» al abrir la página para comprobar si vale: los
 * clientes de correo y los antivirus **abren los enlaces** para analizarlos, y
 * con un canje al cargar, el token se gastaría solo antes de que la persona
 * llegue a escribir nada.
 *
 * ⚠️ `useSearchParams` obliga a un `<Suspense>` alrededor. Sin él, Next se
 * niega a construir la página: la marcaría como dinámica entera.
 */
export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <Suspense fallback={<p className="font-sans text-sm text-text-secondary">Cargando…</p>}>
        <Formulario />
      </Suspense>
    </main>
  );
}

function Formulario() {
  const token = useSearchParams().get('token') ?? '';

  const [password, setPassword] = useState('');
  const [repetida, setRepetida] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  /* Se valida aquí además de en el servidor: el mensaje llega antes y señala el
     campo, que es la regla del repo para cualquier formulario. */
  const problema =
    password.length > 0 && password.length < 8
      ? 'La contraseña debe tener al menos 8 caracteres.'
      : repetida.length > 0 && password !== repetida
        ? 'Las dos contraseñas no coinciden.'
        : null;

  const puedeEnviar = password.length >= 8 && password === repetida && token !== '';

  async function onSubmit(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!puedeEnviar || enviando) return;

    setError(null);
    setEnviando(true);

    const respuesta = await fetch('/auth/api/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });

    setEnviando(false);

    if (!respuesta.ok) {
      const cuerpo = await respuesta.json().catch(() => ({}));
      setError(cuerpo.message ?? 'No se pudo cambiar la contraseña.');
      return;
    }

    setListo(true);
  }

  if (!token) {
    return (
      <Marco titulo="Falta el enlace">
        <p className="mb-6 font-sans text-sm leading-relaxed text-text-secondary">
          Esta pantalla se abre desde el enlace que te mandamos por correo. Pide uno nuevo si
          llegaste aquí de otra forma.
        </p>
        <Link
          href="/auth/forgot-password"
          className="font-sans text-sm text-primary hover:underline"
        >
          Pedir un enlace
        </Link>
      </Marco>
    );
  }

  if (listo) {
    return (
      <Marco titulo="Contraseña cambiada">
        <p className="mb-6 font-sans text-sm leading-relaxed text-text-secondary">
          Ya puedes entrar con la nueva. Por seguridad hemos cerrado las sesiones que hubiera
          abiertas en otros dispositivos.
        </p>
        <Link href="/auth/login" className="font-sans text-sm text-primary hover:underline">
          Entrar
        </Link>
      </Marco>
    );
  }

  return (
    <AuthForm
      title="Elige una contraseña nueva"
      subtitle="Al guardarla se cerrarán las sesiones abiertas en otros dispositivos."
      errorMessage={error ?? undefined}
      onSubmit={onSubmit}
      submitButton={
        <Button type="submit" fullWidth isLoading={enviando} disabled={!puedeEnviar}>
          Guardar la contraseña
        </Button>
      }
    >
      <Input
        name="password"
        type="password"
        label="Contraseña nueva"
        value={password}
        onChange={(evento) => setPassword(evento.target.value)}
        placeholder="Al menos 8 caracteres"
        autoComplete="new-password"
        withPasswordToggle
        required
        fullWidth
      />
      <Input
        name="repetida"
        type="password"
        label="Repítela"
        value={repetida}
        onChange={(evento) => setRepetida(evento.target.value)}
        autoComplete="new-password"
        required
        fullWidth
        variant={problema ? 'error' : 'default'}
        message={problema ?? undefined}
      />
    </AuthForm>
  );
}

function Marco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8">
      <h1 className="mb-2 font-display text-3xl text-text-primary">{titulo}</h1>
      {children}
    </div>
  );
}
