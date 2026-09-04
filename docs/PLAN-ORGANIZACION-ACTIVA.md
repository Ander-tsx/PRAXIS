# Plan de la Organización Activa — el contexto deja de elegirse en cada pantalla

> Etapa abierta el 2026-08-28. Continúa [PLAN-ORGANIZACIONES.md](frontend/PLAN-ORGANIZACIONES.md),
> que dejó la organización como dueña de los proyectos pero **no** como contexto
> de la aplicación. Se lee al retomar y se marca al terminar cada tarea.
>
> 📍 **Vive en `docs/` y no en `docs/frontend/`, a propósito.** Es el primer plan
> del repositorio que cambia el backend y el frontend a la vez, y con el mismo
> peso. Meterlo bajo `frontend/` haría que quien busque por qué cambió
> `planEfectivoDe` no lo encuentre nunca.
>
> ⚠️ **Esta etapa toca el backend, y CLAUDE.md dice que el backend es de otro
> equipo.** Es una excepción decidida por el dueño del producto el 2026-08-28:
> las tres reglas nuevas son de negocio, no de interfaz, y no se pueden aproximar
> desde el frontend sin mentir en la pantalla. Se implementan de punta a punta y
> se registran aquí.

---

## El encargo, en una línea

Que no exista «Todas las organizaciones». Que lo primero sea elegir una y que
todo lo que se haga después pertenezca a esa — sin volver a preguntarlo en
Suscripción, en Roles ni en ningún sitio.

---

## Por qué esto no es solo mover la barra lateral

Porque el modelo de abajo hoy dice lo contrario en dos sitios, y los dos con su
razón escrita por quien los hizo:

1. **El plan efectivo es de la persona, no de la organización.**
   `planEfectivoDe(userId)` mira **todas** tus organizaciones y aplica la mejor
   (`services/billing/src/organizations/organizations.service.ts:259`). Su
   comentario lo defiende: *«Si el plan dependiera de cuál está mirando, la misma
   acción se permitiría o se negaría según la pantalla, que no hay forma de
   explicar. Vale el mejor.»*

   Esa frase era cierta mientras la organización era una etiqueta. Deja de serlo
   cuando la organización **es** la pantalla: ahora sí hay forma de explicarlo,
   y es la única forma de que un plan de pago signifique algo.

2. **El tope de organizaciones está escrito y nunca se comprueba.**
   `organizacionesPropias` tiene valor en los cuatro planes
   (`commons/contracts/src/billing/plans.ts:238,257,276,295`), existe el mensaje
   de error (`QuotaKind.ORGANIZACIONES`) y **ningún código lo invoca**. Se
   verificó con un `grep` sobre todo `apps/`: solo aparecen el tipo y las
   constantes. Hoy cualquiera puede crear organizaciones sin límite.

Sin tocar esas dos, el túnel se puede pintar pero miente: la pantalla diría «Plan
gratuito» mientras el servidor concede BUSINESS, y el modelo de precios se
farmearía creando organizaciones gratis.

---

## Decisiones cerradas

Se cerraron en conversación el 2026-08-28. No se reabren sin un motivo nuevo.

### D1 — Siempre hay una organización activa, y no existe «Todas»

La cookie `praxis_org` deja de poder significar «todas». Sin elección previa se
resuelve a la **personal**, que todo el mundo tiene. La opción «Todas tus
organizaciones» desaparece del selector.

**Revoca** el comentario de `commons/theme/organizacion.ts:44`, que hoy dice que
`null` significa «todas» y que eso es lo que conserva el comportamiento anterior.
Ese comportamiento se retira a propósito.

### D2 — El plan vale solo dentro de la organización que lo paga

🔴 **Es la decisión central, y revoca «vale el mejor».** Pertenecer a una
organización con plan de pago te da sus beneficios **ahí dentro**, y solo ahí. En
tu organización personal gratuita sigues siendo gratuito, aunque trabajes en una
empresa con BUSINESS.

**Por qué:** es lo único que hace coherente el túnel. Si los topes te siguieran a
todas partes, la pantalla acotada a una organización enseñaría un número que el
servidor no respeta — y sería un número sobre dinero.

**Consecuencia técnica:** `planEfectivoDe` pasa a recibir `organizationId` y a
resolver la suscripción **de esa organización**, sin comparar con ninguna otra.

### D3 — Tres organizaciones por persona, la personal incluida, y el plan no influye

