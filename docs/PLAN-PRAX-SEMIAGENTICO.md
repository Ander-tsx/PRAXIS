# Plan — PRAX semi-agéntico

> **Etapa abierta** (2026-09-29, rama `feature/prax-semiagentico`, sacada de
> `feature/scrum-kanban` porque ahí viven los últimos arreglos del panel de
> PRAX y el plan anterior). Sustituye a
> [`frontend/PLAN-PRAX-AGENTICO.md`](frontend/PLAN-PRAX-AGENTICO.md), que se
> conserva por el diagnóstico en frío y la ficha de Jev.
>
> ⚠️ **Toca el backend, por encargo explícito.** Es el segundo plan que lo hace
> después de [PLAN-ORGANIZACION-ACTIVA](PLAN-ORGANIZACION-ACTIVA.md): el
> encargo es un refactor de PRAX «tanto frontend como backend». Cada fase dice
> qué servicio toca.
>
> **Se sigue estrictamente.** Una sesión que retome esto empieza leyéndolo
> entero, y marca la casilla de cada fase al cerrarla, con su commit.
>
> ### Cómo empieza la sesión que lo retome
>
> El dueño del producto lo dejó así (2026-09-29): una sesión nueva **lee este
> plan, lo comenta un poco con él y después se pone a trabajar**. No empieza a
> escribir código sin esa conversación. En orden:
>
> 1. Leer este documento entero, [PLAN-MONOLITO](PLAN-MONOLITO.md) §1-§3 (el
>    backend es ya un proceso: cambia *dónde* vive el código, no el plan) y la
>    nota de [MCP](PRAX-MCP-SEGUNDA-ITERACION.md).
> 2. Abrir las dos imágenes de referencia de §1.7, que son parte del encargo.
> 3. Comprobar que Jev sigue respondiendo con la prueba de humo de §5. La clave
>    está en el `.env` de assistant-service, que no se versiona. Si falta o se
>    rotó, pedírsela al dueño del producto.
> 4. Traer a la conversación lo que merece discutirse antes de F0:
>    - el orden de las fases;
>    - D15: si @PRAX en el chat grupal puede proponer o solo responder;
>    - la ponderación de D8;
>    - si el efecto de escritura de D11 va con streaming real desde F3 o simulado
>      antes.
>
>    Las tres preguntas de §5 ya están cerradas.

---

## 0. El encargo, literal y resumido

Dictado el 2026-09-29. Lo que se pidió, agrupado:

1. **Refactor completo de PRAX, frontend y backend**, de peticiones sueltas a un
   proceso **semi-agéntico**. ⚠️ **SIN EJECUTAR: PRAX sigue proponiendo.**
2. **No mandar todo el contexto en cada petición.** Usar **Jev** para enrutar
   (y donde sea útil), tras evaluar si es viable. Si no lo es, otra forma
   semi-agéntica solo con Gemini.
3. **Arreglar de paso todos los errores** alrededor de la integración con
   organizaciones — incluido el «PRAX no responde».
4. **«Recursos» completamente funcional**: elegir qué proyectos puede consultar
   PRAX, siempre **dentro de la organización activa**. PRAX no ve nada de otra
   organización.
5. **Rediseño del chat de PRAX**: burbujas del usuario más redondeadas; texto
   de PRAX **sin burbuja**, con efecto de escritura y cursor de bloque;
   propuestas animadas, con brillo o borde que pasa de morado a verde al
   aceptarse, y **diseño distinto según el tipo de acción**.
6. **Rediseño de los chats de personas** (privado y grupal): avatar, nombre y
   hora arriba y burbuja debajo. Los avisos de la automatización «avisar en el
   chat» se pintan como **divisor profesional**, aunque sigan perteneciendo a un
   usuario.
7. **Cobrar por tokens, no por mensajes**: un máximo de consumo de PRAX **por
   persona dentro de la organización**, medido de forma profesional (entrada,
   salida, iteraciones), y explicado en los planes de facturación.
8. **Adjuntos honestos**: el botón «+» despliega los tipos de archivo que PRAX
   puede leer de verdad, con límites de tamaño y cantidad visibles. Fuera
   «etiquetar persona» y «etiquetar proyecto».
9. **Consumo de tokens visible** en cada conversación.
10. **Avisar** cuando una conversación es tan larga que seguirla sale caro.
11. **Mismo modelo**: el Gemini básico (`gemini-flash-latest`).
12. **Documentar para la segunda iteración** qué tan viable es un MCP de Claude
    u otras IAs con Praxis → [PRAX-MCP-SEGUNDA-ITERACION.md](PRAX-MCP-SEGUNDA-ITERACION.md).
13. **PRAX consciente de todas las funciones de Praxis.** Si no tiene acceso a
    una porque el usuario no tiene el permiso, lo dice. «Todo» incluye el
    backlog, mandar mensajes a chats (desde el usuario, marcados «enviado por
    PRAX») y leer, escribir y mejorar documentos.
14. **Hablar con PRAX desde el chat grupal de un proyecto.**

---

## 1. Lo que hay hoy (mapa del 2026-09-29)

Investigado en frío, por lectura, con `file:line`. No se reprodujo nada en vivo.

### 1.1 El turno de PRAX

- **Una sola pasada, sin bucle.** `assistant.service.ts:287-536`: cuota →
  historial → briefing (TCP a reports-service, solo con proyecto) →
  herramientas → **una** llamada a Gemini → cobro → si alguna propuesta no pasa
  la validación o falta el texto, un **turno de recuperación** que no se cobra
  (`:429-497`) → guardar.
- **Las 13 herramientas son `proponer_*`**. Ninguna devuelve datos al modelo
  (`tools.ts`, `herramientasPara` `:763`, sin proyecto `:749`). PRAX no puede
  «mirar» nada que no esté ya en el prompt.
- **Gemini** por `fetch` directo a `:generateContent`, **sin streaming**
  (`gemini.client.ts`). Timeout de 45 s, 3 intentos con backoff, `maxOutputTokens`
  2048 (8192 en plantillas). **No lee `usageMetadata`**: hoy no se mide ni un
  token real.
- **Historial**: los últimos 12 mensajes (`MAX_HISTORIAL`,
  `contracts/assistant/assistant.dto.ts:78`). 🔴 **El corte no se avisa**: es un
  recorte mudo.
- **Cuota por mensajes**: `AssistantUsage{userId, organizationId, period, used}`,
  +1 si Gemini respondió. `iaMensualPorPersona` en `plans.ts:199`: FREE 13, PRO
  75, TEAM 100, BUSINESS 300, ENTERPRISE 1000.
- **`medir-prompt`** estima 4 caracteres ≈ 1 token y **no cuenta historial ni
  adjuntos** (`scripts/medir-prompt.ts:28-38`).

### 1.2 Organización: las fugas

| # | Dónde | Qué pasa |
|---|---|---|
| O1 | `gateway/.../my-assistant.controller.ts:228-243` (`proyectosQuePuedeAbrir`) | `project_find_all` **sin `organizationId`**: PRAX sin foco ve y propone abrir proyectos de **todas** tus organizaciones. Además traga el error (`.catch(() => null)`, `:240`) y entonces `abrir_proyecto` se descarta siempre |
| O2 | `assistant/prisma/schema.prisma` (`Conversation`) | La conversación **no tiene `organizationId`**; `listar(userId)` (`conversations.service.ts:48`) mezcla todas |
| O3 | `gateway/.../assistant.controller.ts` | El modo con proyecto no comprueba que el proyecto sea de la organización **activa**: vale cualquiera al que tengas acceso |
| O4 | `web/src/app/(privado)/assistant/page.tsx:87` | La lista de proyectos se pide sin `organizationId`: el selector mezcla organizaciones |
| O5 | `web/.../PraxScreen/PraxScreen.tsx:116-131` | No pasa `organizacionActivaId` a `AssistantChat` (`PraxWindow.tsx:83` sí) |
| O6 | `commons/organisms/AssistantChat/ComposerControls.tsx` | «Recursos» es un **armazón**: vive en `localStorage` (`:206-246`), **no llega nunca al backend** (0 resultados en el backend), trae todas las organizaciones cuando falta el id, `any[]`, `catch(() => {})`, no filtra por `canViewReports`. El texto «PRAX solo mira lo que marques aquí» (`:388`) **es falso** |

