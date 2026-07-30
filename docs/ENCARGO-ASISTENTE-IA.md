# Encargo: asistente de IA en la pantalla de reportes

> Documento de diseño **y** briefing para quien lo implemente. La sección
> «Prompt de arranque» de abajo se puede pasar tal cual a otro agente.
>
> Escrito el 2026-07-30, al terminar la sección de Reportes. Nada de esto está
> implementado todavía.

---

## Prompt de arranque

```
Vas a implementar un asistente de IA en PRAXIS
(/Users/ander/DEV/UTEZ/9A/FINAL/PRAXIS, rama feature/microfrontends-implementation).

ANTES DE TOCAR NADA, lee en este orden:
  1. CLAUDE.md                        — reglas del repo y trampas del backend
  2. docs/ENCARGO-ASISTENTE-IA.md     — este documento, entero
  3. docs/frontend/ESTADO-ACTUAL.md §25 — la sección de Reportes, que es de la
                                          que el asistente lee
  4. docs/frontend/CONTRATO-API.md    — sección «Reportes» y reglas globales
  5. STRUCTURE.md                     — dónde va cada archivo nuevo

Trabajas backend y frontend, con permiso sobre ambos. Pruebas contra el stack
real levantado. Commiteas cada pieza por separado, Conventional Commits en
español. SIN PUSH.

El diseño ya está decidido y está en este documento. Si algo te parece mal,
dilo en dos frases y sigue; no te quedes esperando.
```

---

## Qué se construye

Un chat dentro de la página de reportes (`reports-front`) que:

1. **Responde preguntas** sobre el análisis del proyecto que se está viendo.
2. **Propone acciones** —crear una tarea, asignarla— y las ejecuta solo cuando
   el usuario pulsa «Aceptar».
3. **Lleva una cuota mensual** visible: 50 mensajes en el plan gratis, 500 en el
   plan pro.

Modelo: **Gemini** (la API que el equipo tiene a mano).

---

## Las cuatro decisiones que definen el diseño

### 1. La IA propone; ejecuta el código que ya existe

**Es la decisión más importante y no se negocia.**

Cuando Gemini devuelve una llamada a función, el backend **no la ejecuta**:
devuelve la propuesta al frontend, que pinta una tarjeta de confirmación. El
botón «Aceptar» invoca la **Server Action que ya usa el formulario del tablero**
(`createTaskAction`, `assignTaskAction`… en
`apps/frontend/projects-front/src/app/(private)/[id]/actions.ts`).

Consecuencias, todas buenas:

- **No se abre ninguna vía de escritura nueva.** Sin `canCreateTask`, la acción
  falla igual que le fallaría a esa persona pulsando el botón a mano.
- La validación, los 400 y los 403 son los mismos que ya están probados.
- Un fallo del modelo es, como mucho, una propuesta mala que el usuario rechaza.

Además: **las funciones que se le declaran al modelo se filtran por
`GET /projects/:id/permissions/me`**. Si el usuario no puede crear tareas, esa
herramienta no entra en la lista y el modelo no puede ni proponerlo.

### 2. La IA decide la recomendación; nosotros ponemos los números

**El modelo no calcula ni estima nunca.** Se le pasan los percentiles ya
calculados por `reports-service` y se le pide que los explique y los cite.

Motivo: si le dejas estimar, dirá «unos 3 días» con total seguridad y sin ninguna
base. Los modelos son malos con la aritmética y buenos explicando. Esto es lo que
separa esta función de un juguete.

El prompt de sistema debe decirlo explícitamente: *no inventes duraciones ni
fechas; usa solo los números del contexto; si el contexto no lo cubre, dilo.*

Lo que **sí** decide el modelo, y está bien que decida:

- **De qué trata una tarea nueva.** El usuario escribe «es del formulario de
  login» y el modelo deduce que eso cae en la etiqueta «frontend». Eso una
  consulta SQL no lo hace, y es exactamente para lo que sirve un LLM.
