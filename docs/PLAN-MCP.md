# Plan MCP — Praxis como servidor, para el agente que el usuario ya usa

> Etapa **por empezar** (plan redactado el 2026-09-30, sin una línea de código).
> Sale de [PRAX-MCP-SEGUNDA-ITERACION](PRAX-MCP-SEGUNDA-ITERACION.md), que planteó
> la dirección A (Praxis servidor) y dejó sin decidir qué poderes tiene. Este plan
> **decide**, y por eso lo sustituye en esa dirección. La dirección B (PRAX como
> cliente MCP) **no se toca aquí** y sigue en aquella nota.
>
> 📍 Vive en `docs/` y no en `docs/frontend/`: **toca el backend** (emisor de
> tokens, una ruta nueva en el gateway) además de una pantalla de ajustes. Igual
> que [PLAN-ORGANIZACION-ACTIVA](PLAN-ORGANIZACION-ACTIVA.md), es una excepción
> al «solo frontend» y **hay que acordarla con quien lleva el backend** antes de
> empezar M1.

---

## El encargo, en una frase

> Que todo lo que una persona puede hacer desde la interfaz de Praxis lo pueda
> hacer **su propio agente de IA** —el Claude, el ChatGPT o el Cursor que ya usa
> cada día— conectado por MCP, con lectura, escritura e incluso borrado.

El ejemplo que lo motiva: *«vacíame este backlog que tengo en un .docx en un
proyecto nuevo, con este espacio y este tablero, y ponles fechas, puntos, etc.»*.
El agente lee el documento, razona y llama a Praxis. **Praxis no pone el modelo,
no paga los tokens y no decide nada de lo que el agente hace.**

---

## Qué NO es esto

⚠️ **PRAX y el MCP son dos cosas distintas y no se mezclan.**

| | **PRAX** | **MCP** |
|---|---|---|
| Qué es | Un ayudante **dentro** de la interfaz, opcional | Una puerta para que **el agente del usuario** entre a Praxis |
| Quién razona | Nuestro modelo (Gemini / gpt-oss), a nuestro coste | El modelo del usuario, a su coste |
| Poder sobre los datos | **Propone; nunca ejecuta** | El que el usuario le dé: leer, escribir, borrar |
| Quién responde de lo que hace | Nosotros: es producto nuestro | **El usuario**: él le dio el token y los permisos |
| Reglas que lo gobiernan | D1–D17 de PLAN-PRAX-SEMIAGENTICO | Este plan |

Consecuencia directa, y la base de todo lo que sigue: **«el asistente propone;
nunca ejecuta» es una regla de PRAX, no una regla de la API.** Un agente externo
con el token del usuario *es* el usuario usando su propia herramienta, igual que
un script con `curl`. No se le aplica el invariante de PRAX, ni se le inventa uno
equivalente.

🚫 Tampoco se marca en el producto que algo «vino del MCP»: ni
`ChatMessage.origin`, ni insignias, ni un campo nuevo en las tareas. Una acción
hecha por token MCP es una acción de esa persona, y se ve como tal. El único
rastro que se guarda es el técnico de la seguridad —cuándo se usó cada token por
última vez (M3)— y no se enseña en las pantallas de negocio.

---

## Qué hay ya, medido en el código

Comprobado antes de diseñar; cambia el planteamiento.

- **El gateway expone ~224 rutas REST** con permisos, cuotas, asientos y
  validación ya aplicados. Un servidor MCP es **un cliente más** de eso: no hay
  que reescribir ninguna regla.
- **Todos los controladores usan `JwtGuard`** (`gateway/src/auth/jwt.guard.ts`),
  casi siempre con `ProjectPermissionGuard` detrás. `JwtGuard` exige un JWT HS256
  con `typ: 'access'` y saca `userId` del `sub`.
- **El limitador por cuenta** (`IdentityThrottlerGuard`) también verifica ese JWT
  para sacar el `sub`. Dos sitios dependen de la forma del token de acceso.
