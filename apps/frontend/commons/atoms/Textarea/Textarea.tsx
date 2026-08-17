'use client';

import { type TextareaHTMLAttributes, forwardRef } from 'react';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  /** Marca visualmente que el campo puede quedarse vacío. */
  optional?: boolean;
  message?: string;
  variant?: 'default' | 'error';
  /** Muestra `usado/maxLength` bajo el campo. Requiere `maxLength`. */
  showCount?: boolean;
  fullWidth?: boolean;
}

const variantClasses = {
  default:
    'border-border hover:border-border-strong focus:border-primary focus:ring-2 focus:ring-primary/20',
  error: 'border-error focus:border-error focus:ring-2 focus:ring-error/20',
} as const;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      optional = false,
      message,
      variant = 'default',
      showCount = false,
      fullWidth = false,
      className = '',
      id,
      rows = 3,
      value,
      maxLength,
      ...props
    },
    ref,
  ) => {
    const used = typeof value === 'string' ? value.length : 0;

    return (
      <div className={`flex flex-col gap-1.5 ${fullWidth ? 'w-full' : ''}`}>
        {label && (
          <label htmlFor={id} className="font-sans text-sm font-medium text-text-primary">
            {label} {optional && <span className="text-text-disabled">(opcional)</span>}
          </label>
        )}

        <textarea
          ref={ref}
          id={id}
          rows={rows}
          value={value}
          maxLength={maxLength}
          className={[
            'w-full resize-y min-h-[80px] rounded-lg border bg-surface-elevated px-3 py-2',
            'font-sans text-sm text-text-primary placeholder:text-text-disabled',
            'outline-none transition-all duration-150',
            'disabled:cursor-not-allowed disabled:opacity-50',
            variantClasses[variant],
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          {...props}
        />

        <div className="flex items-start justify-between gap-3">
          {message ? (
            <p
              className={`font-sans text-xs ${variant === 'error' ? 'text-error' : 'text-text-secondary'}`}
            >
              {message}
            </p>
          ) : (
            <span />
          )}

          {showCount && maxLength !== undefined && (
            <span className="shrink-0 font-sans text-xs text-text-disabled">
              {used}/{maxLength}
            </span>
          )}
        </div>
      </div>
    );
  },
);

Textarea.displayName = 'Textarea';
