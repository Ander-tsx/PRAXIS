import { forwardRef, type InputHTMLAttributes } from 'react';

export interface FloatingLabelInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export const FloatingLabelInput = forwardRef<HTMLInputElement, FloatingLabelInputProps>(
  ({ label, className = '', id, ...props }, ref) => {
    return (
      <div className="group relative border border-white/20 rounded-md px-3 pt-6 pb-2 focus-within:border-white/50 focus-within:ring-1 focus-within:ring-white/30 transition-all">
        <label
          htmlFor={id}
          className="absolute top-2 left-3 text-xs text-white group-focus-within:text-white transition-colors pointer-events-none"
        >
          {label}
        </label>
        <input
          ref={ref}
          id={id}
          className={`w-full bg-transparent text-white outline-none text-base ${className}`}
          {...props}
        />
      </div>
    );
  },
);

FloatingLabelInput.displayName = 'FloatingLabelInput';
