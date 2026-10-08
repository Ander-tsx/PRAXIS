'use client';

/**
 * Una casilla con el aspecto del sistema, no la del navegador.
 *
 * La nativa sale blanca y cuadrada, del tamaño y el color que decida cada
 * sistema operativo: en el panel oscuro era lo único que no parecía de Praxis.
 * Debajo sigue habiendo un `<input type="checkbox">` de verdad —`sr-only`—, así
 * que el teclado, el lector de pantalla y el `<label>` funcionan como siempre.
 */
export function CheckToggle({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
  hint?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="group flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.11] bg-white/[0.04] px-3 py-2.5 transition-colors hover:border-white/[0.2] has-[:checked]:border-primary/50 has-[:checked]:bg-primary/[0.08] has-[:disabled]:cursor-not-allowed has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40">
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {/* El cuadro: se enciende con `peer-checked`, que mira al input de al lado. */}
      <span
        aria-hidden="true"
        className="mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] border-white/30 transition-colors peer-checked:border-primary peer-checked:bg-primary peer-checked:[&>svg]:opacity-100"
      >
        <svg
          className="h-3 w-3 text-white opacity-0 transition-opacity"
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-sans text-sm text-text-primary">{label}</span>
        {hint && <span className="font-sans text-xs text-text-secondary">{hint}</span>}
      </span>
    </label>
  );
}