Tope plano: **3**. No depende del plan.

**Por qué el plan no influye, que fue la corrección del dueño del producto:** si
el plan vive dentro de una organización, que el plan contratado en una te
conceda crear más es una contradicción — el beneficio se estaría escapando de su
organización justo después de haber decidido que no puede. Cuántas
organizaciones puede crear alguien es una propiedad **de la persona**.

🔴 **`organizacionesPropias` se retira del catálogo de planes.** Deja de ser una
cuota y pasa a ser una constante. Es una cifra menos que explicar en la tabla de
precios.

**Y cierra el farmeo**, que es el motivo por el que existe: con D2, crear
organizaciones ya no multiplica ningún beneficio de pago, pero sí multiplicaría
las cuotas gratuitas (3 proyectos × N organizaciones). Tres es el techo.

### D4 — La personal no se borra, pero se renombra

Se crea sola, ocupa una de las tres, y no se puede eliminar — es donde caen los
proyectos de quien trabaja solo. Lo que sí se puede es cambiarle el nombre y el
resto de sus datos, como a cualquier otra.

### D5 — Los chats privados siguen siendo entre personas, y la puerta es la organización común

Una conversación privada no pertenece a ninguna organización y **no se acota por
el selector**: sois dos, y esconder una conversación con mensajes sin leer al
cambiar de organización es peor que cualquier incoherencia que evite.

Lo que sí cambia es **con quién se puede abrir una**: hoy la regla es «quien
comparta algún proyecto contigo»; pasa a ser **«quien comparta alguna
organización contigo»**.

**Por qué es más ancha y aun así correcta:** el asiento ya es la frontera del
producto (D2 de la etapa anterior — no hay invitados externos). Si estáis en la
misma organización, ya os podéis ver; exigir además un proyecto en común impide
escribirle a alguien de tu propio equipo al que todavía no has metido en nada.

### D6 — En un chat privado no se referencian tareas ni tableros

El menú `/` de tareas y tableros queda **exclusivamente en los chats de
proyecto**, donde una referencia tiene un proyecto que la explica.

**Por qué:** en una conversación privada, `/Sprint 1` no dice de qué proyecto
sale ni si la otra persona puede verlo. `MentionablesService` ya se sirve en las
dos rutas con el mismo código.

### D8 — A un proyecto solo se invita a gente de su organización

El buscador de «Invitar al proyecto» ofrece **los miembros de la organización
dueña del proyecto**, no el directorio de la plataforma. Y cuando quien se busca
no está, la pantalla ofrece **invitarlo a la organización**, que es el paso que
de verdad falta.

**Por qué:** ya era la regla del servidor —quien entra en un proyecto necesita
asiento, `403 NOT_IN_ORG`— y la pantalla la ignoraba. Buscaba en `GET
/users?search=`, así que la mitad de lo que ofrecía terminaba en un error
**después** de haber elegido a la persona, que es el peor momento para
enterarse.

Y de paso deja de ser una búsqueda contra el servidor: los miembros de una
organización caben en una respuesta, así que se filtran en el cliente y escribir
va afinando sin un viaje de red por tecla.

### D9 — La cuota de IA es por persona, por organización y por mes

Era `(persona, mes)`. Pasa a ser `(persona, organización, mes)`.

**Por qué no había alternativa:** con D2, el tope lo pone el plan de la
organización en la que se trabaja. Un contador único no se puede aplicar contra
topes distintos — quien gastara 50 mensajes en la BUSINESS del trabajo entraría
en su espacio personal, tope 13, ya por encima del límite y bloqueado desde el
primer mensaje sin nada que lo explicara.

**Y es lo que hacen los demás.** Los productos que cobran por espacio de trabajo
acotan los créditos de IA **al espacio**, no a la persona a través de todos sus
espacios. Un asiento en una organización trae la cuota de esa organización.

⚠️ **Sí, eso multiplica la cuota gratuita por el número de organizaciones.** Es la
misma consecuencia que aceptan ellos, y lo que la acota es D3, no este número: un
FREE con las tres que puede tener llega a 39 mensajes al mes, no a infinitos.

⚠️ **Y la organización de un turno sin proyecto se elige, se valida y no se
cree.** `POST /me/assistant/chat` acepta `organizationId`; el gateway comprueba
la pertenencia antes de usarlo (`QuotaService.organizacionElegida`) y responde
403 `NOT_IN_ORG` si no es tuya. Sin el campo, la personal. En la ruta de proyecto
**no se manda**: allí sale del propio proyecto, que es lo que no se puede
falsificar.

