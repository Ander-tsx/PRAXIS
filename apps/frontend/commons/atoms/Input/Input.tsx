'use client';

import { type InputHTMLAttributes, forwardRef, useState } from 'react';

export type InputVariant = 'default' | 'error' | 'success';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Visual state of the input */
  variant?: InputVariant;
  /** Label text displayed above the input */
  label?: string;
  /** Error or helper message shown below the input */
  message?: string;
  /** When type="password", show a toggle to reveal/hide the value */
  withPasswordToggle?: boolean;
  /** Fills 100% of parent width */
  fullWidth?: boolean;
}

const variantClasses: Record<InputVariant, string> = {
  default:
    'border-border bg-surface-elevated text-text-primary placeholder:text-text-secondary ' +
    'hover:border-border-strong focus:border-primary focus:ring-2 focus:ring-primary/20',
  error:
    'border-error bg-surface-elevated text-text-primary placeholder:text-text-secondary ' +
    'focus:border-error focus:ring-2 focus:ring-error/20',
  success:
    'border-success bg-surface-elevated text-text-primary placeholder:text-text-secondary ' +
    'focus:border-success focus:ring-2 focus:ring-success/20',
};

const messageClasses: Record<InputVariant, string> = {
  default: 'text-text-secondary',
  error: 'text-error',
  success: 'text-success',
};

/**
 * Input — atom
 * Texto e password, con label, mensaje de error/ayuda y toggle de contraseña.
 * Sigue el mismo patrón que Button: forwardRef + props extendidas de HTML.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      variant = 'default',
      label,
      message,
      withPasswordToggle = false,
      fullWidth = false,
      className = '',
      type = 'text',
      id,
      disabled,
      ...props
    },
    ref,
  ) => {
    const [showPassword, setShowPassword] = useState(false);

    const isPassword = type === 'password';
    const resolvedType = isPassword && showPassword ? 'text' : type;

    return (
      <div className={`flex flex-col gap-1.5 ${fullWidth ? 'w-full' : ''}`}>
        {label && (
          <label htmlFor={id} className="font-sans text-sm font-medium text-text-primary">
            {label}
          </label>
        )}

        <div className="relative">
          <input
            ref={ref}
            id={id}
            type={resolvedType}
            disabled={disabled}
            className={[
              'h-10 w-full rounded-lg border px-3 py-2 font-sans text-sm',
              'outline-none transition-all duration-150',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              variantClasses[variant],
              isPassword && withPasswordToggle ? 'pr-10' : '',
              className,
            ]
              .filter(Boolean)
              .join(' ')}
            {...props}
          />

          {isPassword && withPasswordToggle && (
            <button
              type="button"
              tabIndex={-1}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              onClick={() => setShowPassword((prev) => !prev)}
              className={[
                'absolute right-3 top-1/2 -translate-y-1/2',
                'text-text-secondary hover:text-text-primary transition-colors',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded',
              ].join(' ')}
            >
              {showPassword ? (
                /* eye-off icon */
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                /* eye icon */
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          )}
        </div>

        {message && <p className={`font-sans text-xs ${messageClasses[variant]}`}>{message}</p>}
      </div>
    );
  },
);

Input.displayName = 'Input';
