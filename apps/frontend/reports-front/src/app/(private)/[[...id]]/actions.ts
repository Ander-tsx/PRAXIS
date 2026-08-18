'use server';

import { randomUUID } from 'node:crypto';
import { CATALOGO, MAX_WIDGETS, type Widget, siguienteFila } from '@/lib/widgets';
import type { ChartProposal } from '@praxis/commons';
import { describe, requireApi } from '@praxis/commons/assistant/helpers';
import { revalidatePath } from 'next/cache';

/**
 * Las dos acciones del **lienzo** de Análisis.
 *
 * ## Qué se fue de aquí, y por qué estas se quedaron
 *
 * Este archivo tenía además las dieciséis acciones del asistente. Se han ido a
 * `@praxis/commons/assistant/actions` porque desde que PRAX tiene pantalla
 * propia las usan dos zonas, y novecientas líneas que llaman a endpoints con
 * permisos delicados no pueden vivir por duplicado.
 *
 * Estas dos no se pueden mover, y por motivos distintos:
 *
 * - `guardarLienzoAction` **es** del lienzo: solo existe esta pantalla que lo
 *   dibuje.
 * - `aceptarGraficoAction` necesita el catálogo de widgets —`lib/widgets`, de
 *   esta zona— para saber de qué tamaño nace un gráfico, y además revalida
 *   *esta* página. Llega a la conversación **inyectada por props**: donde no hay
 *   lienzo, la tarjeta de un gráfico propuesto lo dice en vez de ofrecer un
 *   botón que no llevaría a ninguna parte.
 *
 * ⚠️ **Y aceptar un gráfico no es una vía de escritura nueva sobre el
 * proyecto**, aunque sea la única propuesta que no llama a un endpoint del
 * tablero. Escribe en `PUT /projects/:id/reports/layout`, el mismo endpoint que
 * usa el lienzo al arrastrar, con el mismo permiso —`canViewReports`, que ya
 * hizo falta para llegar al asistente— y sobre la misma fila: la de esta persona
 * en este proyecto. El `userId` lo pone el gateway desde el token, así que no hay
 * forma de tocar el lienzo de nadie más.
 */

/**
 * Guarda la disposición del lienzo de quien llama.
 *
 * ⚠️ **No lleva `revalidatePath`, por el mismo motivo que las del asistente.**
 * Mover un gráfico ya lo ha movido el navegador; volver a renderizar la page en
 * el servidor solo pediría otra vez los mismos informes para pintar exactamente
 * lo que ya se está viendo. Quien sí lo necesita es *añadir* un widget, porque
 * su informe todavía no se ha pedido — y eso lo hace el propio lienzo con
 * `router.refresh()`, que es una decisión del gesto y no de la escritura.
 *
 * El `userId` **no viaja**: lo pone el gateway desde el token. Aquí no hay forma
 * de escribir en el lienzo de otra persona ni equivocándose.
 */