- **Hoy no existe nada parecido a un token de larga vida.** El de acceso dura
  15 minutos; el de refresco, 7 días, y `JwtGuard` lo rechaza a propósito.
- **No hay servidor OAuth.** La sesión es la cookie `praxis_session` del
  navegador.
- **La organización activa es una cookie** (`praxis_org`) que no existe fuera del
  navegador (trampa 20 y 21 de CLAUDE.md: nunca se confía en ella).
- **`capabilities.ts`** (assistant-service) es una lista de funciones con su
  permiso, pensada para PRAX. Sirve de **inventario de partida**, no de fuente:
  PRAX propone y el MCP ejecuta, así que no declaran lo mismo (M6).

---

## Decisiones

**M1 — Praxis se publica como servidor MCP por «Streamable HTTP», como una ruta
más del gateway.** No es un servicio nuevo ni un proceso nuevo: en el monolito
([PLAN-MONOLITO](PLAN-MONOLITO.md)) un servicio más cuesta RAM y un sitio más que
registrar (`SERVICIOS`, `SCHEMAS`, `migrar.sh`). Ruta tentativa: `POST /api/mcp`.

**M2 — El MCP tiene los poderes del usuario, sin un invariante propio.** Lectura,
escritura y borrado, con los mismos permisos de proyecto y de organización que
tendría en la interfaz. Si la API lo deja hacer, el MCP lo deja hacer. Lo que el
usuario no puede hacer a mano, su agente tampoco.

**M3 — El token es un token personal de acceso (PAT), atado a una organización y
con alcances.** Se crea en Ajustes, se muestra **una sola vez**, se guarda solo su
hash y se revoca desde la misma pantalla. Lleva:
- `userId` de quien lo crea;
- **una `organizationId`** elegida al crearlo y validada con la pertenencia
  (mismo patrón que `QuotaService.organizacionElegida`, 403 `NOT_IN_ORG`). Nunca
  de una cookie;
- alcances `read`, `write` y `delete` (M4);
- nombre, fecha de creación, `lastUsedAt` y caducidad opcional.

Se guarda en **credentials-service**, que es donde viven las identidades.

**M4 — Tres alcances, y el borrado se da aparte.** `read` ⊂ `write`; `delete` es
independiente de `write`. No es una protección para nosotros: es la pantalla en la
que el usuario **decide conscientemente** cuánto poder le da a su agente. Por
defecto, al crear, se marca solo `read`; `write` y `delete` se activan a mano. La
responsabilidad de lo que pase con un token con `delete` es de quien lo creó, y la
pantalla lo dice en una línea clara antes de crearlo.

**M5 — El PAT se canjea por un JWT de acceso de vida corta dentro del gateway, y
el resto de la API no se entera.** El punto de entrada del MCP valida el PAT
(hash), comprueba alcance y caducidad, y **emite un access token normal**
(`typ: 'access'`, unos minutos) para llamar a la API con él. Así `JwtGuard`,
`ProjectPermissionGuard`, el limitador por cuenta y las cuotas siguen como están:
**no se toca ninguno de los 224 endpoints.** Es la decisión que más trabajo
ahorra y la que más hay que proteger (I2).

**M6 — Las herramientas se declaran una vez y se aplican al alcance.** Un único
catálogo `mcp-tools.ts` con, por herramienta: nombre, esquema de entrada, método y
ruta del gateway, y alcance que exige. De ahí salen la lista que ve el agente y la
comprobación de alcance. No se reutiliza `capabilities.ts` (declara lo que PRAX
*propone*, con los `OBJECT` vacíos que Gemini rechaza y otras restricciones que no
son las del MCP), pero **sí se parte de su inventario**.

**M7 — Herramientas de alto nivel además de las planas.** Un agente que crea un
backlog de 40 tareas con 40 llamadas gasta el límite de velocidad y su propio
contexto. Se ofrecen lotes —`crear_tareas`, `mover_tareas`, `borrar_tareas`— y las
planas. ⚠️ **Un lote no es una transacción**: cada elemento va por su ruta normal
y el resultado es una lista con lo que salió y lo que falló, para que el agente
reintente solo lo que falló. Nada de «todo o nada» mudo.

