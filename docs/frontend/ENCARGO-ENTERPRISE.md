# Encargo — planes, cuotas y Enterprise

> **Escrito el 2026-08-19 de madrugada**, dictado por el dueño del producto antes
> de irse a dormir, para que lo ejecute una sesión que arranca sin contexto.
> Se conserva literal en lo que él decidió y explícito en lo que delegó.

## Lo que él decidió

- Hoy PRAXIS funciona bien **a nivel de usuarios individuales** que se registran y
  tienen suscripciones individuales. Por la naturaleza del software, hace falta
  que lo pueda contratar **una empresa**.
- Debe haber **planes Enterprise** —uno o varios, con capacidades y número de
  miembros distintos— y quien contrate uno necesita **gestionarlo**: el plan y
  los miembros que hay dentro.
- Los planes acotan **cuántos proyectos**, **cuánto uso de IA** y **cuántos
  miembros por proyecto**. Sus palabras: *«cantidades bastante indulgentes pero
  que a final de cuentas están en las letras pequeñas»*.
- Para individuales quiere **tres planes** con distintas características: uso de
  IA, número de proyectos, miembros por proyecto.
- **Stripe.** Las claves las pondrá él; hay que dejar montada la estructura que
  lo soporte, incluidas las limitaciones de uso.
- 🔴 **El plan individual intermedio da un mes gratis.** Al segundo mes, si no se
  ha cancelado, llega el cobro.

## Lo que delegó, con estas palabras

> «jamás he trabajado con softwares con estas modalidades así que yo no tengo un
> buen criterio aquí y por eso quiero que él decida todo»
>
> «lo dejo a tu criterio al completo y luego lo revisaré en la rama»
>
> «que él trabaje con su propio criterio y él vea por sí mismo la forma de
> implementarlo, ya sea que agregue nuevos microservicios, nuevos microfrontends
> o lo que él vea pertinente»

Es decir: **la arquitectura, los nombres de los planes, los límites concretos, el
modelo de datos y el reparto entre servicios son decisión de quien lo implemente.**
Si hace falta un microservicio nuevo, se crea. Si hace falta una zona nueva de
frontend, se crea. Si conviene extender `billing` en vez de partirlo, también.

## Dónde se trabaja

1. **Primero R9 en `main`** — la etapa de análisis, ya diseñada en
   [PLAN-REDISENO.md](PLAN-REDISENO.md). Con vía libre para añadir las métricas y
   visualizaciones que quien lo haga vea óptimas, no solo la lista escrita.
2. **Después, rama nueva `feature/enterprise`** para todo lo de este documento.

## Lo que ya existe y hay que mirar antes de diseñar nada

- `apps/backend/gateway/src/billing/` — el controlador `me/billing` y el webhook
  de Stripe. ⚠️ El `rawBody: true` de `main.ts` está ahí por la firma de ese
  webhook: **la firma se calcula sobre los bytes exactos**, así que cualquier
  cosa que reparsee el cuerpo la rompe.
- `apps/backend/services/credentials/` — cuentas y roles globales.
- `docs/backend/permissions.md` — el modelo de permisos de dos capas. Un plan es
  una **tercera** capa (qué puede contratar la organización) y no debe
  confundirse con las dos que ya hay.
- `apps/frontend/admin-front/` — la administración de plataforma. Gestionar el
  plan **de tu empresa** no es lo mismo que administrar la plataforma: no las
  mezcles sin decidirlo a propósito.

## Trampas que ya se ven desde aquí

1. ⚠️ **Una organización no es un proyecto.** Hoy la unidad de pertenencia es el
   proyecto, con sus roles. Meter el plan ahí haría que cada proyecto tuviera su
   propia suscripción, que no es lo que se pide.
2. ⚠️ **Las cuotas de IA ya existen a nivel de usuario** (`assistant/quota`). Un
   plan de empresa las reparte entre miembros: hay que decidir si el tope es por
   persona, por organización, o los dos, y **decirlo en la pantalla** — un límite
   que se agota sin explicación se lee como una avería.
3. 🔴 **El mes gratis se cobra al segundo, y eso hay que poder demostrarlo.**
   Cualquier cosa que dependa de fechas de facturación necesita quedar registrada
   con su instante: «no me avisaron» es la queja más cara de este terreno.
4. ⚠️ **Bajar de plan con más proyectos de los que el plan permite** es el caso
   que nadie diseña y todos sufren. Hay que decidirlo explícitamente: ¿se
   bloquean escrituras, se archivan, se avisa? Lo que no vale es borrar.
5. ⚠️ **El límite se comprueba en el gateway, no en la pantalla.** Es la misma
   regla que los permisos: la interfaz apaga botones, el servidor decide.
