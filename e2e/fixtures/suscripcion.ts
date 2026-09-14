import { Client } from 'pg';

/**
 * Poner y quitar el plan de una organización, desde las pruebas.
 *
 * ## Por qué esto toca la base directamente
 *
 * Es el **segundo** sitio de toda la suite que no pasa por el gateway, y por la
 * misma razón que el primero (`verificacion.ts`): hay un paso fuera de banda que
 * una prueba automática no puede dar.
 *
 * Quien concede un plan en PRAXIS es **el webhook de Stripe**, nunca una llamada
 * del navegador — ni `POST /me/organizations` acepta `tier`, ni el retorno del
 * pago aplica nada. Para llegar hasta aquí por la API habría que firmar un
 * evento de Stripe con la clave real del entorno y mandarlo a
 * `/api/webhooks/stripe`, que es 🔴 **el único endpoint del repositorio que no se
 * toca**. La alternativa —una puerta trasera «solo para pruebas» que conceda
 * planes— acabaría existiendo también en producción.
 *
 * ⚠️ **Lo que se escribe aquí es exactamente lo que escribe el webhook**, ni un
 * campo más: `tier`, `status` y `seats`. Si algún día divergen, esta fixture
 * miente y las pruebas que dependen de ella pasan sobre un estado que el
 * producto no produce nunca. Es el riesgo conocido de escribir en la base, y por
 * eso está acotado a tres columnas.
 *
 * ## Qué NO hace, y es el punto entero
 *
 * **No congela a nadie.** Congelar se deriva al leer (D1 de
 * `docs/PLAN-ASIENTOS-CONGELADOS.md`): aquí solo se baja el techo, igual que
 * haría una cancelación de verdad, y quien decide quién se queda en solo lectura
 * es billing-service en cada lectura. Si esta fixture tuviera que marcar a
 * alguien, el diseño estaría mal.
 */

/** La misma base que usa el stack. `billing` es donde vive la tabla. */
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  'postgresql://praxis:praxis123@localhost:5432/praxis?schema=billing';

/** Los planes que estas pruebas necesitan nombrar. */
export type Plan = 'FREE' | 'PRO' | 'TEAM' | 'BUSINESS' | 'ENTERPRISE';

async function conBase<T>(trabajo: (cliente: Client) => Promise<T>): Promise<T> {
  const cliente = new Client({ connectionString: DATABASE_URL });
  await cliente.connect();
  try {
    return await trabajo(cliente);
  } finally {
    await cliente.end();
  }
}

/**
 * Deja la organización con este plan y estos asientos contratados.
 *
 * Es lo que hace el webhook al completarse un pago. `upsert` a mano porque una
 * organización recién creada **no tiene fila de suscripción**: nace sin plan y
 * las cuotas que se le aplican son las del gratuito hasta que alguien paga.
 */
export async function darPlan(organizationId: string, plan: Plan, seats: number): Promise<void> {
  await conBase(async (cliente) => {
    const resultado = await cliente.query(
      `INSERT INTO billing.subscriptions (id, "organizationId", tier, status, seats, "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2::"billing"."PlanTier", 'ACTIVE'::"billing"."SubscriptionStatus", $3, NOW(), NOW())
       ON CONFLICT ("organizationId")
       DO UPDATE SET tier = EXCLUDED.tier, status = EXCLUDED.status, seats = EXCLUDED.seats, "updatedAt" = NOW()`,
      [organizationId, plan, seats],
    );

    if (resultado.rowCount === 0) {
      throw new Error(`No se pudo dar el plan ${plan} a la organización ${organizationId}`);
    }
  });
}

/**
 * Cancela la suscripción, igual que el webhook al darse de baja.
 *
 * ⚠️ **`seats` se conserva a propósito, y es medio caso de prueba.** El webhook
 * real no lo baja: ese número es el recuerdo de lo que se pagaba. Leerlo como si
 * siguiera valiendo era el agujero que tapó A1 —el tope pasa a ser
 * `min(seats, quotas.asientos)`— así que una fixture que lo pusiera a 3 estaría
 * borrando justo la condición que la prueba quiere ejercitar.
 */
export async function cancelarPlan(organizationId: string): Promise<void> {
  await conBase(async (cliente) => {
    const resultado = await cliente.query(
      `UPDATE billing.subscriptions
          SET tier = 'FREE'::"billing"."PlanTier",
              status = 'CANCELED'::"billing"."SubscriptionStatus",
              "canceledAt" = NOW(),
              "updatedAt" = NOW()
        WHERE "organizationId" = $1`,
      [organizationId],
    );

    if (resultado.rowCount === 0) {
      throw new Error(`La organización ${organizationId} no tenía suscripción que cancelar`);
    }
  });
}
