'use client';

import { alpha } from '../../tokens';
import { GLYPHS, GLYPH_COLORS } from './glyphs';

export interface GlyphSelection {
  /** `null` = sin icono, se vuelve al monograma de letras. */
  iconKey: string | null;
  /** `#rrggbb`. Nunca `null` mientras haya icono; se ignora si `iconKey` es `null`. */
  color: string;
}

export interface GlyphPickerProps {
  value: GlyphSelection;
  onChange: (value: GlyphSelection) => void;
  /** Deshabilita todo (por ejemplo, mientras guarda o si no tienes permiso). */
  disabled?: boolean;
}

/**
 * El selector de icono y color, para el modal de configuración de un proyecto o
 * de una organización.
 *
 * Controlado: no guarda nada, solo emite `{ iconKey, color }`. Quien lo monta
 * pinta la vista previa (un `Glyph` o el monograma) y decide qué hacer con el
 * valor al guardar.
 *
 * «Sin icono» es una opción de primera clave, no una ausencia: es como se
 * vuelve al monograma de letras después de haber elegido uno.
 */
export function GlyphPicker({ value, onChange, disabled = false }: GlyphPickerProps) {
  const color = value.color || GLYPH_COLORS[6];

  return (
    <div className="flex flex-col gap-4">
      {/* ── Color ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-white">Color</span>
        <div className="flex flex-wrap gap-2">
          {GLYPH_COLORS.map((c) => {
            const activo = c.toLowerCase() === color.toLowerCase();
            return (
              <button
                key={c}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ ...value, color: c })}
                aria-label={`Color ${c}`}
                aria-pressed={activo}
                className="h-7 w-7 rounded-full transition-transform hover:scale-110 disabled:opacity-40 disabled:hover:scale-100"
                style={{
                  background: c,
                  boxShadow: activo ? `0 0 0 2px #080807, 0 0 0 4px ${c}` : 'none',
                }}
              />
            );
          })}
        </div>
      </div>

      {/* ── Icono ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-white">Icono</span>
        <div className="grid grid-cols-8 gap-1.5 max-h-52 overflow-y-auto scrollbar-none rounded-lg border border-white/10 p-2 sm:grid-cols-9">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange({ ...value, iconKey: null })}
            aria-label="Sin icono"
            aria-pressed={value.iconKey === null}
            title="Sin icono — vuelve a las iniciales"
            className={`flex aspect-square items-center justify-center rounded-md border text-white transition-colors hover:text-white disabled:opacity-40 ${
              value.iconKey === null
                ? 'border-white/40 bg-white/10 text-white'
                : 'border-white/10 hover:bg-white/5'
            }`}
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
            </svg>
          </button>

          {GLYPHS.map(({ key, label, Icon }) => {
            const activo = value.iconKey === key;
            return (
              <button
                key={key}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ ...value, iconKey: key })}
                aria-label={label}
                aria-pressed={activo}
                title={label}
                className={`flex aspect-square items-center justify-center rounded-md border transition-colors disabled:opacity-40 ${
                  activo
                    ? 'border-transparent'
                    : 'border-white/10 text-white hover:bg-white/5 hover:text-white'
                }`}
                style={
                  activo
                    ? {
                        background: alpha(color, 18),
                        color,
                        boxShadow: `inset 0 0 0 1px ${alpha(color, 45)}`,
                      }
                    : undefined
                }
              >
                <Icon size={17} strokeWidth={2} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
