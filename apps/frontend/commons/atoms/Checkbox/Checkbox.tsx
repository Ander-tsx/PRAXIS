'use client';

import { type InputHTMLAttributes, type ReactNode, forwardRef } from 'react';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  /** Texto de apoyo bajo la etiqueta. */
  hint?: ReactNode;
  /**
   * Marcado por una razón externa, no por elección directa.
   *
   * Lo usan los permisos: conceder "eliminar" implica "editar" y "crear", así
   * que esos aparecen marcados pero no se pueden desmarcar por su cuenta. Sin
   * esta distinción visual el usuario cree que está dando menos de lo que da.
   */
  implied?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, hint, implied = false, className = '', disabled, id, ...props }, ref) => {
    const isDisabled = disabled || implied;

    return (
      <label
        htmlFor={id}
        className={[
          'flex items-start gap-3 rounded-lg border p-3 transition-colors',
          isDisabled
            ? 'cursor-not-allowed border-border-subtle'
            : 'cursor-pointer border-border hover:border-border-strong hover:bg-surface-elevated',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <input
          ref={ref}
          id={id}
          type="checkbox"
          disabled={isDisabled}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-[inherit] accent-primary"
          {...props}
        />

        <span className="flex min-w-0 flex-col gap-0.5">
          <span
            className={`font-sans text-sm ${implied ? 'text-text-secondary' : 'text-text-primary'}`}
          >
            {label}
          </span>
          {hint && <span className="font-sans text-xs text-text-disabled">{hint}</span>}
        </span>
      </label>
    );
  },
);

Checkbox.displayName = 'Checkbox';
