import { l } from '@/lib/landingColors';
import { Reveal } from '@praxis/commons';

/**
 * La etiqueta pequeña que abre cada sección de la landing.
 *
 * ## Por qué existe
 *
 * Las cinco secciones ya escribían la misma etiqueta —mono, versalitas,
 * `tracking-widest`, en `--l-fg-muted`— y ninguna sabía de las otras: estaba
 * copiada cinco veces con `text-xs` en unas y `text-[0.68rem]` en otras, y el
 * `Reveal` con distinto retardo en cada una. Nada fallaba, pero la página se
 * leía como cinco bloques pegados en vez de como un mismo documento.
 *
 * Con un solo componente el ritmo de arranque de sección es idéntico en toda
 * la página, que es la mitad de lo que hace que algo parezca «del mismo sitio».
 *
 * ## El punto
 *
 * Un cuadrito de 6 px en el acento de marca antes del texto. Es uno de los
 * cuatro sitios donde entra color en toda la landing —ver
 * `commons/styles/landing-theme.css`— y el que más trabaja: se repite cinco
 * veces bajando por la página, así que ata las secciones entre sí **y** con la
 * aplicación, donde ese mismo morado es el activo de la barra lateral.
 *
 * Cuadrado y no círculo: el sistema no tiene píldoras ni esquinas redondas
 * (`lRadius` es 0.35rem y es el único radio que hay), y un punto redondo aquí
 * habría sido la única forma curva de la página.
 */
export function SectionEyebrow({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Reveal
      innerClassName={`flex items-center gap-2.5 font-mono text-xs font-medium uppercase tracking-widest ${className}`}
    >
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 flex-none"
        style={{ background: l.accent }}
      />
      <span style={{ color: l.fgMuted }}>{children}</span>
    </Reveal>
  );
}
