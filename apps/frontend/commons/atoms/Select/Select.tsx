'use client';

import { type SelectHTMLAttributes, forwardRef } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  /** Mensaje de error o de ayuda bajo el campo. */
  message?: string;
  variant?: 'default' | 'error';
  options: SelectOption[];
  /** Opción vacía inicial, para forzar una elección consciente. */
  placeholder?: string;
  fullWidth?: boolean;
}

const variantClasses = {
  default:
    'border-border hover:border-border-strong focus:border-primary focus:ring-2 focus:ring-primary/20',
  error: 'border-error focus:border-error focus:ring-2 focus:ring-error/20',
} as const;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      message,
      variant = 'default',
      options,
      placeholder,
      fullWidth = false,
      className = '',
      id,
      disabled,
      ...props
    },
    ref,
  ) => {
    return (
      <div className={`flex flex-col gap-1.5 ${fullWidth ? 'w-full' : ''}`}>
        {label && (
          <label htmlFor={id} className="font-sans text-sm font-medium text-text-primary">
            {label}
          </label>
        )}

        <div className="relative">
          <select
            ref={ref}
            id={id}
            disabled={disabled}
            className={[
              'h-10 w-full appearance-none rounded-lg border bg-surface-elevated py-2 pl-3 pr-9',
              'font-sans text-sm text-text-primary outline-none transition-all duration-150',
              'disabled:cursor-not-allowed disabled:opacity-50',
              variantClasses[variant],
              className,
            ]
              .filter(Boolean)
              .join(' ')}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>

          {/* `appearance-none` quita la flecha del sistema; la repone aquí. */}
          <svg
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {message && (
          <p
            className={`font-sans text-xs ${variant === 'error' ? 'text-error' : 'text-text-secondary'}`}
          >
            {message}
          </p>
        )}
      </div>
    );
  },
);

Select.displayName = 'Select';
