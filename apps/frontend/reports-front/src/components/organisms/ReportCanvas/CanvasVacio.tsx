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
 * ⚠️ **No se rellena con un lienzo por defecto**, aunque sea tentador. Poner los
 * cinco de antes «para que no esté vacío» devolvería el problema entero: los
 * mismos avisos de datos insuficientes, el mismo orden que nadie eligió, y
 * encima la sensación de que hay que borrar antes de poder empezar.
 */
export function CanvasVacio({
  onAnadir,
  onGenerar,
}: {
  onAnadir: () => void;
  onGenerar: () => void;
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
        <Button variant="ghost" size="lg" onClick={onGenerar}>
          Pedirle uno al asistente
        </Button>
      </div>

      <p className="max-w-md font-sans text-xs text-text-disabled">
        Es tu lienzo y solo tuyo: nadie del equipo ve el tuyo ni tú el suyo.
      </p>
    </div>
  );
}
