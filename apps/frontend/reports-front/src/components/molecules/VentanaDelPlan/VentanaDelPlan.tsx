/**
 * Hasta dónde hacia atrás llega el plan, dicho cuando importa.
 *
 * ## Por qué esto existe
 *
 * `historialAnalisisDias` acota el historial que puede mirar un informe: el plan
 * gratuito llega a 90 días y el primero de pago a 365. El servidor **recorta**
 * la petición en vez de rechazarla —un muro de pago a media consulta no tiene
 * salida, D4 de `docs/PLAN-CUOTAS.md`—, y eso deja el gráfico saliendo
 * perfectamente con menos datos de los que se pidieron.
 *
 * ⚠️ **Un recorte mudo es peor que no recortar.** Una serie que empieza noventa
 * días atrás sin explicar por qué se lee como un dato incompleto, no como un
 * plan, y quien la lea sacará conclusiones de un tramo que cree entero. Es la
 * misma regla que `tareasOmitidas` en el briefing del asistente y que la nota de
 * días naturales de los informes de tiempo.
 *
 * ## Y por qué no sale siempre
 *
 * ⚠️ Solo cuando la petición **se recortó de verdad** (`recortado`), no cuando
 * hay tope. Un plan de 90 días contestando a una pregunta de 60 no ha ocultado
 * nada, y un aviso permanente ahí es un aviso que se aprende a ignorar antes de
 * que llegue el que sí dice algo.
 */
export interface VentanaDelPlan {
  dias: number | null;
  tier: string;
  plan: string;
  recortado: boolean;
  desde: string | null;
}

export function VentanaDelPlanAviso({ ventana }: { ventana: VentanaDelPlan | null }) {
  if (!ventana?.recortado || ventana.dias === null) return null;

  const desde = ventana.desde
    ? new Date(ventana.desde).toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    /* `output` y no un `div` con `role="status"`: es el elemento que ya tiene ese
       papel, así que no hay que declararlo. Y `status` y no `alert` porque esto
       es una aclaración sobre lo que se está viendo, no algo que haya salido
       mal — un `alert` interrumpe al lector de pantalla. */
    <output className="flex flex-col gap-1 rounded-2xl border border-border bg-surface-elevated px-5 py-4">
      <p className="font-sans text-sm text-text-primary">
        Estos gráficos empiezan {desde ? <>el {desde}</> : <>hace {ventana.dias} días</>}, no antes.
      </p>
      <p className="font-sans text-sm text-text-secondary">
        Tu plan <strong className="font-semibold text-text-primary">{ventana.plan}</strong> guarda{' '}
        {ventana.dias} días de historial de análisis. Los datos anteriores siguen ahí; lo que no
        llega hasta ellos es el informe.
      </p>
    </output>
  );
}