### D7 — Avisos y Administración quedan fuera del túnel

- **Avisos** (`/me/notifications`): la insignia sigue contando **todo**. Acotarla
  significaría o mentir en el número o esconder avisos de las demás. Cada fila
  dice de qué organización viene.
- **Administración** (`/admin/*`): es el papel de **plataforma**, por encima de
  todas las organizaciones. Meterlo dentro del túnel sería mentir sobre lo que
  es.

---

## Invariantes — lo que esta etapa NO puede romper

Se comprobaron en el código antes de abrir el plan. Cada una tiene su sitio
exacto, porque todas son de las que no dan error al romperse.

### I1 — 🔴 La organización activa es un filtro, jamás un permiso

`services/projects/src/projects/projects.service.ts:170-178`:

```ts
where.OR = [{ ownerId: dto.userId }, memberScope];   // dueño o miembro
if (dto.organizationId) where.organizationId = dto.organizationId;  // se SUMA
```

`AND`, no `OR`. Es lo que hace que escribir la organización de otro en la cookie
devuelva **cero proyectos** y no los suyos.

⚠️ **Y de aquí sale la regla más importante de toda la etapa:** ninguna decisión
de servidor —cuota, permiso, pertenencia— puede leer la cookie. El servidor
deriva la organización **del recurso** (el proyecto tiene la suya) o de un
`organizationId` explícito en el cuerpo que **valida** antes de usar, exactamente
como hace ya `resolverOrganizacionParaProyecto`. La cookie solo acota lo que la
pantalla enseña.

### I2 — El conteo de cuota sigue siendo por organización

`exigirProyecto(userId, organizationId)` cuenta los proyectos **de esa
organización**. Eso ya es correcto y no se toca. Lo que cambia (D2) es de dónde
sale el **tope** contra el que se cuenta.

### I3 — El plan lo concede el webhook de Stripe, jamás la vuelta del navegador

La `success_url` la puede escribir cualquiera. No se toca nada de esto.

### I4 — Contratar exige ser el dueño, no `canManageBilling`

`gateway/src/billing/billing.controller.ts:224` (`organizacionPropia`). Un ADMIN
invita y quita gente, pero no compromete la tarjeta de nadie.

⚠️ **Hay un estado real que hoy no está diseñado y el túnel lo destapa:**
*«administras esta organización pero no puedes contratar, porque no la creaste
tú.»* Antes se escondía tras la pregunta «¿en qué organización?»; dentro del
túnel hay que dibujarlo.

### I5 — El portal de Stripe es de la persona, no de la organización

`billing.controller.ts:205` → `cliente(req.user.userId)`. **Un cliente de Stripe
por persona.** Quien tenga dos suscripciones verá las dos en un solo portal.

No es un riesgo —todo lo de dentro es suyo— pero un botón que diga «gestiona la
suscripción de este equipo» mentiría. Ver los puntos abiertos.

---

## Lo que cambia, por capas

### Backend

| # | Qué | Dónde |
|---|---|---|
| B1 | `planEfectivoDe(userId)` → `planEfectivoDe(userId, organizationId)`. Resuelve la suscripción de **esa** organización, sin comparar | `services/billing/.../organizations.service.ts:259` |
| B2 | `billing_plan_of` acepta `organizationId` | `services/billing/.../organizations.controller.ts:27` |
| B3 | `QuotaService.planDe` propaga la organización. Cada llamante ya la tiene o la deriva del recurso — **nunca de la cookie** (I1) | `gateway/src/billing/quota.service.ts:83,182,401,418` |
| B4 | `GET /me/billing/resumen` pasa a hablar de la organización activa, recibida como query validada | `gateway/src/billing/billing.controller.ts:96` |
| B5 | Tope de 3 organizaciones por persona, aplicado en `POST /me/organizations`. Reutiliza `QuotaKind.ORGANIZACIONES`, que ya tiene mensaje | `gateway/src/billing/organizations.controller.ts:90` |
| B6 | `organizacionesPropias` fuera del catálogo de planes; pasa a constante | `commons/contracts/src/billing/plans.ts` |
| B7 | La regla del chat privado pasa de «compartís proyecto» a «compartís organización» | `services/projects/.../ChannelsService.directo()` |
| B8 | `GET /me/chats/contacts` deja de derivarse de proyectos comunes | `gateway/src/projects/direct-chat.controller.ts:110` |
| B9 | `GET /me/chats/:peerId/mentionables` devuelve `refs: []` | `gateway/src/projects/direct-chat.controller.ts:135` |

