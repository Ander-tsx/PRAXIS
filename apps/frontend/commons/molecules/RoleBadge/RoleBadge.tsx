import { alpha } from '../../tokens/colors';

export interface RoleBadgeProps {
  /** Number displayed inside the circle */
  index: number;
  role: string;
  tagline: string;
  /** CSS color value for the role accent */
  color: string;
  /** Optional label above role name */
  label?: string;
}

/**
 * RoleBadge — molecule for HowItWorks role cards.
 * Shows a numbered avatar circle with role name and tagline.
 */
export function RoleBadge({ index, role, tagline, color, label = 'Rol' }: RoleBadgeProps) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center font-display text-lg font-bold flex-shrink-0"
        style={{
          background: alpha(color, 12),
          color: color,
          border: `1px solid ${alpha(color, 30)}`,
        }}
        aria-hidden="true"
      >
        {index}
      </div>
      <div>
        <div className="font-sans text-xs text-white uppercase tracking-widest">{label}</div>
        <div className="font-serif text-lg font-semibold" style={{ color }}>
          {role}
        </div>
      </div>
    </div>
  );
}