### 1.3 «PRAX no responde» — la hipótesis que sube

🔴 **Más probable (sin reproducir): el corte de 15 s del cliente.**
`preguntarAction` usa `createServerApiClient`, cuyo `fetch` lleva
`timeoutSignal` con `REQUEST_TIMEOUT_MS = 15_000` (`commons/api/timeout.ts:44`,
`commons/auth/server-client.ts:95`). El gateway no pone plazo propio. Un turno
real pasa de 15 s sin esfuerzo: briefing grande, hasta 3×45 s de reintentos, un
turno de recuperación, 8192 tokens de plantilla. Lo que se ve:

- el navegador pinta un error de tiempo agotado en la burbuja;
- **el backend sigue**: cobra el mensaje y guarda el turno;
- la respuesta aparece **al recargar**.

El plazo entró en `f19fcee1` (2026-08-10), días antes de las organizaciones.
Coincidencia de fechas: explica por qué se atribuyó a la migración.

Las tres hipótesis del plan anterior quedan así: la 3 (`organizationId` nulo),
**descartada** (NOT NULL desde el primer día); la 2 (caché de permisos),
**matizada** (sí se invalida; queda una ventana de 30 s); la 1 (Gemini falla),
**viva**, pero la de arriba explica mejor el síntoma.

### 1.4 Frontend de PRAX

- `AssistantChat.tsx` (2362 líneas), cuatro variantes; **`panel` y `cajon` no
  las monta nadie** (Análisis ya no existe).
- Una sola `Burbuja` para las dos voces (`:1853-1910`), `rounded-sm`.
  `FlujoDePensamiento.tsx:58` es una animación de pasos **simulada**.
- **14 tipos de propuesta** en `ProposalCard.tsx` (1816 líneas), todos con el
  mismo `Marco` (`:1357`); solo el borrado cambia a rojo. Sin animación de
  entrada ni al aceptar.
- Adjuntos: menú «+» con imagen, archivo, **etiquetar proyecto** y **etiquetar
  persona** (`AssistantChat.tsx:1701-1708`). Límites (3 por mensaje, 5 MB, PDF,
  PNG, JPEG, WebP, texto y Markdown) **duplicados a mano** entre
  `commons/api/assistant.ts:320-350` y `contracts/.../assistant.dto.ts:114-238`.
- La cuota se enseña en cuatro sitios, todos en **mensajes**: `ContadorCuota`,
  `AmpliarPlan`, `PlanCatalog` («Consultas a PRAX / mes») y `planes.ts`.

### 1.5 Chats de personas

- Un solo organismo para los dos: `commons/organisms/ChatPanel/ChatPanel.tsx`,
  cada mensaje en `MessageBubble.tsx`. La hora va **dentro** de la burbuja; la
  referencia la pone junto al nombre.
- 🔴 **La agrupación por autor ignora el tiempo**: `ChatPanel.tsx:1794` agrupa si
  el autor es el mismo, y `CORTE_DE_BLOQUE_MS` (`:44`, 5 min) está declarada
  **sin usar**.
- `text-white` literales en `ChatPanel.tsx:1771`, `:1782` y `MessageBubble.tsx:740`
  (hallazgo E4).
- **`ChatMessage` no guarda de dónde sale un mensaje**
  (`services/projects/prisma/schema.prisma:690-773`). La automatización manda
  por `chat_project_send` con `requesterId = rule.createdBy`
  (`automation/.../actions.ts:253-268`) y queda idéntica a uno escrito a mano.
  `ActionContext` (`:39-50`) ni siquiera lleva la regla.
- ⚠️ La trampa 14 de `CLAUDE.md` está **desactualizada**: `CHAT_MESSAGE` ya no
  viaja por el flujo de avisos; va como `chat.mensaje`
  (`commons/api/domain.ts:1179-1185`). `CHAT_EVENT_TYPE` en `chat.service.ts:122`
  es código muerto.

### 1.6 Jev

**Viable con reservas.** Ficha completa en
[PLAN-PRAX-AGENTICO §2](frontend/PLAN-PRAX-AGENTICO.md). Lo que decide aquí:

- **Qué es**: `jev-1.13.0`, solo texto. Devuelve decisiones tipadas con
  probabilidad (`noul`, `choice` hasta 255 opciones, `score` de 2 a 10 niveles).
- **Coste**: $0,042/M tokens de entrada, salida gratis; lee unas **7× más
  barato** que Gemini Flash.
- **Límites**: 32k tokens entre `state` y la pregunta más larga. Latencia de
  70 a 500 ms.
- **Alta**: la consola de TypeSafe tiene las cuentas nuevas **pausadas desde el
  22-09**. Se entra hoy por **OpenRouter** (`~typesafe/jev-latest`, con la tilde) o Cloudflare.
- **Calidad** (pruebas independientes): a la par de un LLM de precio medio.
  Tres pegas:
  - En español rinde **3 a 6 puntos** peor.
  - Es frágil con cómo se nombran las opciones: renombrarlas cambia el 32,5%
    de las respuestas.
  - Su confianza sale optimista y hay que calibrarla con ejemplos propios.
- **Estabilidad**: el producto tiene dos semanas de vida. 99,83% de
  disponibilidad en 90 días, sin SLA.
- **Dónde sirve**:
  - Elegir qué contexto le llega a Gemini.
  - Clasificar la intención del turno.
  - Detectar menciones implícitas a PRAX en el chat grupal.
- **Dónde no aporta**: decidir si hace falta otra vuelta del bucle. Gemini ya lo
  decide al pedir o no otra herramienta.
- **Cuánto ahorra**: con 20k tokens candidatos que se quedan en 6k, un **~55%
  neto** por turno. Con 4k no compensa el salto de red.

### 1.7 Las referencias visuales del encargo

El dueño del producto pasó dos capturas como **idea, no como calco** («no lo
hagas exactamente así, pero es para que entiendas el punto»). Están en el
repositorio para que cualquier sesión las pueda abrir. En palabras, lo que
importa de cada una:

**[`propuesta-de-prax.png`](assets/referencias-prax/propuesta-de-prax.png)**:
PRAX proponiendo asignar dos tareas (D11 y D12). Fondo oscuro.

- **Icono de PRAX** arriba a la izquierda: una máscara en contorno violeta.
- **La etiqueta `PRAX`**: pequeña, en mayúsculas espaciadas, gris.
- **El texto de PRAX**: grande, con peso, en blanco y **sin burbuja**. Por
  ejemplo: «Dos: «Revisión de diseño» y «Migración de permisos». ¿Se las
  asigno a Lucía?».