⚠️ **B7 tiene una trampa de arquitectura.** `projects-service` no sabe nada de
asientos: la membresía de organización vive en `billing-service`, y los dos no se
hablan a propósito. El gateway es el único que habla con ambos
(`MentionablesService` lo dice explícitamente). La resolución de «qué
organizaciones compartimos» **se compone en el gateway** y baja ya resuelta. No
se añade una dependencia entre microservicios que hoy no existe.

### Frontend

| # | Qué | Dónde |
|---|---|---|
| F1 | La organización activa nunca es `null`. Repliegue a la personal si la cookie apunta a una que ya no es tuya | `commons/theme/organizacion.ts` |
| F2 | Fuera «Todas tus organizaciones» del selector | `commons/organisms/AppLayout/AppShell.tsx:591` |
| F3 | El grupo «Gestión» deja de redirigir-a-elegir: entra directo con la activa | `dashboard-front/.../roles/page.tsx` y hermanas |
| F4 | Facturación acotada a la activa, con el estado de I4 dibujado | `dashboard-front/.../billing/page.tsx` |
| F5 | Sin menú `/` en los chats privados | `chat-front` |
| F6 | `/dashboard/organizations` baja de destino a pantalla de administración | `dashboard-front/.../organizations/` |
| F7 | La insignia de Avisos sigue global; cada fila nombra su organización | `commons/organisms/AppLayout` |

⚠️ **F1 es barata y va primero.** La barra lateral ya pide la lista de
organizaciones en cada carga de cada zona (`loadPrivateChrome` →
`organizacionesDe`, cacheado en Redis). El repliegue se resuelve ahí, en un solo
sitio, sin una llamada más.

---

## Los stacks, en orden

Cada uno termina con una prueba manual desde el frontend antes de pasar al
siguiente. La regresión completa (`pnpm e2e:regresion`) no se corre hasta C7.

| Stack | Qué | Estado |
|---|---|---|
| C1 | **F1** — la activa nunca es nula, con repliegue. Sola no rompe nada y todo lo demás cuelga de ella | ✅ |
| C2 | **B1+B2+B3+D9** — el plan pasa a ser de la organización, y la cuota de IA con él | ✅ |
| C3 | **B5+B6** — el tope de 3, y `organizacionesPropias` fuera del catálogo | ✅ |
| C4 | **F2+F3+F6** — muere «Todas», y la barra lateral deja de preguntar | ✅ |
| C5 | **B4+F4** — facturación dentro del túnel, con el estado de I4 y el aviso de I5 | ✅ |
| C6 | **B7+B8+B9+F5** — los chats: organización común como puerta, y sin referencias en privado | ✅ |
| C7 | **D8** — invitar a un proyecto ofrece la organización, no la plataforma | ✅ |
| C8 | Documentación: contrato, pendientes, `CLAUDE.md` y este plan | ✅ |
| C9 | **Regresión entera** (`pnpm e2e:regresion`) | ✅ 2026-09-03: **243/243**, ver Registro |
| C10 | Repaso visual del túnel — **solo oscuro**: el modo claro se retiró en `2aae679` (`getTheme()` fijo a `'dark'`, cookie y `ThemeToggle` dormidos), fuera de esta etapa. El repaso en claro ya no aplica | ⬜ |

### Lo que sí se ha comprobado, y lo que no

✅ **Compila entero**: los 4 servicios tocados (gateway, billing, projects,
assistant) y las 8 zonas, con `tsc --noEmit`.

✅ **Las unitarias, verdes**: 16 tareas, ninguna en rojo.

✅ **La regresión de punta a punta se corrió el 2026-09-03: 243 de 243 en
verde**, al abrir la etapa de la fusión de zonas. Estuvo pendiente por decisión
del dueño del producto —son lentas y correrlas entre iteraciones se hace
eterno—, así que llegó dos tandas de cambios más tarde.

