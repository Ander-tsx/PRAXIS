'use client';

import { createApiClient } from '@praxis/commons/api';
import { useEffect, useState } from 'react';

/** Toda petición del navegador pasa por el proxy, que pone el Bearer. */
const api = createApiClient({ gatewayPath: '/api/gateway' });

/** Lo que contesta `GET /me/billing/mi-asiento`. */
interface MiAsiento {
  congelado: boolean;
  /** Su turno para volver: **1 es el primero**. `null` si no está congelado. */
  puesto: number | null;
  /** Cuánta gente cabe hoy. `null` = sin tope. */
  tope: number | null;
}

/**
 * «Estás en solo lectura», en toda el área privada.
 *
 * ## Por qué existe, y por qué no es un error más
 *
 * 🔴 **Sin esto, la primera noticia es un botón que no responde.** Alguien
 * congelado no ha hecho nada mal: le bajaron el techo del plan y su organización
 * pasó a tener más gente que asientos (D4 y D11 de
 * `docs/PLAN-ASIENTOS-CONGELADOS.md`). Puede entrar, ver sus proyectos y leerlo
 * todo; lo único que no puede es escribir. Descubrir eso a base de `403` es
 * indistinguible de una avería — y de que le hayan echado, que es exactamente lo
 * que el encargo prohíbe.
 *
 * ⚠️ **Dice a quién pedírselo, no ofrece pagar.** Quien está congelado casi
 * nunca es quien administra la facturación; un botón de ampliar el plan delante
 * de quien no puede pulsarlo es la misma trampa que ya resuelve `QuotaNotice`
 * con `ampliarSirve`. La salida de esta persona es hablar con quien paga — y a
 * ese ya le llega el aviso por su lado, en `resumen.congelados` (D7).
 *
 * ## Se pide desde el cliente, y es a propósito
 *
 * 🔴 **No sale de `loadPrivateChrome()`, que es donde habría sido gratis.** Ese
 * armazón pide la lista de organizaciones, y esa lista **se cachea 30 s en
 * Redis**. Estar congelado es un dato *derivado* que se calcula al leer (D1)
 * justo para que volver a pagar lo apague **en el mismo instante** (invariante
 * 3): guardado en esa caché duraría media hora de reloj más que el pago, con la
 * cinta puesta en una organización que ya paga y sin que nada fallara.
 *
 * Pedirlo aparte cuesta una llamada por carga, y por eso el endpoint devuelve
 * tres campos y no el resumen de facturación entero.
 *
 * ⚠️ **Y no se pinta nada mientras no se sabe.** Ni esqueleto ni hueco: el caso
 * normal es no estar congelado, y reservar sitio para una cinta que casi nunca
 * aparece empujaría la pantalla hacia abajo en cada carga.
 */
export function AvisoAsientoCongelado({ organizationId }: { organizationId: string | null }) {
  const [asiento, setAsiento] = useState<MiAsiento | null>(null);

  useEffect(() => {
    if (!organizationId) return;

    /* Cambiar de organización tiene que poder cancelar la respuesta de la
       anterior: sin esto, dos cambios seguidos pueden pintar la cinta de la
       organización que ya no se mira. */
    let vigente = true;

    api
      .get<MiAsiento>(`/me/billing/mi-asiento?organizationId=${encodeURIComponent(organizationId)}`)
      .then((respuesta) => {
        if (vigente) setAsiento(respuesta);
      })
      /* Si no se puede saber, no se dice nada. Falla hacia «puedes», igual que
         el guard, que deja escribir cuando billing-service no contesta: decirle
         a alguien que está en solo lectura por una caída de un servicio es el
         peor falso positivo de los dos. */
      .catch(() => {
        if (vigente) setAsiento(null);
      });

    return () => {
      vigente = false;
    };
  }, [organizationId]);

  if (!asiento?.congelado) return null;

  return (
    /* `<output>` y no un `div role="status"`: es lo mismo para quien escucha y
       Biome lo exige. Solo vale porque todo lo de dentro es contenido de frase
       —tres `span`—; con un título o un botón dentro no se puede convertir, y el
       fallo sale como error de **parseo**, no de lint. */
    <output className="flex flex-wrap items-center gap-x-2 gap-y-1 border-warning/30 border-b bg-warning-muted px-4 py-2 text-sm text-text-primary">
      <span className="font-medium text-warning">Estás en solo lectura.</span>
      <span className="text-text-secondary">
        Tu organización tiene más gente que asientos, así que puedes verlo todo y no puedes
        escribir. No has perdido nada: tus proyectos, tus tareas y tu papel siguen donde estaban.
      </span>
      <span className="text-text-secondary">
        {asiento.puesto === 1
          ? 'Eres la primera persona que recupera el asiento en cuanto se libere uno.'
          : asiento.puesto !== null
            ? `Eres el ${asiento.puesto}.º en recuperarlo en cuanto se liberen asientos.`
            : ''}{' '}
        Se arregla desde facturación: pídeselo a quien administra el plan.
      </span>
    </output>
  );
}