export async function guardarLienzoAction(
  projectId: string,
  widgets: Widget[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const api = await requireApi();
  if (!api) return { ok: false, error: 'Tu sesión ha caducado.' };

  try {
    /* Solo los campos que el DTO declara: uno de sobra ya da 400. `tipo` y
       `grafico` viajan tal cual porque el servidor los valida contra el
       catálogo cerrado, que es donde tiene que estar esa comprobación. */
    await api.put(`/projects/${projectId}/reports/layout`, {
      widgets: widgets.map((widget) => ({
        id: widget.id,
        tipo: widget.tipo,
        x: widget.x,
        y: widget.y,
        w: widget.w,
        h: widget.h,
        ...(widget.grafico ? { grafico: widget.grafico } : {}),
      })),
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: describe(error, 'No se pudo guardar la disposición.') };
  }
}

/**
 * Acepta un gráfico propuesto: lo **añade al lienzo de quien acepta**.
 *
 * ⚠️ **No es una vía de escritura nueva sobre el proyecto**, y conviene decirlo
 * porque es la primera acción del asistente que no llama a un endpoint del
 * tablero. Escribe en `PUT /projects/:id/reports/layout`, que es exactamente el
 * mismo endpoint que usa el lienzo al arrastrar un gráfico, con el mismo permiso
 * —`canViewReports`, que ya hizo falta para llegar al asistente— y sobre la
 * misma fila: la de esta persona en este proyecto. No hay forma de tocar el
 * lienzo de nadie más, porque el `userId` lo pone el gateway desde el token.
 *
 * Se lee el lienzo antes de escribirlo en vez de mandar solo el gráfico nuevo,
 * porque la ruta guarda la disposición **entera**. Se acepta la carrera que eso
 * abre —mover una tarjeta en otra pestaña entre la lectura y la escritura— por
 * lo mismo que no hay control de concurrencia en la tabla: las dos pestañas que
 * podrían pisarse son las de la misma persona.
 *
 * La parametrización se manda **tal cual vino**: el gateway la valida contra el
 * catálogo cerrado, que es donde esa comprobación se puede garantizar. Si el
 * modelo hubiera colado algo imposible, esto devuelve el 400 y la tarjeta lo
 * dice, en vez de dibujar un gráfico que no significa nada.
 */
export async function aceptarGraficoAction(
  projectId: string,
  propuesta: ChartProposal,
): Promise<{ anadido: boolean; error: string | null }> {
  const api = await requireApi();
  if (!api) return { anadido: false, error: 'Tu sesión ha caducado.' };

  try {
    const lienzo = await api.get<{ widgets: Widget[] }>(`/projects/${projectId}/reports/layout`);
    const widgets = lienzo.widgets ?? [];

    if (widgets.length >= MAX_WIDGETS) {
      return {
        anadido: false,
        error: `Tu lienzo ya tiene ${MAX_WIDGETS} gráficos. Quita alguno para añadir este.`,
      };
    }

    const nuevo: Widget = {
      id: randomUUID(),
      tipo: 'generado',
      x: 0,
      y: siguienteFila(widgets),
      w: CATALOGO.generado.w,
      h: CATALOGO.generado.h,
      grafico: propuesta.grafico as Widget['grafico'],
    };

    const resultado = await guardarLienzoAction(projectId, [...widgets, nuevo]);
    if (!resultado.ok) return { anadido: false, error: resultado.error };

    /**
     * ⚠️ **Esta sí revalida, al revés que las otras ocho.**
     *
     * Las del tablero no lo hacen porque lo que cambian vive en otra zona, que
     * no comparte caché con esta: revalidar aquí volvería a renderizar los
     * informes para no cambiar un píxel. Esta es la excepción exacta — lo que
     * cambia **es esta página**, y sin revalidar el gráfico aceptado no aparece
     * hasta que alguien recargue, que se lee como que aceptar no hizo nada.
     */
    /**
     * ⚠️ **La ruta, no el valor.** Estaba como `/${projectId}`, con el UUID, y
     * no revalidaba nada: la URL de esta pantalla lleva el **slug**
     * (`/reports/rediseno-del-panel`), así que ese path no casaba con ninguna
     * página renderizada y el gráfico aceptado no aparecía hasta recargar a
     * mano. Con la forma del segmento dinámico y `'page'` se revalida la ruta
     * sea cual sea el parámetro, que es justo lo que hace falta cuando el mismo
     * proyecto se puede alcanzar por slug o por id.
     *
     * ⚠️ **Y la forma cambió con la ruta.** Era `'/[id]'`; desde que Análisis es
     * un catch-all opcional —para servir `/reports` sin el redirect que costaba
     * dos cargas— el segmento se llama `'/[[...id]]'`. Un literal que no case con
     * ninguna ruta **no da error**: `revalidatePath` acepta cualquier cadena y
     * simplemente no revalida nada, que es exactamente el fallo que este mismo
     * comentario ya documentaba una vez.
     */
    revalidatePath('/[[...id]]', 'page');
    return { anadido: true, error: null };
  } catch (error) {
    return { anadido: false, error: describe(error, 'No se pudo añadir el gráfico.') };
  }
}
