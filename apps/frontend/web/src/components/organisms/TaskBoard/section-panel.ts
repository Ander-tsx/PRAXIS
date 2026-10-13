import type { CSSProperties } from 'react';

/**
 * Fondo de los bloques del diálogo de tarea: etiquetas, encargados, archivos y
 * comentarios.
 *
 * Era `bg-background`, el **negro base de la aplicación**, sobre el `surface`
 * del diálogo: el salto era tan grande que cada bloque parecía un agujero. Un
 * gris translúcido de borde queda **entre** el fondo del diálogo y los campos
 * —que siguen en `surface-elevated`—, así que los tres niveles se distinguen sin
 * que ninguno grite.
 *
 * En el rebrand near-black pasó de `alpha(colors.border, 35)` a un blanco
 * translúcido literal: se comporta igual —un velo entre el fondo y los campos—
 * pero funciona sobre cualquier superficie sin arrastrar el tono azulado del
 * token.
 *
 * En un módulo propio y no en `TaskDialog`: las secciones lo necesitan y el
 * diálogo las importa, así que sacarlo de ahí evita el ciclo. Y en un solo sitio
 * porque cuatro copias del mismo valor acaban con una distinta.
 */
export const SECTION_PANEL = { background: 'rgba(255,255,255,0.04)' } as const;

/**
 * Las secciones del panel de tarea —Detalles, Campos del proyecto, Checklist,
 * Documentos, Archivos, Notas— con **un solo lenguaje**: un encabezado pequeño
 * en versalitas y un bloque apenas más claro que el panel.
 *
 * Antes cada sección se separaba de la anterior con una raya y llevaba su
 * título en el mismo cuerpo que el texto: todas pesaban igual y el panel se
 * leía como una lista sin orden. Lo que agrupa ahora es el bloque, no la raya.
 */
export const SECTION_CLASS = 'mt-6 flex flex-col gap-2';
export const SECTION_TITLE_CLASS =
  'flex items-center gap-1.5 font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary';
/** El número junto al título: «Checklist 1/3», «Notas 2». */
export const SECTION_COUNT_CLASS = 'font-medium normal-case tracking-normal tabular-nums';
export const SECTION_BODY_CLASS =
  'flex flex-col gap-3 rounded-xl bg-white/[0.025] p-3 ring-1 ring-inset ring-white/[0.06]';

/**
 * Los dos tonos de superficie, **redefinidos dentro del panel de tarea**.
 *
 * ⚠️ El tema oscuro (`[data-tone="dark"]`) da a `surface` (#191919) y a
 * `surface-elevated` (#1c1c1b) un tono **más oscuro** que el propio panel
 * (#202020, fijado a pelo en `SlideOver`). Lo que debería verse elevado —los
 * desplegables, el calendario, la lista de encargados, los campos de texto—
 * salía como un hueco negro, con un contraste que el dueño del producto señaló
 * como excesivo. Aquí suben un peldaño **por encima** del panel, como corresponde
 * a una capa elevada. Se redefinen para el subárbol, igual que hace
 * `data-tone`, en vez de tocar el tema de toda la aplicación.
 *
 * 🔴 **Los valores salen de `--task-panel-surface*` (theme.css), no de un hex.** Con los grises
 * oscuros a pelo, en tema claro todos los desplegables, el calendario y las listas del panel
 * salían **negros con texto oscuro**, ilegibles.
 */
export const TASK_PANEL_TOKENS = {
  '--color-surface': 'var(--task-panel-surface)',
  '--color-surface-elevated': 'var(--task-panel-surface-elevated)',
} as CSSProperties;

/**
 * **La caja de todo lo que se edita** en el panel de tarea: desplegables,
 * fechas, textos, el selector de personas y etiquetas.
 *
 * Borde y fondo visibles a propósito. La versión anterior quitaba la caja
 * («fantasma») para que las filas pesaran menos, y el resultado fue que no se
 * distinguía lo editable de lo que no —en el teléfono sobre todo, donde no hay
 * hover que lo descubra—. Ahora la regla es simple: **si tiene caja, se
 * toca**; sin permiso de edición, el valor se pinta sin caja.
 */
export const FIELD_BOX =
  'rounded-xl border border-white/[0.11] bg-white/[0.05] transition-colors hover:border-white/[0.2] hover:bg-white/[0.07] focus-within:border-primary/70 focus-within:bg-white/[0.07]';

/**
 * Lo mismo para los átomos que ya traen su caja (`Select`, `SelectorDeFecha`):
 * con `!` porque entre dos utilidades del mismo tipo decide el orden del CSS,
 * no el de las clases.
 */
export const FIELD_OVERRIDE =
  'rounded-xl! border-white/[0.11]! bg-white/[0.05]! shadow-none! hover:border-white/[0.2]! hover:bg-white/[0.07]! hover:shadow-none!';
