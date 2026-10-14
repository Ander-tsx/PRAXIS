# PLAN-PUSH — Notificaciones push (mensajes y tareas por vencer)

**Etapa entregada en rama** `feature/push-notificaciones` (2026-10-14), sin desplegar. Cierra la
**D14 de [PLAN-MOVIL](PLAN-MOVIL.md)** («push, fuera de este plan»). ⚠️ **Toca el backend**, por
encargo del dueño y solo aditivo. Despliegue en [deploy/PUSH-PRODUCCION.md](deploy/PUSH-PRODUCCION.md).

## Qué hace

- **Mensajes de chat** → push al instante a los participantes que **no** lo tienen silenciado, no
  son el autor y **no tienen la aplicación abierta**.
- **Tareas por vencer** → un resumen por persona, dos veces al día (00:00 y 12:00 de México).
- Un interruptor **por dispositivo** en la pantalla *Tú* del móvil.

## Decisiones

| | |
|---|---|
| **D1 — Coste mínimo** | Sin proceso nuevo ni sondeo. El push de chat sale cuando ya hay un mensaje (el contenedor está despierto). El de tareas lo dispara **un cron de Railway** dos veces al día; el monolito despierta, consulta, envía y se duerme solo (`PRAXIS_REPOSO_MS`, 5 min). ≈10 min/día despierto. |
| **D2 — El servicio de push vive en projects-service** | Ya es dueño de avisos, chat y membresías. No hay servicio nuevo que registrar en el monolito. |
| **D3 — Nada en el service worker que programe** | Un SW no puede esperar: el navegador lo mata, `showTrigger` se abandonó y Periodic Background Sync no existe en iOS. Solo el servidor despierta al SW. |
| **D4 — Dos avisos por tarea como mucho, sin marcar nada en base** | 00:00 → «vence mañana»; 12:00 → «vence hoy». Los tramos no se solapan, así que no hace falta una columna «ya avisada». Un reintento del cron sí duplicaría. |
| **D5 — Día de México fijo (UTC-6)** | Sin horario de verano desde 2022. Si se atiende otra zona, pasa a ser por persona. |
| **D6 — Un push por persona, no por tarea** | 1 tarea → su título; N → «N tareas vencen…». |
| **D7 — Un chat = una notificación** | `tag: chat:<canal>` con `renotify`: varios mensajes seguidos se sustituyen. |
| **D8 — Sin presencia no se envía** | Se mira la clave Redis `presencia:conectado:<id>` que ya escribe el SSE del gateway. Sin Redis se asume desconectado (mejor un aviso de más). |
| **D9 — El cron entra por `web`** | El gateway no tiene dominio público: `POST /api/internal/push/vencimientos` (web) → gateway, con `x-cron-secret` (`PUSH_CRON_SECRET`). Sin secreto, 404. |

## Invariantes

1. **Todo push acaba en `showNotification`** (Safari revoca a quien recibe pushes mudos).
2. **La URL de la notificación es relativa** (`startsWith('/')`): un push no manda fuera de Praxis.
3. **El `endpoint` pasa a quien lo registró la última vez**; `desuscribir` filtra por `userId`.
4. **Un 404/410 del servicio de push borra la suscripción**; cualquier otro error, no.
5. **Cerrar sesión da de baja el dispositivo** (`desactivarPush()` en `PantallaTu`).
6. **Enviar nunca lanza ni retrasa** el mensaje de chat (`.catch(() => undefined)`).
7. **Sin claves VAPID se apaga entero** y nada falla.

## Qué se hizo

| Pieza | Dónde |
|---|---|
| Tabla `push_subscriptions` | `projects/prisma/schema.prisma` + migración `20261014000000_push_subscriptions` |
| Envío, altas/bajas, presencia | `projects/src/push/` (+ `push.service.spec.ts`, 4 pruebas) |
| Hook en el chat | `ChatService.anunciarMensaje` recoge destinatarios dentro de `repartir` |
| Tareas del tramo | `tasks`: `task_find_due_between` (abiertas, con encargado, `completedAt: null`) |
| Rutas | `gateway/src/push/`: `/me/push/{key,state,subscribe}` y `/internal/push/vencimientos` (+ `vencimientos.spec.ts`) |
| Service worker | `web/src/service-worker/sw.js`: `push` y `notificationclick` |
| Interruptor | `commons/pwa/push.ts`, `FilaNotificacionesPush.tsx`, montado en `PantallaTu` |
| Paso del cron | `web/src/app/api/internal/push/vencimientos/route.ts` |

## Trampas

- ⚠️ **iOS solo con la app instalada y desde 16.4.** En Safari normal `PushManager` no existe: la fila
  explica cómo instalar. El permiso se pide **dentro del toque** del interruptor.
- ⚠️ **El SW solo se registra en producción**: en `next dev` el interruptor no puede suscribir.
- ⚠️ **`dueDate` guarda el final del día de quien lo escribió** (`toIsoDueDate`, en el servidor de
  Next). Por eso el tramo se calcula con el día natural de México, no con medianoche UTC.
- ⚠️ **`dev:backend` tras añadir el modelo**: parar, borrar `dist/`, `prisma:generate` y arrancar en frío.

## Fuera, a propósito

- Preferencias por tipo (solo hay un interruptor por dispositivo).
- Interruptor en escritorio (el SW y el envío ya funcionan; falta la fila en `PerfilEnBarra`).
- Aviso de tareas **vencidas**, y avisos de asignación/invitación (ya están en la bandeja).
- Hora exacta («vence en 1 h»): exigiría sondeo continuo, que es lo que D1 evita.