**M8 — Los errores del gateway llegan al agente tal cual, y en claro.** Un 402 de
cuota (`puedeAmpliar`), un 403 `PROJECT_SUSPENDED` o `NOT_IN_ORG`, un 400 con el
campo que falla: el agente tiene que poder **leerlos y contárselos al usuario**.
Devolverlos como un «error interno» genérico hace que el agente reintente a ciegas
o invente una explicación.

**M9 — Límite de velocidad propio por token.** Como el del login (trampa 16). El
modelo lo paga el usuario, pero la API la pagamos nosotros, y un agente en bucle
es el caso típico. Tope por minuto por PAT, más el que ya aplica por cuenta.

**M10 — Sin OAuth en la primera entrega.** El PAT cubre Claude Desktop, Cursor,
Claude Code y cualquier cliente que acepte una cabecera `Authorization`. OAuth 2.1
con descubrimiento —lo que permite «Añadir conector» en claude.ai sin copiar
nada— cuesta tanto como todo lo demás junto y solo compensa si el PAT se usa
(M12). Queda para después, sin cerrar la puerta: el PAT es un subconjunto de lo
que pediría OAuth.

**M11 — Antes de tocar nada, acordar el backend.** Este plan es la segunda vez que
el frontend toca el backend por excepción. Hay que hablar con quien lo lleva de
tres cosas —tabla de PAT en credentials, la ruta en el gateway y el mapa de
alcances— y dejarlo escrito aquí antes de M1.

**M12 — Medir antes de invertir en OAuth.** Con `lastUsedAt` y un contador de
llamadas por herramienta (sin contenido) se ve si alguien lo usa y qué pide. Si no
lo usa nadie, no se hace OAuth.

---

## Invariantes

**I1 — El MCP nunca puede más que el usuario en la interfaz.** Se comprueba
contra los guards de siempre, no contra una lista paralela de permisos. Si alguien
añade una ruta con un guard débil, eso ya era un bug antes de este plan.

**I2 — Ninguna ruta del MCP confía en una organización que venga del cliente.** La
organización sale del PAT, que la validó al crearse. Un argumento `organizationId`
en una herramienta se **ignora o se rechaza si difiere del del token**. Es la
trampa 20 otra vez, en una puerta nueva.

**I3 — El PAT en claro no se guarda ni se registra.** Solo su hash, y el prefijo
de ocho caracteres para que el usuario lo reconozca en la lista. Ni en logs, ni en
el registro de errores, ni en la respuesta de listar.

**I4 — Revocar corta al instante.** El JWT de M5 dura minutos, pero la
validación del PAT se hace en **cada** llamada al MCP; un token revocado no puede
seguir vivo por un access token ya emitido más de su vida corta. Cambiar la
contraseña o cerrar todas las sesiones revoca también los PAT.

**I5 — Un token con alcance `read` no escribe, pase lo que pase.** El alcance se
comprueba en la herramienta **y** el método HTTP que va a llamar; una herramienta
mal declarada (marcada `read` pero que hace `POST`) es un fallo de una prueba, no
de la revisión.

**I6 — Nada del MCP se mezcla con PRAX.** Ni código compartido en el bucle de
consulta, ni cuota de tokens, ni rutas `/assistant/*`. Se comparte, como mucho, un
inventario de funciones.

---

## Fases

Cada fase deja `pnpm test` en verde y algo que se puede probar solo. Por tamaño,
**M1–M4 son el MVP**; M5–M6 son lo que lo hace cómodo.

### M0 — Acordar con backend y ajustar el plan

Leer este documento con quien lleve el backend. Confirmar: dónde vive la tabla
(credentials), el formato del token, y que no se objeta a la ruta en el gateway.
Cerrar lo de «Preguntas abiertas». **Salida:** este documento actualizado y la
casilla de M0 marcada.

