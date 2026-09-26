# Plan — PRAX agéntico, y un modelo barato de decisión delante del real

> Etapa **por empezar**. Nace de un encargo dictado el 2026-09-25, sin
> investigación previa de código más allá del diagnóstico de abajo (hecho esa
> misma sesión, en frío). Se lee entero al retomar; nada de esto está decidido
> todavía — es el punto de partida para decidirlo.

## El encargo, en dos frases

1. PRAX está roto desde la migración a organizaciones: no responde. Arreglarlo.
2. Explorar dos cosas nuevas para PRAX, con su propia sesión: volverlo
   **agéntico**, y meter delante del modelo real un modelo barato de
   **decisión** —el usuario lo llama «jev»— que elija qué contenido vale la
   pena mandarle, para no pagar contexto de más en cada turno.

Lo de abajo separa las dos: el bug es concreto y tiene evidencia; lo agéntico
y «jev» son una propuesta que hay que investigar y decidir, no algo que ya
esté empezado.

---

## 1. «PRAX no responde» — diagnóstico en frío, sin reproducir

Investigado por un agente de solo lectura el 2026-09-25, sobre el estado
actual de `main`/`feature/scrum-kanban`. **No se reprodujo el fallo** —no hay
acceso a la cuenta ni a la organización del usuario que lo reportó—, así que
esto es lectura de código, no una causa confirmada.

### Lo que se comprobó que YA está bien (no es aquí)

El camino organización → cuota → chat está más blindado de lo que el encargo
asume. La mayor parte parece resuelta por una auditoría anterior
(`2d4d1a51 fix(front): los 27 hallazgos de la auditoría de organización, chat
y móvil`), posterior a `533a30aa feat(organizaciones)` y anterior a la fusión
de zonas:

- Frontend: `AssistantChat.tsx:772-790` llama a `preguntarAction(projectId,
  texto, conversationId, attachmentIds)` — **sin** `organizationId` explícito
  a propósito.
- `commons/assistant/actions.ts:196-231` (`preguntarAction`) resuelve el
  `organizationId` él mismo con `loadPrivateChrome().organizacionActivaId`
  (línea 218) — **no** la cookie `praxis_org` en crudo. Es exactamente lo que
  pide la trampa #21 de `CLAUDE.md`, y ya está así.
- Gateway, modo sin proyecto: `MyAssistantController.chat`
  (`apps/backend/gateway/src/assistant/my-assistant.controller.ts:138-184`)
  llama a `QuotaService.organizacionElegida(userId, body.organizationId)`
  (línea 146) antes de nada, y da 403 `NOT_IN_ORG` si no cuadra. Modo con
  proyecto: `AssistantController.chat`
  (`.../assistant.controller.ts:145-191`) saca la organización **del
  proyecto** (`organizacionDelProyecto`), nunca de lo que mande el cliente.
- `QuotaService.organizacionElegida`/`planDe`
  (`apps/backend/gateway/src/billing/quota.service.ts:111-136, 234-263`)
  degradan a FREE si billing-service no contesta — no hay un 502 mudo por ahí.
- `AssistantUsage`
  (`apps/backend/services/assistant/src/assistant/quota.service.ts:75-152`)
  usa `organizationId ?? ''` (cadena vacía, nunca `NULL`), como pide la
  trampa #20.
- La organización personal: `personalDe()`
  (`apps/backend/services/billing/.../organizations.service.ts:166-232`) crea
  al dueño como `OrganizationMember` **activo** en la misma transacción —
  descarta la hipótesis más obvia («el dueño no es miembro de su propia
  organización personal»).
- Frontend, manejo de error: `AssistantChat.tsx:759-838` envuelve
  `preguntarAction` en `try/catch`, siempre repone `pendiente` a `false`, y
  pinta el fallo **dentro del hilo** como una burbuja de PRAX degradada con
  botón de reintentar; un 402 de cuota agotada apaga el reintento y enseña
  `AmpliarPlan`. **No es un spinner que gira para siempre** — si el usuario
  ve exactamente eso, es una pista de que el fallo está más abajo de lo que
  parece (ver hipótesis 1).

### Lo que no se pudo descartar por lectura sola

No hay una causa única confirmada. Tres candidatas, en el orden en que
conviene mirarlas:

