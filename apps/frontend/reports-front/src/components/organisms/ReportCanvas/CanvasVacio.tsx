'use client';

import { Button } from '@praxis/commons';

/**
 * El lienzo vacío.
 *
 * Es la pieza que justifica el cambio entero. Antes, un proyecto sin historial
 * abría Análisis y se encontraba cinco gráficos de los que tres se disculpaban:
 * «no hay suficientes datos», «faltan 10 tareas cerradas», «faltan días de
 * historial». La pantalla pedía perdón antes de servir para nada, y quien la
 * veía por primera vez concluía —razonablemente— que estaba rota.
 *
 * El vacío de ahora no es la ausencia de algo: es el punto de partida. Por eso
 * no lleva ningún icono de error ni ninguna disculpa, y por eso los dos botones
 * son lo único que hay.
 *
 * ⚠️ **Desde R4.6 sí hay un lienzo de partida, y esto sigue teniendo razón.**
 * Aquí decía «no se rellena con un lienzo por defecto», y el argumento era
 * bueno: poner los cinco de antes «para que no esté vacío» devolvía el problema
 * entero —los mismos avisos de datos insuficientes, el mismo orden que nadie
 * eligió, y la sensación de tener que borrar antes de empezar—.
 *
 * Lo que cambió es que las dos objeciones se hicieron falsas: el de partida son
 * **solo los tres que salen de `snapshot`**, que es el único informe que no
 * necesita historial. Ninguno puede disculparse por falta de datos, y no cuesta
 * una petición más.
 *
 * Así que esta pantalla ya no es lo primero que se ve. Sale cuando alguien
 * **vacía el lienzo a propósito**, y entonces no hay que rellenárselo: sería
 * devolverle cada vez lo que acaba de quitar. Ver la page, donde la condición es
 * `actualizadoEn === null` y no que la lista esté vacía.
 */
export function CanvasVacio({
  onAnadir,
  onConstruir,
}: {
  onAnadir: () => void;
  /** Abre el constructor determinista. */
  onConstruir: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border px-6 py-16 text-center">
      <div className="flex flex-col items-center gap-2">
        <h3 className="font-display text-2xl text-text-primary">Tu lienzo está vacío</h3>
        <p className="max-w-md font-serif text-lg italic text-text-secondary">
          Elige qué quieres ver y dónde. Lo que pongas se queda para la próxima vez.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant="primary" size="lg" onClick={onAnadir}>
          Añadir un gráfico
        </Button>
        {/* ⚠️ Dos botones y no tres, aunque los caminos a un gráfico sean tres.
            PRAX tiene su botón flotante permanente en esta pantalla, así que no
            se pierde; y una pantalla vacía cuyo trabajo es dar un primer paso no
            puede ofrecer tres primeros pasos. */}
        <Button variant="ghost" size="lg" onClick={onConstruir}>
          Uno a medida
        </Button>
      </div>

      <p className="max-w-md font-sans text-xs text-text-disabled">
        Es tu lienzo y solo tuyo: nadie del equipo ve el tuyo ni tú el suyo.
      </p>
    </div>
  );
}