- **A quién recomendar**, cruzando experiencia y carga.
- Cómo redactar todo.

### 3. Recomendar por experiencia y carga, nunca por velocidad

«Carlos ha cerrado 5 tareas de frontend» es un **hecho sobre qué ha hecho
alguien**. «Carlos es más rápido» es un juicio sobre lo que vale, hecho por un
sistema que no sabe de dificultad ni de contexto.

La recomendación cruza las dos cosas, y la segunda evita el fallo obvio —mandarle
todo al que más sabe justo cuando tiene once tareas abiertas:

> «Carlos: 5 cerradas de *frontend*, mediana 2 días. Ahora tiene 3 abiertas.»

Es la misma línea que ya se trazó en la tabla de personas de Reportes
(ESTADO-ACTUAL §25.7): se enseña **reparto**, no clasificación.

### 4. La cuota necesita estado, y por eso hay microservicio

Un contador mensual que gobierna un coste real no puede vivir solo en Redis: un
`FLUSHALL` regalaría 500 mensajes a todo el mundo. Y como el plan (`FREE`/`PRO`)
es un dato del usuario y no un contador desechable, acaba siendo una tabla de
todos modos.

**`assistant-service`, TCP 3006**, esquema `assistant`.

---

## Arquitectura

```
reports-front (4104)
   └─ Server Action  ──►  gateway :3000
                             POST /projects/:projectId/assistant/chat
                             (JwtGuard + ProjectPermissionGuard, canViewProject)
                                │
                                └─►  assistant-service (3006)
                                        ├─ comprueba y consume cuota   (tabla propia)
                                        ├─ pide contexto a reports-service (3005)
                                        └─ llama a Gemini
```

**Gemini se llama desde `assistant-service`, no desde el gateway ni desde el
frontend.** La clave vive en el `.env` de un solo servicio, el gateway sigue
siendo un router, y una llamada lenta a un tercero no se mete en el camino por
el que pasa todo lo demás.

`assistant-service` abre un `ClientProxyFactory` hacia `reports-service`, igual
que `tasks.service.ts` hace hacia projects (`apps/backend/services/tasks/src/tasks/tasks.service.ts`).

⚠️ **La clave de Gemini nunca en el frontend**, y nunca en una variable
`NEXT_PUBLIC_*`.

---

## Modelo de datos (`assistant-service`)

```prisma
enum AssistantPlan {
  FREE   // 50 mensajes al mes
  PRO    // 500
  @@schema("assistant")
}

/// El plan de cada usuario. Sin fila = FREE.
model AssistantSubscription {
  userId    String        @id
  plan      AssistantPlan @default(FREE)
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt
  @@schema("assistant")
  @@map("assistant_subscriptions")
}

/// Consumo de un usuario en un mes. `period` es 'YYYY-MM'.
///
/// Una fila por mes en vez de un contador que se reinicia: así queda el
/// histórico de consumo, que es lo primero que hará falta el día que existan
/// planes de verdad.
model AssistantUsage {
  id     String @id @default(uuid())
  userId String
  period String
  used   Int    @default(0)
  @@unique([userId, period])
  @@index([period])
  @@schema("assistant")
  @@map("assistant_usage")
}
```

Los límites van en `@praxis/contracts` (`ASSISTANT_LIMITS = { FREE: 50, PRO: 500 }`)
para que el backend y el contador del chat no puedan discrepar.

**No hay pasarela de pago ni checkout.** Cambiar a `PRO` es hoy una operación
manual en la base. No inventes una pantalla de suscripción: prometería algo que
no existe.

### Cuándo se consume

Se incrementa **después de una respuesta correcta de Gemini**. Si Gemini falla,
no se cobra: cobrar por un error que no es del usuario es la clase de detalle que
hace que la gente deje de fiarse del contador.

Contrapartida asumida: alguien podría provocar errores para no gastar cuota. Es
irrelevante — le costaría más trabajo que el que ahorra.

