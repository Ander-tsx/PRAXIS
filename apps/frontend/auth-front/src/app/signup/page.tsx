'use client';

import { Button, Input } from '@praxis/commons/atoms';
import { AuthForm } from '@praxis/commons/molecules';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [globalError, setGlobalError] = useState('');
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
        // El BFF hace auto-login y setea la cookie — redirigimos al shell
        router.push('/');
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
