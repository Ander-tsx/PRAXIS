# Plan de implementación — Reglas de automatización (MVP académico)

## Contexto

Este plan reemplaza el diseño original de `automation-service` (11 bloques, arquitectura de
eventos durables con outbox/stream/inbox, integración GitHub App completa, colas con
clasificación fina de reintentos). Ese diseño resuelve problemas de un sistema en producción a
escala; este documento resuelve el problema real: **una demo funcional de reglas de
automatización en menos de una semana, con un equipo de 2-3 personas, priorizando que el
flujo funcione en vivo sobre la robustez de infraestructura.**

Los recortes de alcance son decisiones conscientes, no descuidos, y quedan documentados al final
como trabajo futuro para que el criterio de diseño original no se pierda.

## Qué se reutiliza del plan anterior

| Bloque original | Decisión |
|---|---|
| 1 — Permisos y jerarquía | Se reutiliza, colapsado a un solo permiso (`canManageAutomations`) para todas las operaciones. No se invierte tiempo en removerlo si ya compila. |
| 2 — Servicio base TCP 3008 | Se reutiliza tal cual si ya compila y corre. |
| 3 — Outbox/stream/inbox | **Se descarta para este alcance.** No se continúa su implementación. |
| 4 — Modelo y CRUD de reglas | Se reutiliza como base principal, simplificando validaciones no esenciales. |
| 5 — Motor con colas/reintentos/reconciliación | Se conserva únicamente el matcher de condiciones y el snapshot de ejecución si ya existen; el resto se reemplaza por ejecución directa. |

## Alcance del MVP

**Incluido:**
- Dos reglas funcionando de punta a punta:
  1. Tarea próxima a vencer → notificación/correo al responsable.
  2. Tarea estancada (sin movimiento en X → notificación al project manager.
- Reglas con condiciones combinadas por `AND` y hasta 3-5 acciones secuenciales.
- Catálogo de handlers extensible en código: añadir una regla nueva en el futuro significa
  registrar un nuevo trigger/condición/acción en el catálogo, sin tocar el motor.
- Un permiso único para administrar reglas.
- Un reintento simple ante fallo de una acción.
- Registro básico de ejecuciones (para poder mostrar auditoría en la demo).

**Explícitamente fuera de este alcance:**
- Integración GitHub (queda como *stretch goal* opcional si sobra tiempo).
- Outbox transaccional, Redis Stream, inbox, recuperación de mensajes abandonados.
- Colas múltiples, clasificación fina de errores, reconciliador programado.
- Permisos separados para automatizaciones e integraciones.
- Chaos testing, pruebas de carga/latencia con SLOs.
- UI de administración avanzada (dead letter, replay).

## Modelo de datos (simplificado)

- **AutomationRule**: `id`, `projectId`, `name`, `status` (`ENABLED` / `DISABLED`), `createdBy`,
  timestamps.
- **AutomationTrigger**: relación 1:1 con la regla, `type`, `config`.
- **AutomationCondition**: `field`, `operator`, `value`, `position`. Se evalúan todas con `AND`.
- **AutomationAction**: `type`, `config`, `position`. Máximo 5, ejecución secuencial.
- **RuleExecution** *(opcional, si el tiempo lo permite)*: `id`, `ruleId`, `triggeredAt`,
  `status`, snapshot mínimo de qué se evaluó — útil para mostrar auditoría en la demo sin el
  costo del modelo completo original.

Se omiten deliberadamente: versión incremental automática de la regla, snapshot completo por
acción, y tablas separadas de outbox/inbox.

## Arquitectura de ejecución

- La evaluación de reglas se dispara **directamente desde el comando de dominio** que produce el
  hecho relevante (ej. al actualizar `dueDate` de una tarea, o mediante un cron/job simple para
  revisar vencimientos y estancamientos), sin pasar por un bus de eventos durable.
- Se acepta el riesgo de perder una evaluación si el proceso cae exactamente en ese instante;
  para el alcance de esta demo ese riesgo es aceptable.
- Las acciones se ejecutan de forma inmediata (o con una única cola simple si ya tienen BullMQ
  configurado y les ahorra tiempo, sin niveles de retry elaborados).
- Un fallo de acción se reintenta una vez tras un pequeño retraso fijo; si vuelve a fallar, se
  marca como error y se continúa.

## Bloques de implementación

### Bloque A — Fundamentos 
- Reutilizar/ajustar el modelo y CRUD de reglas del Bloque 4 original.
- Colapsar el permiso a uno solo en los guards.
- Definir el catálogo tipado de triggers, condiciones y acciones del MVP (los dos triggers
  elegidos, operadores de condición necesarios, acciones de notificación/correo).

**Entregable:** API de reglas funcionando (crear, editar, habilitar/deshabilitar, listar),
reglas persistidas correctamente por proyecto.

### Bloque B — Motor de evaluación directo
- Evaluador de condiciones `AND` reutilizando el matcher existente si ya está hecho.
- Ejecutor secuencial de acciones con reintento simple.
- Registro de handlers (patrón que permite agregar reglas nuevas después sin tocar el motor).

**Entregable:** dado un evento simulado y una regla, el motor evalúa condiciones y ejecuta
acciones correctamente, con logs mínimos.

### Bloque C — Trigger "vencimiento próximo" end-to-end 
- Disparo (cron simple o botón manual de "revisar vencimientos" para la demo).
- Resolución de destinatarios (responsables actuales de la tarea).
- Acción de notificación/correo usando el mecanismo existente del sistema (Resend/notificación
  persistente).

**Entregable:** flujo completo funcionando en vivo.

### Bloque D — Trigger "tarea estancada" end-to-end 
- Cálculo de estancamiento basado en el historial de movimientos de la tarea.
- Resolución de destinatarios (project manager del proyecto).
- Acción de notificación.

**Entregable:** flujo completo funcionando en vivo.

### Bloque E — UI mínima y pulido 
- Pantalla para crear/listar/activar reglas.
- Vista simple de ejecuciones recientes (para poder mostrar auditoría en la demo).
- Ajustes visuales y de UX para la presentación.

### Bloque F — Ensayo y buffer 
- Ensayo completo del flujo de demo con datos preparados.
- Buffer para bugs encontrados en el ensayo.
- *Stretch goal:* si sobra tiempo, integración GitHub simplificada (webhook secret fijo por
  config, sin flujo de instalación asistida; se dispara con una petición preparada en vez de
  depender de GitHub en vivo durante la demo).

## Riesgos aceptados (documentados, no descuidados)

- No hay garantía de entrega ante caída del proceso exactamente durante la evaluación de un
  evento.
- El reintento está limitado a un solo intento adicional.
- No existe flujo seguro de instalación para integraciones externas.
- La auditoría de ejecuciones es mínima, sin snapshot completo versionado.

Estos recortes son intencionales para el alcance académico y el tiempo disponible; no invalidan
el diseño original, que queda documentado como evolución posible.

## Trabajo futuro (evolución hacia el diseño original)

- Reintroducir outbox/stream/inbox si el proyecto escala a un entorno de producción real.
- Separar permisos de automatizaciones e integraciones con su jerarquía completa.
- Flujo de instalación asistida de GitHub App con verificación de firma y `state` de un solo uso.
- Colas múltiples con clasificación de errores reintentables/terminales y dead letter.
- Reconciliador de ocurrencias programadas y pruebas de resiliencia/carga.