⚠️ **Los rojos que este párrafo daba por seguros no aparecieron**, y conviene
saber por qué: las pruebas que afirmaban la regla vieja —el chat privado con
proyecto en común, los topes conservados fuera de la organización— se habían
reescrito dentro de la propia etapa, según se iban cambiando. El único rojo fue
de una prueba que se quedó atrás de una mejora de accesibilidad (`role="tab"`),
y está anotado en [PLAN-FUSION-ZONAS.md](PLAN-FUSION-ZONAS.md).

⚠️ **C2 va a poner en rojo pruebas que hoy están verdes, y eso es lo correcto:**
las que afirman que un miembro de una organización de pago tiene sus topes fuera
de ella comprobaban la regla vieja. Se reescriben, no se silencian.

---

## Registro

| Fecha | Stack | Commit | Qué entró |
|---|---|---|---|
| 2026-08-28 | C1–C8 | `533a30a`…y sucesivos en `feature/enterprise-cuotas` | La etapa entera menos la regresión: el plan por organización, la cuota de IA con su migración, el tope de tres, el túnel del sidebar, la facturación acotada, los chats por organización y la invitación a proyecto. Ya commiteado — la nota «sin commitear» de la primera versión de este registro quedó obsoleta |
| 2026-08-31 | (fuera de esta etapa, en la misma rama) | `782e0af`…`913bd3d` | Q1–Q5 de `PLAN-CUOTAS.md`, un rediseño visual grande (Facturación, Administración, insignias, retirada del modo claro) y la actualización de las pruebas de UI al rediseño. `main` sigue en `6a549ac`; los 32 commits de encima viven solo en `feature/enterprise-cuotas`, sin fusionar |
| 2026-08-31 | — | — | Recuperados `credentials-service` y `tasks-service`, caídos desde antes de esta sesión (puertos 3001/3004 sin escuchar, procesos `nest --watch` vivos pero en bucle — el `MODULE_NOT_FOUND` que documenta CLAUDE.md). Parados, `dist/` limpiado, Prisma regenerado y arrancados en frío; el resto del stack no se tocó. `pnpm e2e:regresion` (C9) lanzada a continuación |

---

## Puntos abiertos

Se anotan para no descubrirlos a mitad de camino. Ninguno bloquea C1.

1. ✅ **Resuelto en D9.** `POST /me/assistant/chat` acepta `organizationId`, el
   gateway valida la pertenencia antes de usarlo y sin él cae en la personal. El
   contador pasó a `(persona, organización, mes)` con su migración
   (`20260828100000_consumo_por_organizacion`).

2. ⚠️ **El portal de Stripe (I5) necesita un `organizationId`.** Mientras no lo
   tenga, el botón dice «Gestionar mis suscripciones» y avisa de que el portal
   las reúne todas. La petición al backend es nuestra ahora, así que puede
   entrar en C5 o quedarse para después.

3. ⚠️ **El tope de 3 es plano y a un cliente ENTERPRISE con filiales se le va a
   quedar corto.** Es una consecuencia aceptada de D3, y se levanta cambiando una
   constante. Se anota para que no se descubra como avería.

4. ⚠️ **`GET /me/billing/resumen` devuelve hoy `organizaciones[]` para que la
   pantalla pregunte «¿en cuál?».** Dentro del túnel esa lista deja de servir
   para eso, pero sigue haciendo falta para el selector. No se retira sin mirar
   quién más la consume.

5. ⚠️ **La fila de un aviso todavía no dice de qué organización viene.** D7 dejó
   la insignia contando todo, que es lo decidido, pero para poder nombrar la
   organización en cada fila haría falta que `Notification` la llevara — hoy no
   la tiene. No es un fallo: es la mitad de D7 que no se ha construido.

6. ⚠️ **El consumo de IA que ya existía se quedó como «sin organización».** La
   migración pone cadena vacía en las filas viejas. No se reparten porque no hay
   forma de saber dónde se gastaron, y repartirlas a ojo falsearía el histórico —
   que es justo lo que esa tabla existe para conservar. Consecuencia práctica: el
   mes en curso arranca de cero en cada organización la primera vez.

7. ⚠️ **`GET /me/chats/contacts` hace una llamada por organización.** Con el tope
   de tres propias más las invitadas es poco, y `billing_orgs_of` está cacheado
   en Redis, pero si alguien acaba en veinte organizaciones esto se nota. El
   arreglo, si llega el caso, es un comando `billing_org_peers` que resuelva la
   unión en billing-service de una vez.