- **La propuesta**: debajo, un recuadro de esquinas redondeadas (~12 px) con
  borde fino violeta y relleno algo más claro que el fondo.
  - **Cabecera**: `PROPUESTA` en monoespaciada pequeña, violeta, en
    mayúsculas espaciadas, y a su lado el título, «Asignar 2 tareas», en
    blanco.
  - **Cuerpo**: **filas**, no tarjetas, cada una con un fondo apenas más claro
    y redondeada. Lleva el nombre de la tarea, una píldora con su columna
    («Review» en tinte azul, «To Do» en tinte violeta) y, a la derecha, una
    flecha gris `⟶` y el avatar redondo de iniciales («LR») de quien la
    recibe.
  - **Pie**: el botón «Aceptar» macizo y violeta, «Rechazar» como texto gris,
    y a la derecha, en gris muy tenue: «con tus permisos, por el mismo botón
    que usarías tú».

  Ese último texto es la regla «propone; nunca ejecuta» contada al usuario, y
  merece quedarse.

**[`chat-de-personas.png`](assets/referencias-prax/chat-de-personas.png)**: el
chat de un equipo (D14). Fondo oscuro.

- **Separador de día**: `HOY`, centrado, pequeño, en mayúsculas espaciadas y
  gris.
- **Cada mensaje**:
  - un **avatar redondo de color con iniciales** a la izquierda: «LR» azul,
    «DV» ámbar, «MS» verde;
  - a su derecha, una cabecera con el **nombre en blanco y negrita** y la
    **hora en gris pequeña** («9:12 a. m.»);
  - debajo, la **burbuja**: gris oscuro, redondeada (~12 px) y con el texto en
    blanco.
- **Menciones y referencias** dentro del texto, como fichas con tinte:
  «@Mariana» en violeta, «Review» en azul.
- **Al final, el aviso de una automatización como divisor**:
  - dos líneas punteadas a los lados;
  - en el centro, una píldora de borde fino y esquinas del todo redondas con
    «⚡ Regla «Tarea en revisión» avisó a 2 personas» en gris.

  No parece un mensaje de nadie, aunque en la base pertenezca a quien creó la
  regla (D13).

⚠️ Las dos usan colores literales. Aquí van **por tokens** de `theme.css`: nada
de `text-white` (hallazgo E4), y el violeta y el verde de D12 salen de la
paleta.

---

## 2. Decisiones

**D1 — «Semi-agéntico» = bucle de lectura, escritura solo por propuesta.**
PRAX razona en varias vueltas: en cada una puede pedir **herramientas de
consulta** (`consultar_*`) que el servidor ejecuta y le devuelve, y al final
responde con texto y, si toca, **propuestas**. Las consultas no cambian nada;
las propuestas siguen siendo lo único que escribe, y las ejecuta el frontend,
una a una, con la sesión de quien acepta y por los endpoints de siempre. La
regla «el asistente propone; nunca ejecuta» **no cambia**: la lectura
autónoma es la primera lectura de «agéntico» del plan anterior, y el encadenar
propuestas es la segunda.

**D2 — El bucle tiene topes duros, y se dicen.**
Como máximo **4 vueltas de consulta** más la respuesta final, y un **presupuesto
de tokens por turno** (entrada acumulada). Al tocar cualquiera de los dos, la
última vuelta se hace **sin herramientas** y el prompt le dice a PRAX qué no
llegó a mirar. Un tope que no se dice es un recorte mudo (invariante I3).

**D3 — Las consultas corren en `assistant-service`, contra un mapa de permisos
que le da el gateway.** El gateway ya resuelve `permissions/me`. Por cada
proyecto del alcance (D5) le pasa al servicio su mapa de permisos, y cada
consulta se comprueba contra él: `consultar_tareas` exige `canViewProject`,
`consultar_analisis` exige `canViewReports`, etc. Los datos se piden por TCP a
los servicios que ya existen (tasks, projects, reports), igual que hoy el
briefing. **Ninguna consulta abre un permiso que la pantalla no dé.**

**D4 — PRAX conoce todo Praxis; solo puede proponer lo que el usuario puede
hacer.** El prompt lleva un **catálogo compacto de capacidades**: una línea
por función, con el permiso que exige. Las herramientas que el usuario no puede
usar **no se declaran** como invocables. El catálogo sí las nombra, para que
PRAX responda «para eso necesitas el permiso X; pídeselo a quien administra el
proyecto» en vez de hacerse el tonto. Una sola fuente, `capabilities.ts`, de la
que salen el catálogo y las declaraciones: dos listas acabarían divergiendo,
como ya se vio con las reglas por `ambito`.

**D5 — «Recursos» es un alcance guardado en el servidor, por
(persona, organización).** Tabla nueva `AssistantScope{userId, organizationId,
mode: ALL|SELECTED, projectIds[]}` en assistant-service. Sin fila, `ALL`: todos
los proyectos de la organización activa que la persona puede ver con
`canViewReports`. El gateway **vuelve a validar** los `projectIds` en cada turno
contra la organización y los permisos actuales, porque te pueden sacar de un
proyecto después de marcarlo. PRAX no recibe el contenido de esos proyectos,
recibe el **índice**: nombres, tableros, recuentos. Lo demás lo consulta (D1).

**D6 — Todo PRAX cuelga de la organización activa.** La conversación lleva
`organizationId` (NOT NULL; las viejas se asignan a la organización personal del
dueño en la migración). Listar, abrir y continuar filtran por la activa. Un
proyecto de otra organización da **403 `NOT_IN_ORG`** en el modo con proyecto,
aunque tengas acceso a él: mezclar es exactamente el malentendido que se quiere
evitar. El `organizationId` sale de `loadPrivateChrome()` en el frontend y el
gateway lo valida con `organizacionElegida`. Nunca se lee la cookie en crudo.

**D7 — El turno viaja por SSE.** `POST /…/assistant/chat` con
`Accept: text/event-stream`. Eventos:

- `paso`: la consulta en curso. Sustituye a la animación simulada de
  `FlujoDePensamiento`.
- `texto`: deltas del texto de PRAX.
- `propuesta`: una propuesta ya validada.
- `uso`: los tokens del turno.
- `fin`: el cierre del turno.
- `error`: el fallo, con su código.

Esto quita de raíz el corte de 15 s, porque el proxy ya no pone plazo a un flujo
(`commons/auth/proxy.ts:165-180`), y hace **real** el efecto de escritura. El
gateway habla con el servicio por TCP devolviendo un `Observable` de varios
valores. Dos avisos:

- El manejador lleva `SSE_METADATA`, o el interceptor del sobre se come el
  `type` (trampa 12).
- Gemini se llama con `:streamGenerateContent?alt=sse`.

**D8 — Se cobra en «tokens PRAX»: tokens ponderados por su coste real.**
Unidad = `entrada + 0,25·caché + 8·(salida + razonamiento)`, que es la
proporción de precios de Gemini Flash. Así, un token de salida pesa lo que
cuesta. Las consultas de Jev se suman a su precio: pesan 0,14 por token de
entrada. Se cuenta **cada vuelta del bucle**. El turno de recuperación se
**registra pero no se cobra**: es culpa nuestra.
`AssistantUsage` pasa de `used` (mensajes) a `tokens` (BigInt); la clave sigue
siendo `(persona, organización, mes)` (trampa 20). La cuota
`iaMensualPorPersona` pasa a `iaTokensMensualesPorPersona`, y **el commit que
la añade es el que la aplica** (trampa 23). Las cifras por plan salen de medir
en F0; no se inventan.

**D9 — Consumo visible y aviso de conversación larga.**
Cada turno guarda sus tokens, y la conversación enseña el turno y el total. Hay
dos umbrales:

- Cuando la entrada del próximo turno pase de **~30k tokens**, un aviso fijo lo
  dice, con lo que costaría seguir. Se ofrece «empezar una conversación nueva
  con un resumen». El resumen es una propuesta más: lo pides y cuesta un turno.