1. **Gemini falla, y lo que se ve es la burbuja degradada, no «no responde».**
   `gemini.client.ts` (`GeminiError`, líneas 190-307) reintenta y muestra un
   mensaje, pero si la clave, la cuota de Gemini o el esquema de alguna
   herramienta nueva en `tools.ts` está roto, **todo turno da ese error** — y
   alguien no técnico lo describe como «no responde» aunque técnicamente sí
   contestó, con una tarjeta de error.
2. **Caché de permisos de organización con TTL, sin invalidar al mover a
   alguien de organización.** Si el usuario reportado fue movido durante la
   migración, una entrada vieja en Redis podría dar un 403 inesperado — que
   **sí se enseña**, pero puede leerse como «roto» en vez de «sin permiso».
3. **Un proyecto con `organizationId` nulo** (de antes de la migración, sin
   completar). `organizacionDelProyecto` devolvería `null` →
   `planDe` cae al FREE más estrecho → la cuota mensual se agota casi al
   primer mensaje del día → `AmpliarPlan`, que también puede leerse como
   «PRAX dejó de responder».

### Qué mirar primero, antes de tocar nada

1. **Reproducir con la cuenta/organización real** y anotar literalmente qué
   pinta `AssistantChat` — ¿burbuja degradada con texto?, ¿`AmpliarPlan`?,
   ¿de verdad nada, ni spinner ni error? Cada una apunta a un sitio distinto.
2. Logs del gateway en `assistant/chat` alrededor de la hora del reporte:
   código de estado, y los `error`/`warn` de `QuotaService`
   («billing-service no contestó» es el que delata la hipótesis 2).
3. Confirmar que el proyecto afectado tiene `organizationId` no nulo.
4. Confirmar que la clave/cuota de Gemini no cambió junto con los commits de
   la migración de organizaciones (coincidencia de fecha, no necesariamente
   de causa).

---

## 2. La idea: un modelo barato de decisión delante del modelo real

### Lo que propone el usuario

Un modelo nuevo —lo nombra «jev»— **barato, que no genera texto/código**:
se le da una entrada y una lista de opciones, y devuelve una probabilidad por
opción de cuál es la mejor. La idea: usarlo como **triaje** antes de llamar a
Gemini — dado el mensaje del usuario, que «jev» elija **qué contenido leer y
mandar** (qué documentos, qué parte del inventario de tareas, qué adjuntos,
qué tramo del historial) en vez de mandarlo todo o mandarlo a ojo, para gastar
menos contexto —y menos dinero— en cada turno real.

⚠️ **No se ha verificado qué modelo es «jev» en concreto.** El nombre puede
ser una forma abreviada u oral de otra cosa. Antes de escribir una sola línea
de integración, una sesión nueva tiene que confirmar con el usuario: proveedor,
nombre real del modelo/API, precio, límites de la entrada (¿cuántas opciones
admite?, ¿cuánto texto de contexto por opción?), y si ya existe una cuenta o
hay que darla de alta. Nada de esto se inventa aquí.

### Mi opinión, con matices

**Es una idea sólida y el patrón tiene nombre: un enrutador/triaje barato
delante del modelo caro es una técnica real y usada** (a veces llamada
"LLM routing" o "context selection"), no una ocurrencia. Dicho eso, tres
cosas antes de darlo por bueno para PRAX en concreto:

1. **PRAX ya hace algo parecido, a mano y gratis.** `INVENTARIO_MAX_CHARS`,
   `ASSISTANT_EXTRACT_BUDGET_CHARS` y `ASSISTANT_PDF_MAX_INLINE_PAGES`
   (`CLAUDE.md`, tabla de topes; `ESTADO-ACTUAL.md` §43) ya recortan lo que
   se manda, con reglas fijas y sin coste de una llamada extra. La pregunta
   que hay que contestar **con números** —`medir-prompt` ya existe para
   esto— es: ¿cuánto del prompt actual es "de más" y un router *inteligente*
   de verdad lo recortaría, frente a lo que ya recorta el tope fijo? Si la
   respuesta es «poco», el ahorro no paga la complejidad.
2. **Una llamada de triaje añade una llamada de latencia**, siempre, antes de
   la respuesta real — incluso siendo barata y rápida, PRAX pasa de "un salto
   de red" a "dos, en serie" en cada turno. Con SSE y los avisos que ya
   explica `CLAUDE.md` (los latidos de 25s, el `AssistantController` que
   nunca debe quedarse mudo), esto hay que medirlo, no asumir que "barato" es
   "gratis en tiempo".
