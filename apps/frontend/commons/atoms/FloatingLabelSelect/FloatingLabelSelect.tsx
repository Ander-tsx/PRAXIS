import { forwardRef, type SelectHTMLAttributes } from 'react';

export interface FloatingLabelSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: { value: string; label: string }[];
}

export const FloatingLabelSelect = forwardRef<HTMLSelectElement, FloatingLabelSelectProps>(
  ({ label, options, className = '', id, ...props }, ref) => {
    return (
      <div className="group relative border border-white/20 rounded-md px-3 pt-6 pb-2 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
        <label
          htmlFor={id}
          className="absolute top-2 left-3 text-xs text-white group-focus-within:text-primary transition-colors pointer-events-none"
        >
          {label}
        </label>
        <select
          ref={ref}
          id={id}
          className={`w-full bg-transparent text-white outline-none text-base appearance-none ${className}`}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-[#1a1a1a] text-white">
              {opt.label}
            </option>
          ))}
        </select>
        {/* Dropdown arrow icon */}
        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
          <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    );
  }
);

FloatingLabelSelect.displayName = 'FloatingLabelSelect';
