import type { ReactNode } from 'react';
import { alpha, colors } from '../../tokens';

export interface AuthFormProps {
  /** Título principal del formulario */
  title: string;
  /** Subtítulo/descripción */
  subtitle?: string;
  /** Mensaje de error global del formulario */
  errorMessage?: string;
  /** Campos del formulario (átomos Input) */
  children: ReactNode;
  /** Botón de submit (átomo Button) */
  submitButton: ReactNode;
  /** Enlace secundario (ej: "¿Ya tienes cuenta?") */
  footer?: ReactNode;
  /** Handler del submit — la page conecta la lógica */
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

/**
 * AuthForm — molécula
 * Contenedor de pantallas de autenticación: título + slot de campos + submit + footer.
 * Solo recibe ReactNode para campos y botón — no sabe de lógica de negocio.
 * La lógica (fetch, validación, estado) vive en la page que la usa.
 */
export function AuthForm({
  title,
  subtitle,
  errorMessage,
  children,
  submitButton,
  footer,
  onSubmit,
}: AuthFormProps) {
  return (
    <div
      className="w-full max-w-md rounded-2xl border border-border bg-surface p-8"
      style={{ boxShadow: `0 8px 48px ${alpha(colors.overlay, 40)}` }}
    >
      {/* Header */}
      <div className="mb-8 flex flex-col gap-1">
        <h1 className="font-display text-3xl text-text-primary">{title}</h1>
        {subtitle && <p className="font-sans text-sm text-text-secondary">{subtitle}</p>}
      </div>

      {/* Error global */}
      {errorMessage && (
        <div
          role="alert"
          className={[
            'mb-5 rounded-lg border border-error/30 bg-error-muted',
            'px-4 py-3 font-sans text-sm text-error',
          ].join(' ')}
        >
          {errorMessage}
        </div>
      )}

      {/* Formulario */}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {children}

        <div className="mt-2">{submitButton}</div>
      </form>

      {/* Footer */}
      {footer && (
        <div className="mt-6 text-center font-sans text-sm text-text-secondary">{footer}</div>
      )}
    </div>
  );
}
