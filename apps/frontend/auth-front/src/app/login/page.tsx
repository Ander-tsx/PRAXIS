'use client';

import { Button, Input } from '@praxis/commons/atoms';
import { AuthForm } from '@praxis/commons/molecules';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [globalError, setGlobalError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Limpiar errores previos
    setEmailError('');
    setPasswordError('');
    setGlobalError('');

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
        // Cookie httpOnly seteada por el BFF — redirigimos al shell
        router.push('/');
        return;
      }

      const data = await res.json().catch(() => ({}));

      // Mapeo de mensajes del backend a español
      if (res.status === 401) {
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
        footer={
          <>
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
