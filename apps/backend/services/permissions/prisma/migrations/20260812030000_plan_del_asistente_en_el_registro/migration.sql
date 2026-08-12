-- Un verbo propio para el cambio de plan del asistente.
--
-- Sin pasarela de pago, esta linea del registro es la unica prueba de quien
-- concedio PRO a quien. Reutilizar otra accion habria dejado el registro
-- mintiendo sobre lo que ocurrio.
ALTER TYPE "permissions"."AdminActionType" ADD VALUE IF NOT EXISTS 'ASSISTANT_PLAN_CHANGED';
