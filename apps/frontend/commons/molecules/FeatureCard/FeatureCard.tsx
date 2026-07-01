'use client';

import { useState, type ReactNode } from 'react';
import { Badge } from '@praxis/commons/atoms';

export interface FeatureCardData {
  id: number;
  icon: ReactNode;
  title: string;
  description: string;
  badge: string;
  overlay: ReactNode;
  /** Hex accent color for glow and badge */
  accent: string;
}

export interface FeatureCardProps {
  card: FeatureCardData;
}

/**
 * FeatureCard — molecule for the landing features grid.
 * Shows title+description by default; on hover fades them out
 * and reveals an animated overlay (passed as ReactNode).
 */
export function FeatureCard({ card }: FeatureCardProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="relative overflow-hidden"
        style={{
          background: hovered ? '#1a1a24' : '#13131a',
          border: '1px solid rgba(255,255,255,0.06)',
          borderColor: hovered ? `${card.accent}40` : 'rgba(255,255,255,0.06)',
          borderRadius: 16,
          minHeight: 200,
          transition:
            'background 0.3s ease, border-color 0.3s ease, transform 0.3s cubic-bezier(.22,1,.36,1), box-shadow 0.3s ease',
          transform: hovered ? 'translateY(-3px)' : 'none',
          boxShadow: hovered
            ? `0 0 0 1px ${card.accent}20, 0 12px 40px rgba(0,0,0,0.5), 0 0 60px ${card.accent}08`
            : 'none',
        }}
      >
        {/* Radial glow on hover */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 16,
            background: `radial-gradient(ellipse 80% 60% at 50% 110%, ${card.accent}12 0%, transparent 70%)`,
            opacity: hovered ? 1 : 0,
            transition: 'opacity 0.4s ease',
            pointerEvents: 'none',
          }}
        />

        {/* Header row */}
        <div className="flex items-start justify-between p-5 pb-3">
          {/* Icon box */}
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              border: `1px solid ${hovered ? `${card.accent}40` : 'rgba(255,255,255,0.06)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: hovered ? `${card.accent}15` : 'rgba(255,255,255,0.04)',
              color: hovered ? card.accent : 'rgba(255,255,255,0.3)',
              transition: 'all 0.3s ease',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                transform: hovered ? 'scale(1.1)' : 'none',
                transition: 'transform 0.3s ease',
              }}
            >
              {card.icon}
            </div>
          </div>

          {/* Badge + arrow */}
          <div className="flex items-center gap-2">
            <Badge
              style={{
                borderColor: hovered ? `${card.accent}35` : 'rgba(255,255,255,0.08)',
                background: hovered ? `${card.accent}10` : 'transparent',
                color: hovered ? card.accent : 'rgba(255,255,255,0.25)',
                transition: 'all 0.3s ease',
              }}
            >
              {card.badge}
            </Badge>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 20,
                height: 20,
                borderRadius: '50%',
                border: `1px solid ${hovered ? `${card.accent}50` : 'rgba(255,255,255,0.08)'}`,
                color: hovered ? card.accent : 'rgba(255,255,255,0.25)',
                fontSize: 12,
                transition: 'all 0.3s ease',
                transform: hovered ? 'translate(2px, -2px)' : 'none',
              }}
              aria-hidden="true"
            >
              →
            </span>
          </div>
        </div>

        {/* Default content — fades on hover */}
        <div
          className="px-5 pb-5"
          style={{
            opacity: hovered ? 0 : 1,
            transform: hovered ? 'translateY(6px)' : 'none',
            transition: 'opacity 0.25s ease, transform 0.25s ease',
          }}
        >
          <h3
            className="font-sans font-semibold mb-1.5"
            style={{ fontSize: '0.95rem', color: '#f0f0f5', letterSpacing: '-0.01em' }}
          >
            {card.title}
          </h3>
          <p
            className="font-sans"
            style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.65 }}
          >
            {card.description}
          </p>
        </div>

        {/* Hover overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: hovered ? 1 : 0,
            transform: hovered ? 'translateY(0)' : 'translateY(8px)',
            transition: 'opacity 0.3s ease, transform 0.3s cubic-bezier(.22,1,.36,1)',
            pointerEvents: hovered ? 'auto' : 'none',
          }}
        >
          {hovered && card.overlay}
        </div>
      </div>
    </div>
  );
}
