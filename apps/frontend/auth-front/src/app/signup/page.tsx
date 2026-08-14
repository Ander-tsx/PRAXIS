'use client';

import { BotonGoogle } from '@/components/organisms/BotonGoogle';
import { navigateAfterAuth } from '@/lib/navigation';
import { Button, Input } from '@praxis/commons/atoms';
import { AuthForm } from '@praxis/commons/molecules';
import Link from 'next/link';
import { useState } from 'react';

// Validación espejo de RegisterDto del backend
// email: formato válido, password: 8-64 caracteres
function validateForm(
  email: string,
  password: string,
  confirmPassword: string,
): {
  emailError: string;
  passwordError: string;
  confirmError: string;
} {
  const errors = { emailError: '', passwordError: '', confirmError: '' };

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.emailError = 'El email no tiene un formato válido.';
  }
  if (!password || password.length < 8) {
    errors.passwordError = 'La contraseña debe tener al menos 8 caracteres.';
  } else if (password.length > 64) {
    errors.passwordError = 'La contraseña no puede superar 64 caracteres.';
  }
  if (password && confirmPassword && password !== confirmPassword) {
    errors.confirmError = 'Las contraseñas no coinciden.';
  }

  return errors;
}

/**
 * SignupPage — page (nivel 5 Atomic Design)
 * Conecta lógica de negocio: estado, validación, fetch al BFF /api/signup,
 * que internamente hace auto-login tras un registro exitoso.
 */
export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [globalError, setGlobalError] = useState('');
  /** La cuenta se creó y falta que abra el correo. */
  const [registrado, setRegistrado] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Limpiar errores previos
    setEmailError('');
    setPasswordError('');
    setConfirmError('');
    setGlobalError('');

    // Validación cliente
    const errors = validateForm(email, password, confirmPassword);
    if (errors.emailError || errors.passwordError || errors.confirmError) {
      setEmailError(errors.emailError);
      setPasswordError(errors.passwordError);
      setConfirmError(errors.confirmError);
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/auth/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Solo enviamos email y password — confirmPassword es solo validación UI
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        /* ⚠️ Ya no se navega al panel: registrarse **no inicia sesión** desde
           que hay confirmación por correo. Antes se entraba en el acto, y eso
           sería la puerta trasera que anula la confirmación entera. */
        setRegistrado(true);
        return;
      }

      const data = await res.json().catch(() => ({}));

      // Mapeo de mensajes del backend
      if (res.status === 409 || data?.message?.toLowerCase().includes('already')) {
        setGlobalError('Este email ya está registrado. Prueba iniciar sesión.');
      } else if (res.status === 400) {
        setGlobalError(data?.message ?? 'Los datos enviados no son válidos.');
      } else {
        setGlobalError('Ocurrió un error al crear la cuenta. Intenta de nuevo.');
      }
    } catch {
      setGlobalError('No se pudo conectar con el servidor. Intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Alta con Google.
   *
   * Es el **mismo** endpoint que en el login, y no un «registro con Google»
   * aparte: quien decide si la cuenta se crea o ya existía es el servidor, que
   * es el único que puede saberlo. Tener dos rutas obligaría al navegador a
   * adivinarlo, y adivinar mal significaría rechazar a alguien que ya tiene
   * cuenta o duplicarla.
   */
  const handleGoogle = async (idToken: string) => {
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
      setGlobalError(data?.message ?? 'No se pudo crear la cuenta con Google.');
    } catch {
      setGlobalError('No se pudo conectar con el servidor. Intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  if (registrado) {
    return (
      /* Centrado igual que el formulario: esta pantalla lo sustituye, así que
         sin el `<main>` la tarjeta saltaba a la esquina al registrarse. */
      <main className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8">
          <h1 className="mb-2 font-display text-3xl text-text-primary">Mira tu correo</h1>
          <p className="mb-6 font-sans text-sm leading-relaxed text-text-secondary">
            Hemos mandado un enlace a <strong className="text-text-primary">{email}</strong>. Ábrelo
            para confirmar la cuenta y poder entrar. Caduca en 24 horas.
          </p>
          <p className="mb-6 font-sans text-xs text-text-disabled">
            Si no aparece en unos minutos, mira en la carpeta de spam.
          </p>
          <Link href="/login">
            <Button fullWidth variant="secondary">
              Ir a entrar
            </Button>
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <AuthForm
        title="Crear cuenta"
        subtitle="Únete a PRAXIS y empieza a gestionar tus proyectos."
        errorMessage={globalError}
        onSubmit={handleSubmit}
        submitButton={
          <Button type="submit" fullWidth isLoading={isLoading} disabled={isLoading}>
            Crear cuenta
          </Button>
        }
        alternatives={
          <BotonGoogle
            clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ''}
            onCredencial={handleGoogle}
            deshabilitado={isLoading}
          />
        }
        footer={
          <>
            ¿Ya tienes cuenta?{' '}
            <Link
              href="/login"
              className="font-medium text-primary hover:text-primary-hover underline underline-offset-2 transition-colors"
            >
              Iniciar sesión
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
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          variant={passwordError ? 'error' : 'default'}
          message={passwordError}
          withPasswordToggle
          fullWidth
          disabled={isLoading}
          required
        />

        <Input
          id="confirm-password"
          type="password"
          label="Confirmar contraseña"
          placeholder="Repite tu contraseña"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          variant={confirmError ? 'error' : 'default'}
          message={confirmError}
          withPasswordToggle
          fullWidth
          disabled={isLoading}
          required
        />
      </AuthForm>
    </main>
  );
}
