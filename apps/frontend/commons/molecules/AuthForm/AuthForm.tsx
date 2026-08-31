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
  /**
   * Otras formas de entrar (ej: el botón de Google), bajo un separador.
   *
   * Va fuera del `<form>` a propósito: son caminos alternativos, no campos que
   * se envíen con él. Meterlas dentro haría que Enter en un campo intentara
   * enviar también lo que no es un formulario.
   */
  alternatives?: ReactNode;
  /** Enlace secundario (ej: "¿Ya tienes cuenta?") */
  footer?: ReactNode;
  /** Handler del submit — la page conecta la lógica */
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  /**
   * Sin tarjeta propia — nada de borde, fondo, sombra ni radio. Para cuando
   * ya vive dentro de un contenedor que aporta esa superficie (`AuthPanel`);
   * la tarjeta por defecto duplicaba el contorno del panel y la sombra —
   * calculada con el overlay del tema oscuro— desentonaba contra un fondo
   * claro.
   */
  bare?: boolean;
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
  alternatives,
  footer,
  onSubmit,
  bare = false,
}: AuthFormProps) {
  return (
    <div
      className={
        bare ? 'w-full max-w-md' : 'w-full max-w-md rounded-2xl border border-border bg-surface p-8'
      }
      style={bare ? undefined : { boxShadow: `0 8px 48px ${alpha(colors.overlay, 40)}` }}
    >
      {/* Header */}
      <div className="mb-8 flex flex-col gap-1">
        <h1 className="font-display text-3xl text-text-primary">{title}</h1>
        {subtitle && <p className="font-sans text-sm text-white">{subtitle}</p>}
      </div>

      {/* Error global — un punto y texto, no una caja de color: la misma
          señal que el resto del sistema (LandingAutomation, por ejemplo),
          en vez de una alerta de manual de estilos. */}
      {errorMessage && (
        <div role="alert" className="mb-5 flex items-start gap-2.5">
          <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-error" aria-hidden="true" />
          <p className="font-sans text-sm leading-relaxed text-error">{errorMessage}</p>
        </div>
      )}

      {/* Formulario */}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {children}

        <div className="mt-2">{submitButton}</div>
      </form>

      {/* Otras formas de entrar */}
      {alternatives && (
        <>
          <div className="my-6 flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            <span className="font-sans text-xs text-white">o</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          {alternatives}
        </>
      )}

      {/* Footer */}
      {footer && (
        <div className="mt-6 text-center font-sans text-sm text-white">{footer}</div>
      )}
    </div>
  );
}
