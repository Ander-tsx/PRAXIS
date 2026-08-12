'use client';

import { AuthForm, Button, Input } from '@praxis/commons';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';

/**
 * «Olvidé mi contraseña»: pide el correo y manda el enlace.
 *
 * ⚠️ **Al terminar dice lo mismo exista la cuenta o no**, y no es descuido de
 * redacción: el backend responde 200 en los dos casos justo para que esta
 * pantalla no pueda revelar quién está registrado. Un «no encontramos ese
 * correo» convertiría este formulario en un comprobador de cuentas.
 *
 * Por eso el mensaje habla en condicional —«si esa dirección tiene cuenta»— en
 * lugar de prometer un correo que quizá no se ha mandado.
 */
export default function OlvidePage() {
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  async function onSubmit(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviando) return;

    setError(null);
    setEnviando(true);

    const respuesta = await fetch('/auth/api/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    setEnviando(false);

    if (!respuesta.ok) {
      const cuerpo = await respuesta.json().catch(() => ({}));
      setError(cuerpo.message ?? 'No se pudo enviar el correo.');
      return;
    }

    setEnviado(true);
  }

  if (enviado) {
    return (
      <Aviso
        titulo="Mira tu correo"
        texto={`Si ${email} tiene una cuenta con contraseña, le acaba de llegar un enlace para elegir una nueva. Caduca en 30 minutos.`}
      />
    );
  }

  return (
    <AuthForm
      title="¿Olvidaste tu contraseña?"
      subtitle="Escribe tu correo y te mandamos un enlace para elegir otra."
      errorMessage={error ?? undefined}
      onSubmit={onSubmit}
      submitButton={
        <Button type="submit" fullWidth isLoading={enviando} disabled={!email.trim()}>
          Mandarme el enlace
        </Button>
      }
      footer={
        <Link href="/login" className="text-primary hover:underline">
          Volver a entrar
        </Link>
      }
    >
      <Input
        name="email"
        type="email"
        label="Correo"
        value={email}
        onChange={(evento) => setEmail(evento.target.value)}
        placeholder="tu@correo.com"
        autoComplete="email"
        required
        fullWidth
      />
    </AuthForm>
  );
}

/** Pantalla de «ya está», con el mismo marco que el formulario. */
function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8">
      <h1 className="mb-2 font-display text-3xl text-text-primary">{titulo}</h1>
      <p className="mb-6 font-sans text-sm leading-relaxed text-text-secondary">{texto}</p>
      <Link href="/login" className="font-sans text-sm text-primary hover:underline">
        Volver a entrar
      </Link>
    </div>
  );
}
