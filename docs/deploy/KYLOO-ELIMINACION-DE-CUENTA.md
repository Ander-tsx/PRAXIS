# Cuando alguien elimina su cuenta de Kyloo

Kyloo manda `user.deleted` a Praxis. Praxis lo procesa en `KylooInternalController.event`, de forma
idempotente (si falla algo, responde 500 y Kyloo reintenta).

## Qué hace Praxis, en orden

1. **Cierra todo**: sesiones, tokens personales y conexiones MCP.
2. **credentials**: anonimiza la cuenta. Se conserva el `id` para no borrar trabajo ajeno; desaparecen
   correo, nombre, fotos, perfil, contraseña, identificadores de Kyloo/Google, tokens y conexiones. El
   contenido compartido queda atribuido a «Persona eliminada». La cuenta queda `INACTIVE`.
3. **projects**: borra las invitaciones a documentos hechas a su correo.
4. **billing** (`anonimizarPersona`):
   - borra las invitaciones **pendientes** a su correo;
   - organizaciones **de equipo** de las que era dueña: la propiedad pasa a la persona **activa más
     antigua con el mismo papel** (administración). Alguien con menos papel nunca hereda;
   - donde ya no es dueña, se borra su membresía (libera el asiento);
   - donde sigue siéndolo (la personal y las **huérfanas**), solo se anonimiza el correo.

## Lo que NO hace, a propósito

- **No cancela suscripciones de Stripe ni toca el cliente de Stripe.** Cobrar o dejar de cobrar es
  dinero y vive en el gateway; automatizarlo a ciegas puede cortar un plan que otra persona usa.
- **No borra organizaciones huérfanas.** Pueden tener proyectos de otras personas.

## Qué tiene que hacer una persona del equipo

Busca en los logs de `praxis-api` el texto `ORGANIZACION_HUERFANA`. Trae el id de la organización y su
plan. Si el plan es de pago (`PRO`, `PLUS`…):

1. Cancela la suscripción en Stripe (o en Facturación, si hay otra persona con acceso).
2. Decide con el equipo si la organización se conserva (otras personas dentro) o se cierra.

El cliente de Stripe conserva el correo de la persona: es dato de facturación y hay obligación fiscal de
guardar facturas. Si hay que quitarlo, se hace desde el panel de Stripe.