---

## El contexto que ve el modelo

Un «briefing» compacto en JSON. **Acotado a propósito**: cada mensaje lo paga el
usuario en cuota y el equipo en dinero.

Se le pasa:

- Proyecto: nombre, y sus columnas (`id`, `name`, `color`, `order`).
- La instantánea (`/reports/snapshot`).
- Percentiles y predicción (`/reports/cycle-time`, `/reports/forecast`).
- **Experiencia por persona y etiqueta** — consulta nueva, ver abajo.
- Miembros: `userId` y nombre para mostrar.
- Las etiquetas del proyecto, que son el vocabulario con el que el modelo
  clasifica la tarea nueva.

**No** se le pasa: títulos de todas las tareas, descripciones, comentarios ni
adjuntos.

### Consulta nueva que hay que añadir

En `apps/backend/services/tasks/src/tasks/stats.service.ts`, junto a las otras.
Comprobada a mano contra la base; devuelve persona × etiqueta:

```sql
SELECT a."userId", l.name AS etiqueta,
       COUNT(*)::int                                             AS asignadas,
       COUNT(*) FILTER (WHERE t."completedAt" IS NOT NULL)::int  AS cerradas,
       percentile_cont(0.5) WITHIN GROUP (
         ORDER BY EXTRACT(EPOCH FROM (t."completedAt" - t."createdAt"))/3600
       ) FILTER (WHERE t."completedAt" IS NOT NULL)              AS "medianaHoras"
  FROM tasks.task_assignees a
  JOIN tasks.tasks t       ON t.id = a."taskId"
  JOIN tasks.task_labels tl ON tl."taskId" = t.id
  JOIN tasks.labels l       ON l.id = tl."labelId"
 WHERE t."projectId" = $1
 GROUP BY 1, 2
```

⚠️ **El `::int` no es cosmético.** `COUNT(*)` de Postgres es `bigint` y un BigInt
**no se serializa a JSON**: la respuesta revienta al cruzar el TCP y llega como un
500 sin ninguna pista. Ya pasó (ESTADO-ACTUAL §25.6).

⚠️ **Nada de acentos graves dentro de un `$queryRaw`**, ni en los comentarios SQL:
cierran el template literal, el servicio deja de compilar y `nest --watch` sigue
sirviendo el `dist` viejo, así que el síntoma es «un endpoint falla y los demás
van bien». Ya pasó también.

### Los datos de demostración están vacíos para esto

El proyecto real tiene 3 etiquetas con 1 tarea cada una y **ninguna cerrada**. El
sembrado (`Sprint histórico`) **no tiene etiquetas en absoluto**.

Así que la recomendación por experiencia no tendrá base hasta que se siembren
etiquetas. **Hay que ampliar `apps/backend/services/tasks/prisma/seed-events.ts`**
para que reparta 4-6 etiquetas (`frontend`, `backend`, `diseño`, `infra`, `datos`)
entre las 60 tareas, con sesgo por persona: alguien tiene que ser claramente el de
frontend o la recomendación no tendrá nada que recomendar.

Recuerda que ese seed marca todo con `actorId = 00000000-0000-0000-0000-000000000000`
y la interfaz avisa de que es historial fabricado.

---

## Las herramientas que se le declaran a Gemini

Solo dos en la primera versión, y **solo si los permisos del usuario las
permiten**:

| Herramienta | Se ofrece si | Al aceptar, ejecuta |
|---|---|---|
| `proponer_tarea` | `canCreateTask` | `createTaskAction` |
| `proponer_asignacion` | `canEditTask` | `updateTaskAction` / la de asignar |

`proponer_tarea` recibe: `title`, `description?`, `columnId`, `priority`,
`dueDate?`, `assigneeIds?`, `labelIds?`.

⚠️ Recuerda las trampas del contrato: **`status` debe igualar el nombre de la
columna destino**, y **ninguna ruta de tarea acepta `projectId` en el body**. Las
Server Actions existentes ya lo hacen bien — otra razón para reutilizarlas.