3. **Mantener dos prompts** (el de triaje: mensaje + opciones + qué pesa cada
   una; el real: lo que "jev" decidió incluir) es superficie nueva de reglas
   que hay que sincronizar. `CLAUDE.md` ya avisa de esto con las reglas de
   `ambito` que se filtran por modo (§ "Se puede hablar con PRAX sin
   proyecto..."): duplicar listas es garantizar que un día diverjan.

**Recomendación:** vale la pena probarlo, pero como un experimento medido, no
como un rediseño de la tubería completa. Primer paso barato antes de integrar
nada: correr `medir-prompt` sobre unas cuantas conversaciones reales de hoy y
ver cuánto del prompt es contenido que un router habría descartado. Si el
número es grande, el triaje se justifica solo; si es pequeño, puede que el
ajuste fino de los topes fijos actuales rinda casi lo mismo por una fracción
del trabajo.

### Dónde encajaría, si se hace

El punto de inserción natural es **antes** de construir el prompt final en
`assistant-service`, en el mismo sitio donde hoy se aplican los tres topes
fijos — ver `tasks/stats.service.ts` (inventario) y el ensamblado del
briefing que describe `ESTADO-ACTUAL.md` §26.1/§42. El triaje decidiría, por
mensaje entrante:

- Si hace falta el inventario completo de tareas, un subconjunto, o nada.
- Qué documentos vinculados al proyecto (`PLAN-DOCUMENTOS.md`) son relevantes
  para esta pregunta, en vez de mandar los vínculos de la tarea a ciegas.
- Qué tramo del historial de la conversación importa (relevante si algún día
  las conversaciones son largas y no todo el hilo hace falta cada vez).

Y **tendría que respetar los recortes mudos ya prohibidos**: si "jev" excluye
algo, PRAX tiene que poder decir «no miré X» igual que hoy dice
`tareasOmitidas` — un recorte inteligente que no se explica es el mismo
defecto que un recorte fijo que no se explica.

### «Agéntico», y la regla que no se puede romper sin decidirlo primero

`CLAUDE.md` es explícito: **«El asistente propone; nunca ejecuta»** —
devuelve parámetros para funciones que ya existen, y quien las llama es el
frontend, una a una, con la sesión de quien acepta. Esto es una regla dura de
este repositorio, no un detalle de implementación.

"Volver agéntico" a PRAX puede significar cosas muy distintas, y antes de
escribir código hay que decidir **cuál**:

- **Razonamiento en varios pasos, con herramientas de solo lectura** (mirar
  el tablero, mirar un documento, mirar el historial de análisis antes de
  responder) — esto **no** choca con la regla de arriba: sigue sin ejecutar
  nada por su cuenta, solo piensa en más de un paso antes de proponer.
- **Encadenar propuestas** (proponer una automatización que, si se acepta,
  dispara otra propuesta relacionada) — tampoco choca, si cada paso sigue
  pidiendo aceptación explícita.
- **Ejecutar una acción sin que nadie la confirme antes** — esto **sí**
  choca de frente con la regla actual, y no se puede colar como efecto
  secundario de «hacerlo agéntico»: si el encargo de verdad es este, hace
  falta una decisión explícita y documentada que reemplace la regla de
  `CLAUDE.md`, no una migración silenciosa.

Una sesión que retome esto tiene que preguntar, con esas tres opciones
delante, cuál de las tres quiere el usuario — probablemente la primera o la
segunda, dado lo que ya dice el resto del documento sobre PRAX.

---

## Qué necesita una sesión nueva para empezar

1. Confirmar con el usuario qué es «jev» en concreto (proveedor, nombre real,
   precio, forma de la API) — no se inventa ni se asume.
2. Reproducir el bug de arriba con una cuenta real y anotar qué pantalla
   sale, siguiendo el orden de la sección 1.
3. Correr `medir-prompt` sobre conversaciones reales para tener un número de
   cuánto contexto es candidato a recortarse antes de diseñar nada.
4. Decidir, con el usuario, cuál de las tres lecturas de «agéntico» de arriba
   es la que se pide.

Nada de esto se ha tocado en código todavía — es intencional, el encargo fue
«dime qué opinas y documéntalo», no «impleméntalo».
