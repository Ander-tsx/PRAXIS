'use client';

import { BotonGoogle } from '@/components/organisms/BotonGoogle';
import { navigateAfterAuth } from '@/lib/navigation';
import { alpha, colors } from '@praxis/commons';
import { Button, Input } from '@praxis/commons/atoms';
import { AuthForm } from '@praxis/commons/molecules';
import Link from 'next/link';
import { useState } from 'react';

// Validación espejo de LoginDto del backend
// email: formato válido, password: 8-64 caracteres
function validateForm(email: string, password: string): string | null {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'El email no tiene un formato válido.';
  }
  if (!password || password.length < 8) {
    return 'La contraseña debe tener al menos 8 caracteres.';
  }
  if (password.length > 64) {
    return 'La contraseña no puede superar 64 caracteres.';
  }
  return null;
}

/**
 * LoginPage — page (nivel 5 Atomic Design)
 * Conecta lógica de negocio: estado, validación, fetch al BFF, redirección.
 * Renderiza AuthForm (molécula) con átomos Input y Button como slots.
 */
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [globalError, setGlobalError] = useState('');
  /** El correo de esta cuenta está sin confirmar. No es un error del formulario. */
  const [sinConfirmar, setSinConfirmar] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Limpiar errores previos
    setEmailError('');
    setPasswordError('');
    setGlobalError('');
    setSinConfirmar(false);

    // Validación cliente antes de la petición
    const validationError = validateForm(email, password);
    if (validationError) {
      if (validationError.includes('email')) {
        setEmailError(validationError);
      } else {
        setPasswordError(validationError);
      }
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/auth/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        // Cookie httpOnly seteada por el BFF. Navegación dura: router.push('/')
        // se convertiría en '/auth/' por el basePath y no saldría de la zona.
        navigateAfterAuth();
        return;
      }

      const data = await res.json().catch(() => ({}));

      // Mapeo de mensajes del backend a español
      if (res.status === 403 && data?.code === 'EMAIL_NOT_VERIFIED') {
        /* No es un error del formulario: es un paso que falta. Se saca del
           hueco de errores para poder ofrecer el botón de reenviar. */
        setSinConfirmar(true);
        setGlobalError('');
      } else if (res.status === 401) {
        setGlobalError('Credenciales inválidas. Verifica tu email y contraseña.');
      } else if (res.status === 400) {
        setGlobalError(data?.message ?? 'Los datos enviados no son válidos.');
      } else {
        setGlobalError('Ocurrió un error al iniciar sesión. Intenta de nuevo.');
      }
    } catch {
      setGlobalError('No se pudo conectar con el servidor. Intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Entrada con Google. La lógica vive aquí, en la page, igual que la del
   * formulario: `BotonGoogle` solo dibuja y entrega el token.
   */
  const handleGoogle = async (idToken: string) => {
    setEmailError('');
    setPasswordError('');
    setGlobalError('');
    setIsLoading(true);

    try {
      const res = await fetch('/auth/api/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      if (res.ok) {
        navigateAfterAuth();
        return;
      }

      const data = await res.json().catch(() => ({}));

      /* El 409 se muestra tal cual: es el único mensaje que explica algo que la
         persona puede resolver —entrar con su contraseña y vincular después—.
         Generalizarlo la dejaría sin saber qué hacer. */
      setGlobalError(data?.message ?? 'No se pudo iniciar sesión con Google.');
    } catch {
      setGlobalError('No se pudo conectar con el servidor. Intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <AuthForm
        title="Iniciar sesión"
        subtitle="Bienvenido de vuelta a PRAXIS."
        errorMessage={globalError}
        onSubmit={handleSubmit}
        submitButton={
          <Button type="submit" fullWidth isLoading={isLoading} disabled={isLoading}>
            Entrar
          </Button>
        }
        alternatives={
          <>
            {sinConfirmar && <AvisoDeConfirmacion email={email} />}
            <BotonGoogle
              clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ''}
              onCredencial={handleGoogle}
              deshabilitado={isLoading}
            />
          </>
        }
        footer={
          <>
            <Link
              href="/auth/olvide"
              className="font-medium text-primary hover:text-primary-hover underline underline-offset-2 transition-colors"
            >
              ¿Olvidaste tu contraseña?
            </Link>
            <span className="mx-2 text-text-disabled">·</span>
            ¿No tienes cuenta?{' '}
            <Link
              href="/signup"
              className="font-medium text-primary hover:text-primary-hover underline underline-offset-2 transition-colors"
            >
              Crear cuenta
            </Link>
          </>
        }
      >
        <Input
          id="email"
          type="email"
          label="Email"
          placeholder="tu@email.com"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          variant={emailError ? 'error' : 'default'}
          message={emailError}
          fullWidth
          disabled={isLoading}
          required
        />

        <Input
          id="password"
          type="password"
          label="Contraseña"
          placeholder="Mínimo 8 caracteres"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          variant={passwordError ? 'error' : 'default'}
          message={passwordError}
          withPasswordToggle
          fullWidth
          disabled={isLoading}
          required
        />
      </AuthForm>
    </main>
  );
}

/**
 * Lo que se enseña cuando la cuenta existe pero el correo está sin confirmar.
 *
 * No va en el hueco de errores del formulario a propósito: no es que hayas
 * escrito algo mal, es que falta un paso, y lleva un botón que lo resuelve. Un
 * mensaje rojo sin salida deja a la persona probando la contraseña otra vez.
 *
 * ⚠️ Al reenviar dice «listo» pase lo que pase, igual que el backend: esta
 * pantalla ya sabe que la cuenta existe —lo acaba de decir el 403— pero el
 * endpoint es público y responde igual para todos, así que no hay nada más
 * fino que informar.
 */
function AvisoDeConfirmacion({ email }: { email: string }) {
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function reenviar() {
    if (enviando || enviado) return;
    setEnviando(true);
    await fetch('/auth/api/reenviar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => undefined);
    setEnviando(false);
    setEnviado(true);
  }

  return (
    <div
      className="mb-4 rounded-lg border border-warning/30 p-4"
      style={{ background: alpha(colors.warning, 8) }}
    >
      <p className="font-sans text-sm font-medium text-text-primary">Confirma tu correo</p>
      <p className="mt-1 font-sans text-xs leading-relaxed text-text-secondary">
        Te mandamos un enlace a {email} cuando creaste la cuenta. Ábrelo y vuelve a entrar.
      </p>

      {enviado ? (
        <p className="mt-3 font-sans text-xs" style={{ color: colors.success }}>
          Listo, te lo hemos vuelto a mandar. Revisa también la carpeta de spam.
        </p>
      ) : (
        <button
          type="button"
          onClick={reenviar}
          disabled={enviando}
          className="mt-3 cursor-pointer font-sans text-xs font-semibold text-primary underline underline-offset-2 disabled:opacity-50"
        >
          {enviando ? 'Mandando…' : 'Mandármelo otra vez'}
        </button>
      )}
    </div>
  );
}