### M1 — Emisor de tokens (backend)

Modelo `PersonalAccessToken` en credentials-service: `id`, `userId`,
`organizationId`, `name`, `tokenHash`, `prefix`, `scopes`, `expiresAt`,
`lastUsedAt`, `revokedAt`, `createdAt`. Rutas `POST /me/tokens` (devuelve el token
en claro **una vez**), `GET /me/tokens`, `DELETE /me/tokens/:id`. Validación de
pertenencia a la organización. Migración por `prisma:deploy`.
**Pruebas:** hash correcto, pertenencia, alcance por defecto `read`, que el GET no
devuelve nunca el token.

### M2 — Canje del PAT por access token (backend)

Servicio que, dado un PAT, lo valida (hash, revocación, caducidad, alcance) y
emite un JWT `typ: 'access'` con `sub` del dueño. **Sin tocar `JwtGuard`.**
**Pruebas:** token revocado, caducado, inexistente; que el `typ` sale `access` y
no `refresh`; que I4 se cumple.

### M3 — Ruta `/api/mcp` y cuatro herramientas de lectura

Transporte Streamable HTTP con `initialize`, `tools/list` y `tools/call`. Empezar
con `listar_proyectos`, `ver_proyecto`, `listar_tareas`, `ver_tarea`. **Probar con
Claude Desktop o el MCP Inspector** de punta a punta antes de seguir. Este es el
**spike**: si aquí algo no encaja (formato de sesión, cabeceras, tiempos), es
mejor saberlo antes de declarar las otras ochenta herramientas.
**Pruebas:** `tools/list` filtra por alcance; `read` no ve herramientas de
escritura.

### M4 — Catálogo completo: escritura y borrado

`mcp-tools.ts` (M6) con el resto: proyectos, espacios, tableros, columnas, tareas
(fechas, estimación, etiquetas, asignados, checklist), sprints, documentos,
reglas de automatización, chat y miembros. Lotes (M7). Los borrados bajo `delete`.
**Pruebas:** un test recorre el catálogo y comprueba I5 (método HTTP frente a
alcance) y que ningún esquema declara un `organizationId` (I2).

### M5 — Pantalla de Ajustes

En `(privado)/main/settings`: crear token (nombre, organización, alcances,
caducidad), copiarlo una vez, listar con prefijo y `lastUsedAt`, revocar. Con el
texto claro de qué poder da cada alcance (M4) y **las instrucciones de conexión**
para Claude Desktop, Claude Code y Cursor, con la URL ya puesta. Sigue
`kyloo-design` y los tokens de color, sin colores a pelo.

### M6 — Límites, contador y endurecimiento

Límite por PAT (M9), contador de llamadas por herramienta (M12), revocación en
cascada al cambiar la contraseña (I4) y una auditoría de las rutas de escritura
para comprobar que ninguna acepta algo que la interfaz no permitiría (I1).

### M7 — OAuth 2.1 *(condicional a M12)*

Solo si el contador muestra uso real. Descubrimiento
(`/.well-known/oauth-protected-resource`), registro dinámico de clientes,
pantalla de consentimiento con la elección de organización y alcances, y
refresco. El PAT sigue existiendo.

---

## Trampas previstas

Escritas antes de empezar porque la mayoría no darán error.

1. 🔴 **Una herramienta que acepta `organizationId` es un bypass de I2.** Da igual
   que el guard del proyecto lo proteja: un `POST /projects` **sí** lo acepta y
   pertenencia se comprueba en el servicio. El token lleva la organización; el
   agente no la elige.
2. ⚠️ **Gemini no es el límite aquí, pero otros clientes sí tienen los suyos.**
   Algunos rechazan esquemas con `oneOf`/`anyOf` o nombres de herramienta con
   guiones, o se atragantan con cien herramientas. Probar el catálogo con al menos
   dos clientes (Claude Desktop y Cursor) antes de darlo por bueno.