- El corte a 12 mensajes del historial **se dice**, igual que `tareasOmitidas`.

**D10 — Jev entra detrás de una interfaz, con interruptor y red de seguridad.**
`ContextRouter` tiene dos implementaciones: `HeuristicRouter` (los topes fijos
de hoy, por defecto) y `JevRouter`, por **OpenRouter**, con
`PRAX_ROUTER=jev` y la clave en `.env`. Jev solo entra si el contexto candidato
pasa de **~8k tokens**. Lo que decide:

- Qué proyectos del alcance y qué documentos entran en el índice: una pregunta
  `noul` por candidato, con **títulos y resúmenes**, no contenido.
- Qué herramientas de consulta se declaran.
- La intención del turno, con etiquetas fijas en inglés.

Si pasa de **800 ms**, o da 429 o 529, se usa el heurístico **y el turno sigue**:
Jev nunca deja a PRAX sin responder (I4). Se registra qué router decidió. Los
umbrales se calibran con 50–300 ejemplos propios en español antes de
activarlo en producción.

**D11 — Chat de PRAX: el usuario en burbuja, PRAX sin ella.**
- Burbuja del usuario `rounded-2xl`, a la derecha, con el tono de marca.
- PRAX a la izquierda, sin burbuja, junto a su icono y la etiqueta `PRAX`.
  Mientras llega `texto`, un **cursor de bloque** parpadea al final.
- El efecto de escritura va a ritmo constante aunque Gemini entregue a golpes,
  y se salta con `prefers-reduced-motion`.
- Colores siempre por tokens, nada de `text-white` (E4).

**D12 — Propuestas por familia, con animación de entrada y de aceptación.**
Seis familias, cada una con su icono, su acento y la forma de su cuerpo:

| Familia | Qué agrupa |
|---|---|
| **crear** | tarea, tablero, sprint, documento, plantilla |
| **cambiar** | edición, asignación, checklist, estimación |
| **mover** | movimiento, marcar pasos, backlog ↔ sprint |
| **comunicar** | comentario, mensaje a chat |
| **analizar** | gráfico, pregunta |
| **destruir** | borrado |

Cómo se animan:
- Entran con un fundido y un desplazamiento corto, escalonados cuando llegan
  varias.
- Al aceptar, el borde recorre un degradado **morado → verde**, y la tarjeta se
  asienta en su estado aceptado.
- El borrado se queda en rojo.

