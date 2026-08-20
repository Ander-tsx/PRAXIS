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
          'group flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
          isDisabled
            ? 'cursor-not-allowed border-border-subtle bg-surface/50 opacity-70'
            : 'border-border hover:border-primary/50 hover:bg-surface-elevated has-[:checked]:border-primary has-[:checked]:bg-primary/5',
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
          className="peer sr-only"
          {...props}
        />

        <span className="mt-[2px] flex h-4 w-4 shrink-0 items-center justify-center rounded border border-text-disabled transition-colors peer-checked:border-primary peer-checked:bg-primary peer-checked:[&>svg]:opacity-100 peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-disabled:opacity-50">
          <svg
            className="h-3 w-3 text-text-inverse opacity-0 transition-opacity"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3.5}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </span>

        <span className="flex min-w-0 flex-col gap-0.5">
          <span
            className={`font-sans text-sm font-medium ${implied ? 'text-text-secondary' : 'text-text-primary'}`}
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