3. ⚠️ **El número de herramientas cuesta tokens al usuario en cada turno.** Cien
   descripciones largas viajan en cada mensaje de su agente. Descripciones
   cortas, y **agrupar** antes que multiplicar. (Es la misma lección de
   `medir-prompt`, en el bolsillo de otro.)
4. ⚠️ **Un borrado en lote sin vuelta atrás.** `DELETE` de tarea no se deshace.
   Como el MCP puede borrar (M2), la descripción de esas herramientas debe decir
   que es irreversible: el agente lo lee y decide si confirmar con su usuario.
5. 🔴 **La inyección de instrucciones la sufre el usuario, no nosotros.** Un
   `.docx` hostil puede hacer que su agente escriba o borre. No es nuestro
   invariante (M2), pero sí es el motivo de que `write` y `delete` no vayan
   marcados por defecto y de que la pantalla lo diga con claridad.
6. ⚠️ **Sin cookie no hay refresco de sesión.** El MCP no pasa por el proxy del
   navegador que renueva `praxis_session`; el JWT de M5 se emite por llamada o con
   vida corta, nunca se reutiliza tras revocar.
7. ⚠️ **Los 402 de cuota llegan a alguien que puede no poder pagar.** El mensaje
   al agente debe incluir `puedeAmpliar` para que diga «pídelo a quien
   administra la organización» en vez de insistir.
8. ⚠️ **Un servicio nuevo no añade nada** (M1): si alguien propone sacar el MCP a
   su proceso, recordar la trampa del monolito: tres sitios a registrar y cada
   uno no da error hasta producción.

---

## Preguntas abiertas

Para contestar en M0. Ninguna bloquea el plan, todas cambian un detalle.

1. **¿Un PAT por organización, o uno que valga para varias?** El plan dice una
   (I2, simple, más seguro). Un usuario con tres organizaciones crearía tres.
   ¿Basta?
2. **¿Caducidad obligatoria?** Por defecto 90 días y renovable, o «sin caducidad»
   permitido.
3. **¿Cuántos PAT por persona?** Un tope (por ejemplo 10) evita abusos de tablas.
4. **¿Es capacidad de todos los planes o de pago?** Las cuotas de API las paga
   Praxis. Hay que decidir si entra en `plans.ts`, y si es así, **el commit que lo
   añada es el que lo aplique** (trampa 23).
5. **¿Puede un `owner` ver los tokens de sus miembros para la organización que
   pagan?** El plan dice que no: es del usuario. Si cambia, hay que decirlo en la
   pantalla de creación.
6. **¿Se publica el catálogo completo o por paquetes de herramientas**
   (`--tools=tareas,documentos`) para bajar el coste de contexto? Depende de lo
   que enseñe M3.

---

## Cómo retomarlo

1. Leer este documento entero, y `PRAX-MCP-SEGUNDA-ITERACION.md` solo por la
   dirección B.
2. **M0 primero:** hablar con backend. Sin esa conversación, M1 es una
   suposición.
3. Hacer **M3 con cuatro herramientas de lectura antes** de declarar el catálogo
   entero: es el spike que prueba el transporte, las cabeceras y el cliente real.
   Orden práctico: M1 → M2 → M3, y solo entonces M4.
4. **No** empezar por la pantalla de Ajustes ni por OAuth: son lo último que se
   necesita para saber si la idea funciona.

---

## Registro

| Fase | Estado | Nota |
|---|---|---|
| M0 — Acordar con backend | ☐ | |
| M1 — Emisor de tokens | ☐ | |
| M2 — Canje PAT → access | ☐ | |
| M3 — `/api/mcp` + 4 lecturas (spike) | ☐ | |
| M4 — Catálogo completo | ☐ | |
| M5 — Pantalla de Ajustes | ☐ | |
| M6 — Límites y endurecimiento | ☐ | |
| M7 — OAuth 2.1 | ☐ | condicional a M12 |
