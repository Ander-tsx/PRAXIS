-- Se retira el sistema de planes del asistente **por persona**.
--
-- 🔴 Era un catálogo paralelo al de verdad: un plan FREE/PRO por usuario, con su
-- propio cliente de Stripe y su propia ruta en el panel de administración,
-- escrito antes de que existieran las organizaciones.
--
-- Desde la etapa Enterprise el tope de IA lo decide el plan de la ORGANIZACIÓN
-- (`PlanQuotas.iaMensualPorPersona`) y llega en el payload de cada llamada, así
-- que esta tabla no gobernaba ningún límite. Lo único que seguía haciendo era
-- devolver un campo `plan` que podía contradecir al tope: quien tuviera el PRO
-- viejo puesto a mano dentro de una organización gratuita recibía
-- `{ plan: 'PRO', limite: 13 }` — la pantalla ponía PRO y el servidor negaba al
-- mensaje 14.
--
-- Las tres columnas de Stripe llevaban muertas desde que el cliente pasó a ser
-- de la organización: billing-service tiene las suyas.
--
-- ⚠️ **`assistant_usage` NO se toca.** Es el contador, no el plan, y sigue
-- siendo la única prueba de cuánto se ha usado esto. Su clave
-- (usuario, organización, mes) es lo que hace que la cuota sea personal dentro
-- de cada organización.
--
-- ⚠️ **Esto borra datos y no se puede deshacer**: quién tenía el PRO viejo se
-- pierde. Es aceptable porque ese valor ya no concedía nada, y el registro de
-- quién lo concedió sigue en `AdminAction` —cuyo verbo
-- `ASSISTANT_PLAN_CHANGED` se conserva a propósito para que las filas viejas no
-- se queden sin nombre.

DROP TABLE IF EXISTS "assistant"."assistant_subscriptions";
DROP TYPE IF EXISTS "assistant"."AssistantPlan";