---

## Frontend

Chat en la página de reportes (`apps/frontend/reports-front/src/app/(private)/[id]/page.tsx`).

- **Isla cliente** con el hilo de mensajes; el turno de conversación es una
  Server Action.
- **Sin streaming en la primera versión.** Gemini lo soporta, pero atravesar SSE
  por una Server Action complica el bucle y las respuestas aquí son cortas. Un
  estado de carga honesto basta.
- **Contador visible**: «187 / 500 este mes». Poner el coste a la vista de quien
  lo gasta es lo correcto, y además evita la sorpresa al agotarlo.
- **Al agotar la cuota**: mensaje claro con la fecha de reinicio. Nunca un fallo
  mudo.
- **La tarjeta de propuesta** enseña exactamente lo que se va a crear —título,
  columna, prioridad, encargado, fecha— antes de que exista. Botones «Aceptar» y
  «Descartar». Tras aceptar, se dice qué se creó y se enlaza.

Sigue las reglas del repo: la lógica de negocio vive en la page, los componentes
reciben props y slots. El armazón está en dos piezas (`AppShell` en el layout,
`AppHeader` en la page) — no lo vuelvas a montar dentro de la página.

---

## Verificación

1. **Cuota**: agotar el plan gratis y comprobar que el mensaje 51 se rechaza con
   mensaje claro; que un error de Gemini **no** consume; que cambiar la fila a
   `PRO` sube el tope a 500; que el contador del chat coincide con la tabla.
2. **Permisos**: con la cuenta `final1785266783@praxis.dev` (rol «Colaborador»,
   sin `canCreateTask`), comprobar que el modelo **no** recibe la herramienta de
   crear tarea y que no la propone.
3. **La propuesta no ejecuta nada**: proponer una tarea, **no** aceptar, y
   comprobar en `psql` que no se creó ninguna fila.
4. **Aceptar sí ejecuta**, y la tarea aparece en el tablero con su columna,
   prioridad y encargado.
5. **Los números no se inventan**: preguntar «¿para cuándo?» y comprobar que la
   cifra que responde coincide con la de `/reports/forecast`.
6. **Navegador**: pestaña nueva por verificación, directo a `localhost:4104`.

---

## Trampas del repo que te van a morder

Están todas en CLAUDE.md, pero estas son las que aplican aquí:

1. **No pases Biome.** Pide 4 espacios, el repo está a 2, y reformatea todo.
2. **`COUNT(*)` es `bigint`** y no se serializa a JSON → `::int` en el SQL.
3. **Sin acentos graves dentro de un `$queryRaw`.**
4. Un controlador nuevo que cuelgue de `tasks/:taskId` y no esté en
   `TASK_CONTROLLERS` recibe 403. Las rutas del asistente cuelgan de
   `/projects/:projectId/...`, así que **el guard funciona sin tocar nada**.
5. **Carreras de puerto con `nest --watch`**: si un servicio parece caído,
   compruébalo antes de buscar el fallo en el código. Ha pasado tres veces.
6. **El navegador de automatización** pierde la sesión con facilidad; si algo da
   404, reprodúcelo con `curl` y una cookie real antes de dar por hecho que es
   tuyo.
7. Al terminar, actualiza `CONTRATO-API.md` y `ESTADO-ACTUAL.md` **según
   avances**, no al final.

---

## Lo que este encargo deja fuera a propósito

| Fuera | Por qué |
|---|---|
| Pasarela de pago | No hay integración de cobro; el plan se cambia a mano |
| Historial de conversaciones | La tabla se puede añadir después sin romper nada |
| Streaming de respuesta | Complica el bucle y aquí no aporta |
| Que la IA ejecute sin confirmar | Es la línea de seguridad de todo el diseño |
| Recomendar por velocidad | Mide lo fácil de contar, no lo que importa |