La imagen de referencia del encargo ([§1.7](#17-las-referencias-visuales-del-encargo)) es una idea, no un calco. La composición
sigue `kyloo-design` §13: filas en vez de tarjetas dentro de la propuesta y
tipografía como jerarquía.

**D13 — `ChatMessage.origin`: el mensaje sigue siendo de una persona, pero se
sabe de dónde vino.** Enum `USER | AUTOMATION | ASSISTANT`, por defecto `USER`,
más `originMeta Json?`: `{ ruleId, ruleName, destinatarios }` o
`{ invocadoPor, conversationId }`. **Solo se acepta por TCP.** El DTO HTTP del
gateway no lo admite: si lo admitiera, cualquiera podría falsificar un aviso de
regla. `ActionContext` pasa a llevar la regla.

**D14 — Chats de personas con cabecera y burbuja.**
- Avatar, nombre y hora en la cabecera; burbuja `rounded-2xl` debajo.
- Los mensajes seguidos del mismo autor se agrupan **solo dentro de
  `CORTE_DE_BLOQUE_MS`**.
- El separador de día se queda.
- `AUTOMATION` se pinta como **divisor centrado**:
  «⚡ Regla «X» avisó a N personas».
- `ASSISTANT` se pinta como mensaje normal de su autor, con la marca
  «enviado con PRAX».

**D15 — @PRAX en el chat grupal responde, no propone.**
- La mención es determinista: `@[PRAX](assistant:prax)`, un `ChatRefKind` nuevo.
- La dispara el **gateway** en `ProjectChatController.send`, después de
  guardar, sin esperar. Usa la sesión de quien mencionó, así que cobra a esa
  persona y en esa organización.
- La respuesta se publica con `origin: ASSISTANT`.
- Si PRAX quiere proponer algo, la propuesta va a la **conversación privada** de
  quien lo invocó, con un enlace en el hilo. En un chat de grupo, una tarjeta
  que solo puede aceptar una persona es ruido para todas las demás.
- La detección implícita con Jev, sin `@`, queda **fuera de esta etapa**: un
  falso positivo hace hablar a PRAX donde nadie lo llamó.

**D16 — Capacidades nuevas, todas como propuesta.**

| Capacidad | Consulta | Propuesta | Endpoint de siempre al aceptar |
|---|---|---|---|
| Backlog y sprints | `consultar_backlog`, `consultar_sprint` | crear o arrancar sprint, meter o sacar del sprint, estimar | `boards/:id/sprints/*`, `tasks?backlog=true` |
| Mensajes | `consultar_chat` (últimos N) | mandar mensaje al chat del proyecto o a un privado | `POST projects/:id/chat/messages`, `POST me/chats/:peerId/messages`, con `origin: ASSISTANT` |
| Documentos: leer | `consultar_documento` (el Markdown de copia) | — | — |
| Documentos: crear | — | crear con contenido | `POST workspaces/:id/documents` (acepta `content`) |
| Documentos: mejorar | — | una **revisión propuesta** en Markdown | al aceptar, el **editor del navegador** la aplica por collab/Yjs, porque el `PATCH` con `content` da 400 (E4 de documentos). Queda como una versión más y se deshace como cualquier otra |
| Automatizaciones | `consultar_automatizaciones` | crear regla (pausada), activar | `projects/:id/automations`. Cuenta cuota **al activar** (trampa 23) |

**D17 — Adjuntos: el menú dice lo que PRAX lee.**
- El «+» despliega **Imagen** (PNG, JPEG, WebP), **PDF** y **Texto** (`.md`,
  `.txt`), cada una con su límite escrito.
- Fuera «etiquetar persona» y «etiquetar proyecto».
- Los límites dejan de estar duplicados: salen de un solo sitio que importan el
  frontend y el backend. Si no se puede por el empaquetado, una prueba compara
  los dos.

---

## 3. Invariantes

- **I1** — PRAX no escribe. Toda escritura es una propuesta aceptada por una
  persona y ejecutada por el frontend con su sesión.
- **I2** — Todo cuelga de la organización activa. Ni una consulta, ni un índice,
  ni una conversación cruza a otra organización. El identificador se deriva del
  recurso o se valida; nunca se lee la cookie en crudo.
- **I3** — Ningún recorte mudo. Lo que el router, el bucle o el historial dejan
  fuera, PRAX lo sabe y lo puede decir.
- **I4** — Jev nunca bloquea un turno.
- **I5** — Todo token gastado queda contado en `(persona, organización, mes)`,
  incluidas las vueltas del bucle y Jev. Lo que no se cobra (la recuperación) se
  registra igual.
- **I6** — Una consulta de PRAX nunca devuelve algo que la persona no vería en la
  pantalla correspondiente.

---

## 4. Orden

Cada fase cierra con `pnpm test`, `e2e:regresion` verde y su commit. Las fases
que tocan esquema llevan migración (`prisma:deploy`, **nunca `reset`**).

- [x] **F0 — Parche y medición.** Ver el registro del 2026-09-29 (noche).
  - `preguntarAction` sin el corte de 15 s: plazo propio de 120 s, hasta que
    F3 lo sustituya por SSE.
  - Reproducir «no responde» con el stack arriba para confirmar la hipótesis
    de §1.3.
  - Leer `usageMetadata` en `gemini.client.ts` y registrarlo por turno.
  - Que `medir-prompt` cuente historial y adjuntos y use `countTokens`, no
    caracteres ÷ 4.
  - **Sale**: tokens reales por turno típico → cifras de D8 por plan.
- [x] **F1 — Organización activa en todo PRAX** (O1–O5). Ver el registro.
  - `Conversation.organizationId` con migración.
  - Listado filtrado; `proyectosQuePuedeAbrir` con organización y sin tragar
    errores.
  - Modo con proyecto exige la organización activa.
  - `/assistant` pide los proyectos de la activa; `PraxScreen` pasa la
    organización.
  - e2e: dos organizaciones, PRAX no ve la otra.
- [x] **F2 — Recursos de verdad** (D5, O6). Ver el registro.
  - `AssistantScope` y rutas `GET`/`PUT /me/assistant/scope`, con la
    organización validada.
  - `ComposerControls` lee y escribe el servidor, sin `localStorage`, `any` ni
    `catch` vacío.
  - Fuera los interruptores «Pronto» que no hacen nada: MCP, Modo Auto y el
    selector de modelo.
- [x] **F3 — Turno por SSE y bucle de consulta** (D1, D2, D3, D7). Ver el registro.
  - `streamGenerateContent`.
  - Herramientas `consultar_*` sobre lo que ya existe: tareas, tablero,
    análisis y miembros.
  - Topes del bucle.
  - Eventos `paso`, `texto`, `propuesta`, `uso` y `fin`.
  - `FlujoDePensamiento` real.
  - Fuera las variantes muertas `panel` y `cajon`.
- [x] **F4 — Tokens PRAX** (D8, D9). Ver el registro.
  - Migración de `AssistantUsage`; `iaTokensMensualesPorPersona` en
    `plans.ts`, aplicada en el mismo commit.
  - Consumo por turno y por conversación en la interfaz.
  - Aviso de conversación larga y del corte del historial.
  - `PlanCatalog`, `AmpliarPlan`, `ContadorCuota` y `planes.ts` en tokens.
  - `docs/AUDITORIA-PLANES.md` actualizado.
- [x] **F5 — Router** (D10). Ver el registro.
  - `RouterDeContexto` con los dos modos (`heuristic`, el comportamiento de
    antes, y `jev` por OpenRouter), apagado por defecto.
  - Conjunto de calibración en español.
  - Medido con y sin Jev sobre los mismos turnos.
- [x] **F6 — Origen del mensaje** (D13). Ver el registro.
  - `ChatMessage.origin`/`originMeta`, solo TCP.
  - `ActionContext` con la regla.
  - `CON_MENSAJE` selecciona los campos.
- [x] **F7 — Capacidades** (D4, D16). Ver el registro.
  - `capabilities.ts` como fuente única.
  - Consultas y propuestas nuevas: backlog, sprints, chat, documentos y
    automatizaciones.
  - Mensajes de «falta permiso».
  - Revisión de documento aplicada por el editor.
- [x] **F8 — Interfaz de PRAX** (D11, D12, D17). Ver el registro.
  - Burbujas, texto sin burbuja, cursor y escritura.
  - Propuestas por familia, con animaciones.
  - Menú de adjuntos.
- [x] **F9 — Chats de personas** (D14). Ver el registro.
  - Cabecera y burbuja, agrupación por tiempo.
  - Divisor de automatización, marca «enviado con PRAX».
  - Fuera los `text-white` literales.
- [x] **F10 — @PRAX en el chat grupal** (D15). Ver el registro.
- [ ] **F11 — Cierre.**
  - `CLAUDE.md`: trampa 14 corregida y las trampas nuevas.
  - `ESTADO-ACTUAL`, `GUION-DEMO` y la auditoría de planes.
  - e2e del bucle, del alcance y de la mención.

F0 y F1 van primero porque todo lo demás se construye encima. Un bucle agéntico
sobre una lista de proyectos que cruza organizaciones multiplica la fuga, no la
arregla.

---

## 5. Decidido con el dueño del producto (2026-09-29)

Las tres preguntas abiertas se cerraron aceptando las propuestas:

1. **Cifras de tokens por plan**: salen de medir en F0, con «mensajes de hoy ×
   tokens medios por turno», redondeadas. Se confirman al cerrar F0, antes de
   F4.
2. **Unidad que ve el usuario**: **«tokens PRAX»** ponderados (D8), con una
   línea que explique la ponderación.
3. **OpenRouter para Jev**: la cuenta la dio de alta el dueño del producto, con
   un **tope de gasto muy bajo** a propósito, para que una filtración no cueste
   nada.

### Jev por OpenRouter: cómo está conectado

- **La clave** vive en `apps/backend/services/assistant/.env` como
  `OPENROUTER_API_KEY`. Ese `.env` está ignorado por git
  (`services/assistant/.gitignore:3`). 🔴 **Es provisional**: el dueño la
  rotará, y **nunca** se escribe en un archivo versionado ni en un documento.
- Las otras variables, ya puestas: `PRAX_ROUTER=heuristic` (apagado hasta
  F5), `JEV_MODEL=~typesafe/jev-latest`, `JEV_TIMEOUT_MS=800`. Están en
  `.env.example` sin valor de clave.
- ⚠️ **La ruta no es la de chat.** OpenRouter expone Jev en
  `POST https://openrouter.ai/api/alpha/decisions`, no en
  `/api/v1/chat/completions`, que es lo que usaría un cliente de OpenAI por
  inercia. El cuerpo es `{ model, state, questions }`, con `questions` como
  **mapa** por id, igual que la API directa de TypeSafe. El alias es
  `~typesafe/jev-latest`, con la tilde.
- **La respuesta** trae:
  - `answers[id]`: `noul` como número; `choice` con `choice`, `probabilities`
    y `confidence`.
  - `usage.input_tokens`, `usage.output_tokens` y **`usage.cost` en dólares**.
    Ese coste es el que suma D8, así que no hay que calcularlo.

**Prueba de humo (2026-09-29)**, con un caso real de PRAX:

- **Entrada**: un mensaje en español («¿Qué tareas del sprint actual del
  rediseño del checkout siguen bloqueadas?») y tres proyectos candidatos.
- **Preguntas**: una `choice` de intención y tres `noul` de relevancia.
- **Resultado**: HTTP 200 en **0,41 s**, 559 tokens de entrada,
  **$0,0000235**. Acertó las cuatro:

| Pregunta | Respuesta |
|---|---|
| intención | `question`, confianza 1 |
| checkout | 0,99 |
| permisos | 0,09 |
| landing | 0,05 |

Es una prueba, no la calibración que pide D10: los umbrales se siguen
ajustando con 50 a 300 ejemplos propios antes de encenderlo.

---

## 6. Registro

- **2026-09-29** — Plan escrito. Cuatro investigaciones de solo lectura
  (backend y frontend de PRAX, chats, Jev) y la verificación del corte de 15 s.
  Nada de código tocado todavía.
- **2026-09-29** — Se cierran las tres preguntas de §5. La clave de OpenRouter
  queda en el `.env` y Jev responde (prueba de humo en §5).
  ⏸️ **Plan en pausa antes de F0**: el dueño del producto prioriza el coste de
  RAM de `praxis-api` en Railway (~90% de la factura), que puede acabar en
  juntar los microservicios en uno. Si se hace, el mapa de §1 cambia de sitio
  —servicios, rutas TCP—, pero no de fondo, y las decisiones siguen valiendo.
  Una sesión que retome esto **mira primero cómo quedó el backend**.
- **2026-09-29** — Backend en monolito ([PLAN-MONOLITO](PLAN-MONOLITO.md)).
  Lo que cambia para este plan:
  - Los servicios siguen siendo los mismos, con los mismos `@MessagePattern`,
    pero en producción se hablan en memoria. Las rutas `file:line` de §1 siguen
    valiendo.
  - **D3 sale más barato**: las consultas de PRAX a tasks, projects y reports
    no cruzan ya ninguna red.
  - **El turno por SSE (D7)** tiene que pasar un `Observable` de varios valores
    del servicio al gateway. El transporte en proceso lo admite, con una prueba
    que lo compara contra TCP.
  - **Toda tarea de fondo nueva** (por ejemplo, un resumen programado) tiene que
    respetar `enReposo()`, o el backend no vuelve a dormirse.
  - `proponer_grafico` y `ChartProposalCard` **siguen vivos y sin salida**: se
    quitan aquí, en F7 y F8.
- **2026-09-29 (noche)** — Sesión nocturna autónoma. El dueño del producto
  pidió trabajar sin preguntas y con todo en local; lo que el plan dejaba para
  discutir lo decide la sesión, anotado aquí.
  - **F0 cerrada.**
    - **El corte de 15 s**: el cliente de servidor acepta `plazoMs` por
      petición, y el turno y el borrador de plantilla usan `PRAX_TIMEOUT_MS`
      (120 s) hasta que F3 los pase a SSE.
    - **Tokens reales**: `gemini.client.ts` lee `usageMetadata` y escribe una
      línea `gemini_uso` por llamada (entrada, salida, razonamiento y caché).
      `GeminiReply.uso` queda listo para F4.
    - **`medir-prompt`** da los tokens reales con `:countTokens` si hay clave.
      Probado contra la API: 200.
  - **Hipótesis 1 descartada en producción.** La clave de Gemini de
    `praxis-api` responde 200.
  - 🔴 **La clave del `.env` local está muerta.** `GEMINI_API_KEY` de
    assistant-service devuelve **401** en `generateContent` y en `countTokens`.
    Es otra clave que la de producción (mismo formato `AQ.A…`, otro hash).
    **En local, PRAX no puede hablar con Gemini** hasta que el dueño ponga una
    clave de desarrollo. La de producción no se copia: su cuota es la de los
    usuarios reales. Las fases siguientes se prueban con Gemini simulado.
  - **Sin cifras de D8 todavía.** Salen de `gemini_uso` en cuanto esto llegue a
    producción, o de una clave local que funcione.
  - **F1 cerrada.** Las cinco fugas:
    - **O1**: la lista de proyectos que PRAX ofrece sin foco se filtra por la
      organización del turno, y un fallo deja `prax_sin_proyectos` en el log en
      vez de tragarse.
    - **O2**: `Conversation.organizationId`, con migración
      `20260929120000_conversacion_por_organizacion`. Listado y detalle se
      acotan a la activa. Continuar una de otra organización da 403
      `NOT_IN_ORG`.
    - **O3**: la ruta de proyecto compara la organización del proyecto con la
      activa que manda el cliente, y si no coinciden, 403 `NOT_IN_ORG`.
    - **O4**: `/assistant` pide solo los proyectos de la activa.
    - **O5**: `PraxScreen` pasa `organizacionActivaId`.
    - **Prueba**: e2e `20-prax-organizacion` (5 casos). No depende de Gemini:
      la conversación se crea antes de llamarlo y los 403 se deciden antes.
  - **Dos desvíos de D6, decididos esta noche:**
    - **Sin backfill en la migración.** Rellenar las viejas con la organización
      personal obligaba a una migración que cruzara al schema de billing, y los
      servicios no se tocan la base. Quedan con `''` (nunca `NULL`, trampa 20):
      salen en la organización **personal** y **adoptan** la del primer turno
      que reciban, igual que ya adoptaban proyecto.
    - **La comprobación de O3 solo corre si el cliente manda `organizationId`.**
      Así un cliente sin actualizar no se queda sin PRAX. El nuestro la manda
      siempre, desde `loadPrivateChrome()` (trampa 21).
  - **F2 cerrada.**
    - **Backend**: tabla `assistant_scopes` (`AssistantScope`), por persona y
      organización, y rutas `GET` y `PUT /me/assistant/scope`.
      - Al guardar, el gateway comprueba cada proyecto marcado: tiene que ser de
        la organización activa y visible con `canViewReports`, o 400.
      - Al leer, vuelve a cruzar lo guardado con lo visible **hoy**: a alguien
        le pueden sacar de un proyecto después de marcarlo.
    - **El turno sin foco** solo ofrece a PRAX los proyectos del alcance. Si
      leer el alcance falla, vale «todo» y se registra: PRAX con más contexto
      del elegido es mejor que PRAX mudo.
    - **Interfaz**: `RecursosMenu` sustituye al armazón de `localStorage`, con
      guardado optimista que vuelve atrás y explica si el servidor dice que no.
    - **Retirados**: el selector de modelo, el modo «Auto» y los servidores
      MCP, marcados «Pronto» y sin hacer nada.
    - **Pruebas**: e2e `21-prax-recursos` (6 casos) y una captura comprobada a
      ojo en local.
  - **Decidido esta noche, D5 matizado:** el proyecto **con foco cuenta
    siempre**, esté marcado o no. Se abrió a propósito; «Recursos» gobierna qué
    más puede consultar PRAX, y eso importa de verdad cuando existan las
    consultas (F3).
  - **F3 cerrada.**
    - **Consultas**: `consultar_tareas`, `consultar_tarea` y
      `consultar_analisis`, en `assistant/src/assistant/consultas.ts`.
      - Solo de lectura. Las ejecuta el servicio por el transporte en proceso.
      - Solo sobre proyectos del ámbito: con foco, ese; sin foco, los de
        «Recursos».
      - Nunca lanzan: un fallo vuelve al modelo como `{ error }`.
      - Filas con tope (`CONSULTA_MAX_TAREAS = 40`) y `omitidas`.
    - **Bucle**: como mucho 4 vueltas de consulta y 120k tokens de entrada
      acumulados. La última vuelta va sin consultas y con una nota.
    - **Turno por eventos**: Gemini va por `streamGenerateContent`.
      `chatEnVivo()` emite `inicio`, `paso`, `texto` y `fin`, y `chat()` es el
      mismo turno sin nadie escuchando: una sola implementación.
    - **Gateway**: `POST …/assistant/chat/stream` en los dos modos. SSE a mano
      (trampa 12), con latido de 15 s y soltando el turno si el navegador se
      va. Lo que falla antes de abrir el flujo sale como JSON.
    - **Frontend**: `commons/assistant/en-vivo.ts` lo pide por el proxy de
      siempre, que ya no corta los flujos. Pinta los pasos reales y el texto con
      cursor, y devuelve la misma `RespuestaChat` que la Server Action.
      `FlujoDePensamiento` deja de ser un reloj.
    - **Pruebas**: `assistant.turno.spec.ts` (el bucle), streaming en
      `gemini.client.spec.ts` y e2e `22-prax-en-vivo`.
    - **Gemini falso** para desarrollo: `e2e/fixtures/gemini-falso.mjs` con
      `GEMINI_BASE_URL`. Así se vio el bucle entero en el navegador: PRAX
      escribe, consulta y responde con el número real de tareas.
    - **Queda para F8**: el texto en vivo ya sale sin burbuja, pero el mensaje
      final todavía se pinta en la burbuja de antes. Las variantes muertas
      `panel` y `cajon` siguen ahí; se quitan con el rediseño.
  - **F4 cerrada.**
    - **La unidad**: `tokensPrax()` en `contracts/assistant` es la única
      función que convierte el uso de Gemini en tokens PRAX (entrada ×1, caché
      ×0,25, salida y razonamiento ×8), y la usan el servicio que cobra y la
      pantalla.
    - **El contador**: `AssistantUsage.tokens` es lo que se compara contra
      `iaTokensMensualesPorPersona`. `used` queda como estadística.
    - **Qué se cobra**: lo que costó el bucle entero. El turno de recuperación
      se registra en el uso del mensaje, pero no se cobra.
    - **Cifras por plan, provisionales** (decididas esta noche): los mensajes
      de antes × ~20 mil tokens PRAX, redondeados. Gratis 250 mil, Pro 1,5 M,
      Equipo 2 M, Negocio 6 M y Enterprise 20 M. Se recalibran con
      `gemini_uso` de producción en cuanto haya datos.
    - **D9**:
      - cada respuesta guarda su uso (`Message.uso`) y lo enseña debajo;
      - la conversación enseña su total y lo que queda del mes;
      - cuando el `contexto` del último turno pasa de 30 mil tokens, un aviso
        con «Empezar una nueva» sustituye esa línea.
    - **Planes**: el catálogo dice «Tokens PRAX / mes por persona» y explica
      qué son. `AmpliarPlan` y el 402 hablan de tokens.
    - **Prueba en la interfaz**: con el Gemini falso declarando 35 mil de
      entrada salieron «71 mil tokens PRAX · consultó 1 vez» y el aviso.
    - **Pendiente, a propósito:** el corte del historial a 12 mensajes todavía
      no se le dice al modelo (D9, segunda mitad). Va con F5, que es donde se
      decide qué contexto entra.
  - **F5 cerrada.**
    - **Qué decide**: solo si el turno lleva el **inventario de tareas**. Es
      lo único caro del briefing y, desde F3, lo único que PRAX puede pedir si
      le falta. Se quita cuando Jev dice «charla» con confianza ≥ 0,85; ante
      cualquier otra cosa, inventario entero.
    - **Dónde**: `assistant/src/assistant/router.ts` (`RouterDeContexto`). Un
      solo servicio con dos modos en vez de tres clases: el heurístico no tenía
      nada que extraer, porque hoy no omite nunca.
    - **I3**: el briefing sin inventario lleva `inventarioOmitido: true` y una
      regla del prompt le dice al modelo que no tiene las tareas delante y que
      las consulte. Las propuestas se siguen validando contra el briefing
      completo.
    - **I4**: `JEV_TIMEOUT_MS` (800) o cualquier fallo → decide el heurístico
      y el turno sigue. Se registra `prax_router_jev_fallo`.
    - **D9, segunda mitad**: cuando el hilo tiene más mensajes que los que se
      mandan, el prompt lleva una `NOTA SOBRE EL HILO` con los dos números.
    - 🔴 **La trampa del alias**: el modelo es **`~typesafe/jev-latest`, con
      tilde**. Sin ella, OpenRouter responde 400 «Model typesafe/jev-latest
      does not exist» y, por I4, **PRAX sigue funcionando como si nada**: el
      router cae al heurístico en cada turno y solo lo delata el log. Así
      estuvo el primer intento de calibración.
    - **Calibración** (8 mensajes en español, contra OpenRouter, 2026-09-29):
      8 de 8. «¡gracias!», «hola, ¿qué tal?» y «perfecto, muchas gracias por la
      ayuda» → charla 1,00; «vale» → charla 0,96; las dos preguntas →
      pregunta 1,00; «mueve «Revisar permisos» a Hecho» y «asígnale a Lucía las
      dos de revisión» → cambio 1,00. Latencia **170-380 ms**.
    - **Medida** (monolito local, Gemini falso, proyecto con 41 tareas): la
      instrucción pasa de **26 854 a 14 632 caracteres** en un turno de
      charla, un 45 % menos. En preguntas y cambios no cambia nada. El
      Gemini falso ahora escribe en su log el tamaño de cada instrucción.
    - **Lo que D10 pedía y queda fuera, a propósito**: la relevancia `noul`
      por proyecto y documento, y elegir qué consultas se declaran. Hoy el
      alcance tiene como mucho `ASSISTANT_SCOPE_MAX_PROJECTS` proyectos y
      ningún documento, así que no hay nada grande que filtrar: entra con F7,
      cuando los documentos lleguen al índice. El umbral de «~8k tokens» para
      preguntar a Jev tampoco hace falta: una decisión cuesta ~$0,00002.
    - **Sigue apagado** (`PRAX_ROUTER=heuristic`). Encenderlo en producción
      es poner `PRAX_ROUTER=jev` y `OPENROUTER_API_KEY` en Railway; lo decide
      el dueño, que además va a rotar la clave provisional.
  - **F6 cerrada.**
    - **Esquema**: `ChatMessage.origin` (enum `ChatMessageOrigin`, por defecto
      `USER`) y `originMeta` JSONB. Migración
      `20260929150000_chat_message_origin`, sin tocar filas: todo lo que ya
      había lo escribió una persona.
    - **Solo por TCP**: los dos `send` de `chat.controller.ts` lo aceptan en el
      payload; el gateway lo fija a `USER` en las dos rutas HTTP en vez de
      leerlo del cuerpo. El DTO además lo rechaza con 400, y hay e2e de las dos
      cosas (`15-chat`, «origen del mensaje»).
    - **Automatizaciones**: `ActionContext` lleva `rule: { id, name }` y
      «escribir en el chat» publica con `origin: AUTOMATION` y la regla y la
      tarea copiadas en `originMeta`. Unitaria en `direct-execution.spec.ts` y
      e2e en `17-automatizaciones`.
    - `CON_MENSAJE` los selecciona, así que salen en el listado, el hilo, la
      búsqueda y el aviso en vivo. `ChatMessage` del frontend los tiene como
      opcionales; pintarlos es F9.
    - ⚠️ **Lo que D16 necesita y F6 deja para F7**: cuando alguien acepta una
      propuesta de PRAX de mandar un mensaje, lo manda **el navegador** por la
      ruta HTTP de siempre, que fija `USER`. Para que salga como `ASSISTANT`
      hará falta un campo propio y acotado (algo como `praxConversationId`,
      comprobado contra las conversaciones de quien envía), nunca `origin` a
      pelo. Un `ASSISTANT` falso haría menos daño que un `AUTOMATION` falso
      —sigue siendo tu mensaje—, pero la regla es la misma.
  - **F7 cerrada.** Siete commits: `94b666a7`, `482acd4d`, `5d0f273b`, `2677f854`,
    `0b5b795b`, `c8cb6ffc` y el de automatizaciones.
    - **Catálogo** (`capabilities.ts`): una lista de qué se puede hacer, qué
      permiso pide y con qué propuesta. De ahí salen las declaraciones y un
      bloque del prompt con tres formas de línea: `PUEDES PROPONERLO`, `LO HACE A
      MANO en …` y `LE FALTA «…»`, con el nombre de la pantalla de roles.
      `proponer_grafico` fuera: su lienzo se archivó con `reports-front`.
    - **Lo visto en el turno.** Las consultas anotan en el ámbito lo que
      enseñan del foco —tareas, sprints, documentos, el catálogo de reglas—, y
      las propuestas se validan contra el briefing **más eso**. Los ids que no
      están en el briefing (sprints, documentos, reglas) solo valen si se
      consultaron en el mismo turno.
    - **Sprints**: `consultar_sprints`; crear, empezar (nunca con otro en
      curso) y repartir entre backlog y sprint (solo tareas del tablero del
      sprint). Estimar va en `proponer_edicion` (`puntos`). **Cerrar no se
      propone**: obliga a decidir tarea a tarea qué pasa con lo pendiente.
    - **Documentos**: `consultar_documentos`, `consultar_documento` (hasta 20
      mil caracteres, y dice si recorta), `proponer_documento` y
      `proponer_revision_documento`. La revisión la aplica **el editor**
      (`RevisionDePrax`), como una versión restaurada, porque el contenido
      solo entra por el tiempo real (E4). Solo sobre documentos leídos enteros
      en el turno y de hasta 12 mil caracteres; el techo de salida sube a 8192
      solo a quien puede proponerlo.
    - **Mensajes**: `praxConversationId` en el cuerpo del chat; el gateway
      (`OrigenDeMensajeService`) comprueba que la conversación es de quien
      envía y firma `ASSISTANT`. Ajena: 403. `proponer_mensaje_privado`, sin
      permiso de proyecto. `consultar_chat` **no se hizo**: el chat del equipo
      ya viaja en el contexto.
    - **Automatizaciones**: `consultar_automatizaciones` (solo con foco y con
      «Gestionar automatizaciones», I6), `proponer_automatizacion` —nace
      **pausada**, todo o nada contra el catálogo, con la frase «Cuando …,
      entonces …» escrita por el servicio— y `proponer_estado_automatizacion`.
    - 🔴 **La trampa de Gemini**: un `OBJECT` sin `properties` (o vacío) en una
      declaración hace que la API rechace la petición **entera**, y con ella el
      turno de todo el que tenga esa herramienta. La configuración de una regla
      viaja por eso como JSON en un `STRING`. Lo vigila una prueba en
      `capabilities.spec.ts` que recorre todas las declaraciones.
    - **Arreglos de paso**: la caché del listado del tablero ignoraba página y
      tope (**también en producción**; `5d0f273b` se puede llevar a `main`
      solo), las pruebas de integración de tasks sin `delByPrefix` en el doble,
      y el turno de recuperación que duplicaba tarjetas.
    - **Pruebas**: `capabilities.spec.ts`, el turno con lo visto y los sprints, y
      e2e `23-prax-capacidades` (7) con el Gemini falso, que ahora acepta
      directivas `#consulta` / `#propon`.
    - ⚠️ **Coste a vigilar**: a quien tiene todos los permisos se le declaran
      19 propuestas y 7 consultas, **~25 mil caracteres por vuelta** (unos 6-7
      mil tokens), más ~2 mil del catálogo. Un colaborador, ~9 mil. Es lo que
      pedía D10 con Jev eligiendo qué herramientas declarar; queda abierto.
  - **F9 cerrada** (`64678651`).
    - `AUTOMATION` se pinta como **divisor** centrado entre líneas punteadas:
      «⚡ Regla «X» · hora» y el texto que publicó. Era lo que vio el dueño del
      producto al probarlo: el aviso salía como una burbuja suya.
    - `ASSISTANT` lleva «con PRAX» en el pie de la burbuja, junto a la hora.
    - Los bloques del mismo autor se cortan por `CORTE_DE_BLOQUE_MS`: la
      constante estaba declarada y no la usaba nadie.
    - Fuera los 43 `text-white` del chat (hallazgo E4).
    - **Lo que no se cambió, a propósito**: la hora sigue **dentro de cada
      burbuja** y no en la cabecera, como en la referencia. Está así por los
      checks de lectura —cada mensaje dice su propio estado—, y el comentario
      de `MessageBubble` lo explica.
  - **F8 cerrada.**
    - **Paleta**: PRAX va bajo `data-tone="dark"`, la casi negra de la
      aplicación; el gris azulado de `:root` se quedó fuera, como pidió el
      dueño del producto (2026-09-29).
    - **Mensajes**: tú en burbuja `rounded-2xl` a la derecha; PRAX sin
      burbuja, con su icono y la etiqueta, a todo el ancho (`MensajeDePrax`,
      el mismo marco para el texto en vivo y el terminado). El texto en vivo
      sale **a ritmo constante** (`TextoEnVivo`: ~120 caracteres/s y nunca más
      de medio segundo de atraso), con cursor de bloque; sin animación con
      `prefers-reduced-motion`.
    - **Propuestas por familia**: crear, cambiar, mover, comunicar, analizar y
      destruir, cada una con su icono y su acento (`familiaDe`, en un contexto
      que pone `AssistantChat`, así que ninguna de las veinte tarjetas lo sabe).
      Cabecera «PROPUESTA · título», borde morado (rojo solo el borrado),
      entrada escalonada (`prax-entrada`) y, al aceptar, un borde que recorre
      de morado a verde (`prax-aceptada`, en `theme.css`). Debajo, la nota «con
      tus permisos, por el mismo botón que usarías tú».
    - **Adjuntos** (D17): el «+» ofrece Imagen, PDF y Texto, cada uno con su
      límite escrito. Fuera «Etiquetar proyecto» y «Etiquetar persona», que
      solo metían un `#` o un `@`. El selector de imagen **aceptaba GIF**, que
      PRAX no lee y el servidor rechaza. Los topes siguen escritos dos veces
      (`commons` no puede importar `contracts`), así que
      `web/src/lib/limites-de-prax.spec.ts` los compara leyendo el contrato.
    - Fuera las variantes muertas `panel` y `cajon`, y los `text-white` del
      chat de PRAX.
    - Verificado en el navegador contra el monolito local y el Gemini falso: la
      propuesta de mensaje se acepta, el borde pasa a verde y el mensaje aparece
      en el chat del proyecto con «con PRAX».
  - **F10 cerrada.**
    - **La mención**: `@[PRAX](assistant:prax)`, un `ChatRefKind` nuevo con id
      fijo —PRAX no es una cuenta—. El compositor la ofrece la primera al
      escribir `@` en el chat de un proyecto, y no en los privados.
    - 🔴 **El patrón de referencias exigía UUID**, y ampliarlo a `|prax` a secas
      dejaba pasar `(user:prax)`. Va con `(?<=assistant:)prax|(?<!assistant:)uuid`,
      en el frontend y en su espejo de `contracts`. Lo fija
      `web/src/lib/mencion-de-prax.spec.ts`, que encontró el fallo.
    - **Gateway**: `ProjectChatController.send` guarda el mensaje y, si es de
      una persona y menciona a PRAX, llama sin esperar a `PraxEnElChatService`.
      Este prepara el turno con la sesión de quien mencionó
      (`TurnoDeProyectoService`, extraído de `AssistantController` para que los
      dos caminos den exactamente el mismo contexto) y publica la respuesta
      citando el mensaje, como `ASSISTANT` con `originMeta.respuesta`. No lanza
      nunca: si falla, lo dice en el chat.
    - **Quién firma**: quien lo invocó —no hay cuenta de PRAX, y no debe
      haberla: tendría asiento y permisos propios—. La pantalla lo pinta como
      PRAX, «a petición de …», al otro lado y con su icono.
    - **Propuestas**: no salen en el chat. Se guardan en la conversación
      privada de quien preguntó, y la respuesta lleva «Ver N propuestas»
      (solo para esa persona; al resto, «N propuestas para …»).
    - Sin «Ver los reportes y usar el asistente», PRAX contesta en el chat qué
      permiso falta. Con la cuota agotada, lo dice.
