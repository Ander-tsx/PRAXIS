import { Sparkle } from '@praxis/commons/atoms';
import type { ReactNode } from 'react';

export interface SectionHeaderProps {
  /** Small uppercase text above the heading */
  eyebrow?: string;
  heading: ReactNode;
  /** Optional subtitle/description below heading */
  subtitle?: ReactNode;
  /** Alignment of content */
  align?: 'center' | 'left';
  /** Show decorative sparkles around eyebrow */
  withSparkles?: boolean;
  className?: string;
}

/**
 * SectionHeader — molecule combining Sparkle + eyebrow + h2 + subtitle.
 * Used at the top of LandingFeatures and LandingHowItWorks sections.
 */
export function SectionHeader({
  eyebrow,
  heading,
  subtitle,
  align = 'center',
  withSparkles = true,
  className = '',
}: SectionHeaderProps) {
  const alignClass = align === 'center' ? 'items-center text-center' : 'items-start text-left';

  return (
    <div className={`flex flex-col gap-4 ${alignClass} ${className}`}>
      {eyebrow && (
        <div className={`flex items-center gap-3 ${align === 'center' ? 'justify-center' : ''}`}>
          {withSparkles && (
            <Sparkle
              size={14}
              style={{
                color: 'var(--color-accent)',
                animation: 'sparkle-spin 4s linear infinite',
              }}
            />
          )}
          <span className="font-sans text-xs font-medium text-accent tracking-widest uppercase">
            {eyebrow}
          </span>
          {withSparkles && (
            <Sparkle
              size={14}
              style={{
                color: 'var(--color-accent)',
                animation: 'sparkle-spin 4s linear infinite reverse',
              }}
            />
          )}
        </div>
      )}

      <h2 className="font-display text-4xl md:text-5xl text-text-primary">{heading}</h2>

      {subtitle && (
        <p className="font-serif italic text-lg text-text-secondary max-w-lg">{subtitle}</p>
      )}
    </div>
  );
}
