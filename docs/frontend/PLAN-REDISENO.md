# Plan de rediseño — Panel, Administración, Asistente y Análisis

> **Documento de trabajo con estado.** Se actualiza al terminar cada tarea. Si
> una sesión se corta —o si continúa otro agente— se retoma leyendo «Dónde
> estamos», «Decisiones cerradas» e «Invariantes» y siguiendo por la primera
> tarea sin marcar.

## Dónde estamos

| | |
|---|---|
| **Etapa actual** | R1–R6 cerradas. **R9 en cola**; R7 bloqueada y R8 es futuro |
| **Última tarea terminada** | R5 — cierre. El plan queda hecho salvo R7 (bloqueada) y R8 (futuro) |
| **Siguiente** | **R9** — que el análisis no se le escape nada. Encargada el 2026-08-19 y escrita con el diseño hecho. R7 sigue esperando presupuesto en la clave de Gemini |
| **Orden de ejecución** | R1 ✅ → R2 ✅ → R3 ✅ → R6 ✅ → R4 ✅ → R5 ✅ → R7 (bloqueada por la clave de Gemini) → R8 (futuro). ⚠️ **R6 va antes que R4** aunque esté escrito después: R4.7 mueve el asistente dentro de Análisis, y llegar allí con el organismo ya en su forma final ahorra tocarlo dos veces |
| **Rama** | ⚠️ **`main`.** `feature/rediseno-panel-admin-analisis` se fusionó por fast-forward y el trabajo sigue en `main` por decisión del 2026-08-19. Un commit por tarea, igual que antes |
| **Actualizado** | 2026-08-19 |

Leyenda: `[ ]` pendiente · `[~]` en curso · `[x]` hecho · `[!]` bloqueado o
descartado (con motivo escrito al lado)

### Registro de avance

| Fecha | Tarea | Commit | Nota |
|---|---|---|---|
| 2026-08-18 | Plan escrito | `451649e` | Este documento |
| 2026-08-18 | (fuera de plan) | `ab5e9ae` | `main` no compilaba: `MessageBubble` llamaba a `campoDesdeCuerpo`, renombrado a `fieldFromBody` en `c356208`. Bloqueaba el typecheck de las siete zonas |
| 2026-08-18 | R1.1 | `139f6e2` | `ProjectCard` a `commons`, parametrizada con `href` / `sameZone` / `gatewayPath` |
| 2026-08-18 | R1.2 – R1.8 | `bc801c5` | Panel entero. Dos consultas de tareas pasan a una; `ProjectList`, `DashboardMetrics` y `DashboardWelcome` retirados |
| 2026-08-18 | R1 (cierre) | `f1b17a2` | Registro de las dos desviaciones respecto a lo planeado |
| 2026-08-18 | R2.1 – R2.5 | `4211b03` | Administración entera. `DataTable`, `RowActions`, `FilterBar`, `AdminHeader`; tres errores de lint que ya estaban |
| 2026-08-18 | (ajeno) | `3c34162` | Commit de la cuenta del usuario sobre esta rama. Ver «El incidente de la rama» |
| 2026-08-18 | R3.1 – R3.7 + R4.1 | `0689295` | Zona `assistant-front`, identidad PRAX, `AssistantChat` y `ProjectPicker` a commons, borrado del asistente, y Análisis sin redirect |
| 2026-08-18 | R3.8 – R3.12 | `66637af`…`2989b33` | Preguntas con opciones, propuesta de tablero, prompt sin callejones, español de la región, hora falsa fuera |
| 2026-08-18 | R3.13 | `659f6af`, `8504ba3` | El proyecto pasa a ser un foco y luego se congela: una conversación, un proyecto. Pantalla fija con el hilo desplazándose por dentro |
| 2026-08-18 | R3.14 | `b05a9db` | **Adjuntos guardados.** Multipart a `/me/assistant/attachments`, borrador + `attachmentIds`, `BlobStorage`, y una burbuja igual para todos los archivos. Dos fallos ajenos por el camino: el proxy de zona corrompía binarios (`request.text()`) y `chat-front` no tenía `bodySizeLimit` |
| 2026-08-18 | (del usuario) | `77187ed`, `ce8b024` | Cambios propios que estaban sin commitear en el árbol: el cajón se pliega con un botón en el borde, su historial se filtra por el proyecto que se mira, y el compositor de la demo crece. Se les añadió `aria-label` y `tabIndex` al botón nuevo |
| 2026-08-18 | (fuera de plan) | `797250d` | La cara de PRAX en la barra lateral, a 8px y con el trazo engordado por `-webkit-text-stroke`. `font-weight` no servía: la mono no está autoalojada |
| 2026-08-18 | R6 escrito | — | Etapa nueva: adjuntos con memoria y conversación sin proyecto |
| 2026-08-18 | R6.1 | (este) | **El extracto persistente.** Columna `extract`, extracción al subir (`unpdf` para el PDF), reinyección con presupuesto en `historial()` y la regla 17 del prompt. `text/x-markdown` entraba como binario en Safari. El marcador de imagen se cayó por el camino: era un dato derivado de dos que ya existen |
| 2026-08-18 | R6.5.1 | `95aa727` | `TemplatePlanReview` sube a commons entero —árbol EDT, roles, poda y resumen—. Mudanza sin cambios de lógica: el chat y el diálogo enseñan lo mismo |
| 2026-08-18 | R6.2 – R6.4 | `bdbef7f` | **Conversación sin proyecto.** `POST /me/assistant/chat`, reglas del prompt con ámbito, tres herramientas, adopción de foco y la plantilla desde el chat. Cuatro hallazgos: el resolve daba 404 sin foco, `maxOutputTokens` cortaba la plantilla, la tarjeta que navega tiene que anotar ella misma, y el proyecto recién creado no está en la lista de la pantalla |
| 2026-08-18 | R6.6 | (este) | Documentación (ESTADO-ACTUAL §42, CONTRATO-API, CLAUDE.md), formato y build |
| 2026-08-19 | (fuera de plan) | `519c40d`, `9d5f9e2` | **El prompt, medido y recortado.** De 29 300 a 19 300 tokens por turno, y con techo: el inventario deja de crecer con el proyecto. Con `tareasOmitidas` para que el recorte no sea mudo. ESTADO-ACTUAL §43 |
| 2026-08-19 | (fuera de plan) | `940acf2` | **El tope de páginas del PDF.** Era el peor caso real: 5 MB sin límite de páginas son ~130 000 tokens en un turno. A partir de 25 páginas viaja como texto. R7 y R8 quedan escritas |
| 2026-08-19 | R4.2 | (este) | Un viaje para los agregados. De siete peticiones —y siete resoluciones de permisos— a una. Con `allSettled` para no agrupar los fallos, y `blocked` fuera del `days` compartido |
| 2026-08-19 | R4.6 + R4.7 | (este) | El lienzo arranca con los tres gráficos que salen de `snapshot`. R4.7 ya estaba hecha por R3.6 y se cierra verificada |
| 2026-08-19 | (del usuario) | `c9b6f12`…`408b0f0` | Cambios que estaban sin commitear en el árbol: `SelectorDeFecha` sube a commons y filtra la actividad, la presencia deja de mentir en Administración, PRAX saluda por el nombre, la tarjeta de avisos en tema claro y el salto a PRAX en móvil. Se les quitó un `redirect()` que reintroducía lo que eliminó R4.1, un `useRouter` muerto, tres imports rotos y tres tildes |
| 2026-08-19 | R4.3 | `fd17e53`, `84061c1` | **Filtros de verdad.** DTO compartido validado en las ocho rutas, filtros hasta el `WHERE` de las siete consultas, y la barra en la pantalla. Cuatro hallazgos: `Task` ya guarda `boardId` —no hay que traducir a columnas—, los filtros tienen que entrar en la clave de Redis y el `from` derivado de `days` **no**, un tramo ancho se rechaza en vez de recortarse, y la barra necesita `key` o «Quitar filtros» no limpia las fechas |
| 2026-08-19 | R4.3 (verificación) | `a1599df` | **Ejecutadas las siete consultas contra la base real.** Las ocho combinaciones corren, pero filtrar por una persona devolvía un reparto de tres —las relaciones son de muchos a muchos— y por etiqueta, cuatro etiquetas. Se acota también la dimensión filtrada |
| 2026-08-19 | R4.4 | `1fe0fa8`, `3c9172d` | **La cartera.** `GET /me/reports/portfolio`, dos consultas agrupadas para N proyectos, y su tabla. `DataTable` sube a commons. Probado con el stack levantado |
| 2026-08-19 | (fuera de plan) | `3348d28` | 🔴 **El lienzo de partida daba 400 al primer arrastre**: sus ids no eran UUID y el DTO los valida. Solo salió ejecutando |
| 2026-08-19 | R4.5 | `c1a257c` | **El constructor de gráficos.** Diez métricas por cinco formas, sin modelo y sin cuota. Los desplegables no dejan componer lo que el backend rechaza —comprobado contra él— |
| 2026-08-19 | R4.8 | — | **Cerrada sin código.** Ni R4.2 ni R4.4 piden tablas: la primera agrupa peticiones que ya existían, la segunda agrega donde están los datos |
| 2026-08-19 | R5.2 – R5.3 | `1c3feae`, `b927585` | Ocho zonas y ocho servicios en verde, `next build` de las ocho. Y la suite terminada por primera vez: 190 pasan, 5 caían por una línea de la fixture desfasada desde `dc06673` |
| 2026-08-19 | R5.1 | `04a54b8`…`535fe29` | Documentación: ESTADO-ACTUAL §44, CONTRATO-API (filtros y cartera), PENDIENTES-BACKEND §21 (slugs reservados) y CLAUDE.md (puerto 4107 y las tres trampas) |

---

## El encargo, en una línea

Tres pantallas: **Panel** y **Administración** se rediseñan con lo que ya hay;
**Análisis** se rehace de arriba abajo —incluido el backend— y el asistente se
va de allí a **una zona propia** con identidad de producto.

El orden es Panel → Administración → Asistente → Análisis, y no es arbitrario:
las dos primeras son acotadas y dejan piezas compartidas (la tarjeta de
proyecto, la tabla) que las dos últimas reutilizan. Análisis va al final porque
es la que puede desbordarse.

---

## Decisiones cerradas

Se preguntaron y están respondidas. **No se vuelven a abrir.**

| Decisión | Respuesta |
|---|---|
| Dónde vive el asistente | **Zona propia** `assistant-front` (4107) **más un panel contextual** dentro de Análisis, que monta el mismo organismo con el proyecto ya puesto |
| Identidad del asistente | **PRAX**. Color de la marca (`--color-primary`). Avatar con **carita ASCII/kaomoji**, tierno, y estados |
| Backend en Análisis | **Vía libre, migraciones incluidas** |
| Alcance de Análisis | **Vista de proyecto + vista de cartera** (cruza solo los proyectos donde ya tienes `canViewReports`) |

Y tres que decido yo, escritas aquí para que consten:

1. **Gráficos a medida por dos caminos.** Un constructor determinista en la
   pantalla —métrica, forma, filtros— y el atajo de pedírselo a PRAX. Hoy solo
   existe el segundo, y eso deja el catálogo entero detrás de saber pedirlo
   hablando y de tener cuota.
2. **`/reports` deja de redirigir.** Pasa a ser la pantalla real.
3. **Rama propia y un commit por tarea**, sin `push`. Es lo que ya hizo la etapa
   de pulido y permite deshacer una tarea sin arrastrar el resto.

---

## Invariantes — lo que este trabajo NO puede romper

Están documentadas y costaron caro. Si una tarea de aquí abajo parece pedir
saltarse una, la tarea está mal planteada.

1. **El asistente propone; nunca ejecuta.** Vale también para la zona nueva y
   para cualquier capacidad que se le añada: devuelve parámetros para funciones
   que ya existen, y quien las llama es el frontend, una a una, con la sesión de
   quien acepta y por los endpoints de siempre. Si una capacidad nueva necesita
   una ruta de escritura nueva, está mal planteada (ESTADO-ACTUAL §26.1, §30.3,
   §36.2).

   ⚠️ **El borrado deja de estar prohibido, por decisión explícita del
   2026-08-18.** El argumento que lo vetaba era que el asistente no debía poder
   destruir nada; con el patrón de propuestas ese argumento no se sostiene, y se
   dijo así al decidirlo: la propuesta no ejecuta, quien ejecuta es el frontend
   con la sesión y los permisos de quien pulsa, y eso es **técnicamente idéntico
   a borrarlo desde la pantalla**. Sin `canDeleteTask`, aceptar falla igual que
   le fallaría a esa persona pulsando el botón a mano.

   Lo que sí cambia respecto a las otras ocho herramientas, y por eso se escribe
   aquí: **un borrado no se deshace**. Una tarea propuesta de más se borra; una
   borrada de más no vuelve. Así que la tarjeta de un borrado **no puede ser un
   «Aceptar» más entre otros** — lleva confirmación propia, aspecto destructivo y
   dice qué se lleva por delante (subtareas, checklists, comentarios, adjuntos).
   Ver R3.7.
2. **Código en inglés, prosa en español.** Y los comentarios **no se traducen ni
   se reescriben** al mover un archivo: la prosa de este repositorio es la mitad
   de su valor. Al promover un componente a `commons` se mueve con sus
   comentarios intactos.
3. **Vencidas y «vencen pronto» no se suman en un contador único** (§20.4). Son
   un problema y una advertencia; el rediseño puede juntarlas en una tarjeta,
   pero no en una cifra.
4. **Dos familias de rutas de proyecto**: `slug` en la URL, `id` en la API, y los
   helpers de `commons/api/routes.ts` en vez de la plantilla a mano.
5. **`next/link` dentro de la zona, `<a>` para cruzar de zona** (§16). Y dentro
   de una misma pantalla pueden convivir las dos formas, con prefijo y sin él.
6. **`null` es «no se pudo leer», no «no hay nada».** Todo fetch accesorio
   degrada; el dato principal falla de cara y lo recoge `error.tsx`.
7. **Confirmar contra el `data` de la respuesta, no contra el status**, y enviar
   **solo los campos que el DTO declara**.
8. **`@theme static` y los `@source` de `theme.css`.** Una zona nueva importa
   `theme.css` y añade solo lo suyo. Tocar eso deja componentes sin estilos y
   **sin ningún error**.
9. **Formularios por `useAccion`**, refrescos por `useRefrescoAgrupado` (§35).
10. **Los tokens viven una sola vez**, en `commons/styles/theme.css`.

---

## R1 — Panel (`dashboard-front`)

### Qué falla hoy

1. Es una **pila vertical de siete secciones a 1400 px**. La bandeja de veinte
   filas ocupa el final entero y los proyectos —el objeto principal del
   producto— quedan a medio scroll.
2. Las métricas son de **inventario, no de acción**: «Proyectos / Espacios /
   Miembros». Ninguna de las tres cambia lo que haces hoy, y **ninguna es un
   enlace**.
3. **No hay accesos directos.** Para ir a Análisis, a Mensajes o a un proyecto
   hay que volver a la barra lateral. El panel nombra tus proyectos y no ofrece
   más que la tarjeta.
4. La tarjeta de proyecto del panel (`ProjectList`) es una **copia pobre** de
   `ProjectCard` de `projects-front`: sin monograma, sin caras del equipo, sin
   aviso de suspensión. Dos maneras de dibujar lo mismo, y la peor es la que ve
   quien entra.
5. `/me/tasks` se pide **solo con `dueBefore`**, así que el panel sabe lo que
   vence y **no sabe cuánto trabajo tienes abierto**, que es la primera cifra que
   busca quien abre un panel.

### Tareas

- [x] **R1.1 — `ProjectCard` sube a `commons/organisms`.** Parametrizada con
      `href`, `sameZone` y `gatewayPath` (el `avatarHref` de cada zona apunta a
      su propio proxy). La consumen `projects-front` y `dashboard-front`; se
      borra `ProjectList` del panel. Cumple la regla: un organismo sube cuando lo
      usan ≥2 zonas.
- [x] **R1.2 — `molecules/StatTile`.** La cifra que **es un enlace**: valor,
      etiqueta, pie, tono, icono y destino. Cuatro en el panel — vencidas, vencen
      en 7 días, abiertas, sin leer.
- [x] **R1.3 — `organisms/DashboardHero`.** Saludo, insignias de rol, acción
      primaria y una frase de estado construida con datos (`resumenDelDia`).
      Absorbe `DashboardWelcome` con su aviso de perfil incompleto, que se conserva
      entero: el registro no pide nombre y ese es el caso normal de una cuenta nueva.
      *Resultado:* **sin saludo por hora del día**, que era lo planeado. Es un
      Server Component, así que la hora sería la del servidor; con el servidor en
      otra región el saludo se equivoca a diario y nadie lo reporta. Las salidas
      —una isla de cliente para decir «buenas tardes», o la zona horaria por
      cookie— no pagan lo que cuestan.
- [x] **R1.4 — `organisms/WorkPulse`.** La fila de cifras más la **barra
      segmentada** del reparto de tus tareas abiertas: vencidas · esta semana ·
      más adelante · sin fecha. Colores distintos y etiquetas distintas, nunca una
      suma (invariante 3).
- [x] **R1.5 — `organisms/QuickAccess`.** Los accesos directos a las zonas con
      los contadores que ya se conocen. `<a>` duro, que cruza de zona.
- [x] **R1.6 — `/me/tasks`, y resultó ser una petición MENOS, no una más.**
      El plan pedía añadir una segunda consulta para «abiertas» y el reparto.
      Al mirar `findMyTasks` se vio que ordena por `dueDate ASC` y que en Postgres
      los nulos de un `ASC` van **al final**: quitando el `dueBefore` de la que ya
      había salen los dos avisos —el orden ya los pone delante— **y** el reparto
      completo. Las dos consultas pasan a ser una.
      ⚠️ Con el detalle escrito en `lib/work.ts`: el `total` de esa respuesta no
      sirve cuando se pide `excludeDone`, porque el gateway filtra después de
      consultar y reescribe `total` con lo que le queda, ya recortado por el
      `take`. Por eso con el tope lleno se escribe `100+`.
- [x] **R1.7 — Recomponer la page en dos columnas** y conservar lo que funciona:
      invitaciones, bandeja con su filtro y su paginación (con las **dos** familias
      de href), aviso de voz, diálogo de creación con la plantilla del asistente.
- [x] **R1.8 — Un solo `resolveProfiles`** para los actores de la bandeja **y**
      los miembros de los proyectos. Dos llamadas serían el N+1 que ya documenta
      `commons/api/directory.ts`.

### Trampas conocidas de esta zona

- Los dos tipos de `href` conviven en la misma pantalla: `FiltroDeAvisos` usa
  `next/link` y necesita la ruta interna; `Pagination` usa `<a>` plano y necesita
  la absoluta. Mezclarlas da `/dashboard/dashboard?…`, que es un 404, y **no lo
  ve el compilador**.
- `avatarHref(..., '/dashboard/api/gateway')` — el proxy es el de la zona.

---

## R2 — Administración (`admin-front`)

### Qué falla hoy

1. 🔴 **Las columnas no cuadran, y ya está diagnosticado.** La cabecera
   (`UsersTable.tsx:60`) y cada fila (`:80`) son **dos rejillas CSS
   independientes** que comparten la plantilla
   `minmax(0,2.2fr)_1fr_1fr_0.8fr_1fr_auto`. La última pista es `auto`: en la
   cabecera mide lo que mide la palabra «Acciones» y en la fila lo que miden tres
   botones. Al resolverse distinto, **el desajuste se reparte hacia atrás y
   ninguna columna cae donde dice su título**. Hay que comprobar el mismo patrón
   en `ProjectsTable` y `ActivityTable`.
2. Sin jerarquía: pestañas, barra de filtros, tabla y paginación pesan lo mismo.
3. **Tres botones de texto por fila** × 20 filas = sesenta botones en pantalla, y
   uno de ellos es destructivo.
4. No hay ninguna cifra de plataforma —cuántas cuentas, cuántas suspendidas,
   cuántos proyectos— aunque cada listado ya devuelve su `total`.

### Tareas

- [x] **R2.1 — `molecules/DataTable`.** Una **sola** rejilla para cabecera y
      filas, con anchos deterministas y `auto` prohibido, más el modo tarjeta en
      móvil que ya existe y funciona bien. Las tres tablas pasan por ahí, así que
      el fallo no puede volver por una de ellas.
- [x] **R2.2 — Las acciones de fila, a un menú.** Tres puntos, con el motivo del
      bloqueo dentro en vez de en un `title`. La fila se lee, y lo destructivo
      deja de estar a un clic de distancia.
- [x] **R2.3 — Cabecera de sección con cifras**, sacadas de los `total` que ya
      vienen. Sin peticiones nuevas.
- [x] **R2.4 — Barras de filtro.** Buscador con el icono **dentro** —ojo con
      §40.5, que ya se pintó debajo del campo una vez—, filtros como segmentos,
      contador de resultados y salida del filtro cuando no hay ninguno.
- [x] **R2.5 — `AdminTabs`** se lee como navegación, no como una fila de botones.

### Lo que no cambia

El modelo de autorización. La tabla apaga acciones **por cortesía**; quien manda
es el gateway. Y **no hay borrado de cuentas**, que es una decisión escrita: deja
tareas, comentarios e historial apuntando a alguien que ya no está, y esos datos
viven en otros microservicios donde la cascada no llega.

---

## R3 — El asistente: zona propia e identidad

### Tareas

- [x] **R3.1 — PRAX, la identidad, en un solo sitio.** Nombre, avatar **SVG** con
      carita kaomoji y estados —reposo, pensando, respondiendo, error— sobre el
      primario de la marca. SVG y no imagen: pesa nada, escala, y sigue al tema
      claro/oscuro sin un segundo archivo.
- [x] **R3.2 — La zona `assistant-front`** en el 4107, `basePath: '/assistant'`.
      Checklist de zona nueva (§17.7): `proxy.ts` con su guard **y `'/'` como
      entrada aparte del matcher** (§17.6), `api/gateway/[...path]` con
      `createGatewayProxy()`, `globals.css` que importe `theme.css` y añada solo
      su `@source` y sus `@font-face` con el basePath, `layout.tsx` con `AppShell`,
      `error.tsx` y `not-found.tsx`.
- [x] **R3.3 — Enganchar la zona:** `rewrites()` del `web-shell` con **las dos**
      entradas (`/assistant` y `/assistant/:path*`), `scripts/dev-cli/config/services.mjs`,
      Docker/infra, `.env` y la entrada en `APP_NAV_ITEMS` entre Análisis y Mensajes.
- [x] **R3.4 — `AssistantChat` sube a `commons/organisms`** con sus piezas
      (`ProposalCard`, `ProposalGroup`, `FlujoDePensamiento`, `ConversationHistory`,
      `ModelText`). Lo van a usar dos zonas. Los comentarios se mueven intactos.
- [x] **R3.5 — La pantalla `/assistant`.** Conversación a pantalla completa,
      **proyecto opcional** en vez de obligatorio, historial de conversaciones y la
      cuota a la vista de quien la gasta.
- [x] **R3.6 — El panel contextual en Análisis.** Un cajón lateral que monta el
      mismo organismo con el proyecto ya puesto, para que quien esté mirando un
      gráfico pueda preguntar sin cambiar de pantalla ni volver a dar contexto.
- [x] **R3.7 — «Más agéntico»: herramientas nuevas, incluido el borrado.**
      Lo que se amplía es el catálogo de **propuestas** y el contexto de
      **lectura**; lo que no se toca es que el asistente no ejecuta.
      - `proponer_borrado` de tarea, con `taskId` y motivo. Requiere
        `canDeleteTask`, así que ni siquiera se le declara al modelo a quien no lo
        tenga — el filtro por permisos de `tools.ts` ya funciona así, y es lo que
        evita proponer un botón que revienta al pulsarlo.
      - La tarjeta de un borrado **no se parece a las demás**: color destructivo,
        confirmación propia, y el inventario de lo que se lleva por delante
        (subtareas, checklists, comentarios, adjuntos), que es justo lo que no se
        ve al pulsar «Aceptar» de corrido.
      - **Nunca en lote sin desglose.** Un `ProposalGroup` con cinco borrados se
        acepta uno a uno o no se acepta.

### Riesgo principal

Una zona nueva toca ocho sitios fuera de su carpeta y **ninguno da error de
compilación** si se olvida: el rewrite, el puerto del CLI, el Docker, el `.env`,
la navegación. La lista de arriba es la checklist; se marca entera o no se marca.

---

## R4 — Análisis (`reports-front` + `reports-service` + gateway)

### Qué falla hoy

1. 🔴 **La pantalla negra entre dos cargas.** `/reports` es un Server Component
   que resuelve el primer proyecto y hace `redirect()`. Eso es: render en el
   servidor → 307 → navegación nueva → `loading.tsx` → render de `[id]`. **Dos
   cargas completas donde debería haber una**, y la ventana entre ellas es lo que
   se ve en negro.
2. Y dentro de `[id]`, **dos rondas de fetch en serie**: primero el lienzo,
   después los informes que ese lienzo necesita. Está razonado y el ahorro es
   real, pero paga un salto de red en la ruta más lenta de la aplicación.
3. **El lienzo arranca vacío.** La primera impresión de la sección es una
   pantalla en blanco con un catálogo al lado.
4. Los siete agregados **no aceptan ningún filtro** salvo `days`/`weeks`: ni por
   tablero, ni por responsable, ni por etiqueta, ni por prioridad, ni un rango con
   inicio y fin. Para un PM eso es la mitad de las preguntas sin responder.
5. **No hay vista de cartera.** Quien lleva cinco proyectos tiene que entrar a los
   cinco para saber en cuál arde algo.
6. Los gráficos a medida **solo se piden hablando**, así que dependen de saber
   pedirlo y de tener cuota.

### Tareas

- [x] **R4.1 — Las rutas, sin un solo redirect.** `/reports` pasa a ser la
      pantalla real. El proyecto activo sale de una cookie
      (`praxis_reports_project`), con caída al primero con `canViewReports`.
      `/reports/[id]` se queda para enlaces directos y **escribe la cookie**.
- [x] **R4.2 — Un solo viaje para los agregados.** `GET
      /projects/:id/reports?include=…`, con el conjunto cerrado validado por DTO.
      El ahorro de verdad no era el ida y vuelta: **cada una de las siete
      peticiones pasaba por `ProjectPermissionGuard`**, que resuelve permisos
      preguntando a projects-service por TCP. Siete informes eran siete
      resoluciones idénticas para pintar una pantalla.
      ⚠️ `allSettled` y no `all`: un informe que falla vuelve como `null` y no se
      lleva a los demás — agrupar las peticiones no puede significar agrupar los
      fallos.
      ⚠️ Y **`blocked` no recibe el `days` del paquete**: ahí `days` significa
      «lleva sin moverse», no «ventana de historial», y su defecto son 7 frente a
      60. Un `days` global lo convertía en otra pregunta con el mismo nombre.
- [x] **R4.3 — Filtros de verdad, con DTO compartido y validado**: `from`/`to`,
      `boardId`, `assigneeId`, `labelId`, `priority`, en los siete agregados.
      ⚠️ **El tablero no hay que traducirlo a columnas.** Parecía que sí —los
      tableros viven en projects-service y aquí se agregan tareas— pero `Task`
      guarda `boardId` además de `columnId`, y `TaskEvent` también. Comprobarlo
      antes ahorró un cruce contra projects-service en la ruta más pedida de la
      sección.
      🔴 **Los filtros van en la clave de Redis, y el `from` derivado de `days`
      no.** Lo primero, porque sin ello quien filtra deja su resultado bajo la
      clave de quien no filtra —un gráfico plausible y equivocado durante un
      minuto, sin un solo error—. Lo segundo, porque ese `from` es «ahora menos
      sesenta días»: metido en la clave, ningún informe volvería a acertar en
      caché jamás. `claveDeFiltros` vive junto al DTO para que un filtro nuevo no
      pueda olvidarse ahí.
      ⚠️ **Un tramo de más de 365 días se rechaza con 400, no se recorta**, al
      revés que `days`. Dos fechas son una pregunta concreta y estrecharla por
      detrás devuelve un gráfico que se lee como su respuesta. Misma regla que el
      inventario del asistente.
      ⚠️ **`from`/`to` no acota lo mismo en todos**: `createdAt` en los que miden
      estado —instantánea, paradas, personas—, `completedAt` en los tiempos,
      `occurredAt` en el flujo, y en la serie semanal **es el eje**. La tabla está
      en `StatsService`, porque los cuatro devuelven un gráfico plausible con
      cualquier criterio.
      ⚠️ Y la barra necesita una `key` atada a los filtros puestos: los selectores
      de fecha no se controlan desde fuera y en una navegación suave no se
      desmontan, así que «Quitar filtros» limpiaba la URL y dejaba la fecha en el
      campo.
- [x] **R4.4 — La vista de cartera.** Cruza solo los proyectos donde ya tienes
      `canViewReports` —la consulta `GET /projects?permission=canViewReports` ya
      existe— y **agrega en el servidor**, no con N llamadas desde el navegador.
- [x] **R4.5 — El constructor de gráficos**, determinista, en la propia pantalla.
      Mismo conjunto cerrado de métricas y formas que ya valida el backend.
      ⚠️ Los desplegables **no ofrecen lo imposible**: las formas salen de la
      métrica elegida, y el rango, el top N y «solo vencidas» solo aparecen si
      esa métrica los acepta. Un conjunto cerrado que deja componer
      combinaciones inválidas y luego las rechaza es un formulario con trampas.
      Comprobado contra el backend: `dona` sobre una serie semanal y un rango
      sobre una foto del momento se rechazan los dos.
- [x] **R4.6 — El lienzo deja de arrancar vacío**: una disposición por defecto la
      primera vez, que se puede cambiar y se guarda como cualquier otra.
      ⚠️ **Contradecía una decisión escrita en `CanvasVacio`** —«no se rellena con
      un lienzo por defecto»— y el argumento de allí era bueno: los cinco de antes
      dejaban tres tarjetas disculpándose por falta de datos. Se resuelve haciendo
      falsas las dos objeciones: el de partida son **solo los tres que salen de
      `snapshot`**, el único informe que no necesita historial y que ya viajaba en
      el paquete. Ninguno puede disculparse, y no cuesta una petición más.
      ⚠️ Y la condición es `actualizadoEn === null`, **no** que la lista esté
      vacía: un lienzo vaciado a propósito también llega vacío. Un fallo de
      lectura tampoco cuenta como primera vez — pintarlo habría hecho que el
      siguiente arrastre guardara los tres de partida encima del lienzo real.
- [x] **R4.7 — Fuera el asistente**, y en su lugar el cajón contextual de R3.6.
      *Resultado:* **ya estaba hecha**, por R3.6 (`6c14adf`). Verificado: el único
      asistente que queda en Análisis es el cajón —`AnalysisScreen` → `DockSlot` →
      `AssistantChat variante="cajon"`— y no hay restos del montaje anterior en la
      página. Se cierra sin escribir código, como R6.5.2.
- [x] **R4.8 — Tablas propias para `reports-service`** si R4.2/R4.4 las piden.
      *Resultado:* **no las piden, y se cierra sin código.** R4.2 agrupa
      peticiones que ya existían y R4.4 agrega en tasks-service, que es donde
      están los datos. El servicio sigue sin base de datos —lo decidido en §25.6—
      y el lienzo se queda en `projects-service`, sin migración entre bases. Era
      justamente el «por defecto» escrito abajo, confirmado al llegar.
      Hoy el servicio **no tiene ninguna** —agrega de tasks y projects por TCP y
      cachea en Redis— así que sería su primera migración, y hay que tocar los
      scripts de Prisma de la raíz, que lo excluyen **a propósito**.

### Decisiones que aún no están tomadas y se tomarán al llegar

- Si el lienzo (`report_layouts`, hoy en `projects-service`, §33.3) se muda a
  `reports-service`. Ganaría coherencia y costaría una **migración de datos**
  entre dos bases. Por defecto: **no se mueve** salvo que R4.2 lo exija.
- Si la cartera necesita tabla o se resuelve agregando en caliente con la caché
  de Redis que el servicio ya usa. Por defecto: **empezar sin tabla**.

### Trampas conocidas de esta zona

- `COUNT(*)` de Postgres es `bigint` y **no se serializa a JSON**: toda consulta
  agregada nueva castea a `::int` en el propio SQL. Si no, sale un 500 sin pista.
- La ruta puede traer el **slug**, y solo `GET /projects/:id` lo traduce: todo lo
  anidado espera el UUID y pasarle el slug da **403**, no un error de compilación.
- El `days` va acotado a 1–365 en el gateway y `weeks` a 2–52. Los filtros nuevos
  necesitan sus propios topes o son una consulta sin límite.
- `completed` cuenta lo que tiene `completedAt`, y eso **solo existe desde que se
  captura el historial**. «Lo que está en una columna de cierre» es `byColumn`
  cruzado con el color, no `completed`.
- La semana en curso está a medias: un lunes por la mañana la variación siempre
  sale catastrófica.

---

## R6 — PRAX sin proyecto, y con memoria de lo que le das

> **Se ejecuta antes que R4**, aunque vaya después en este documento. R4.7 mueve
> el asistente dentro de Análisis; llegar allí con el organismo ya en su forma
> final ahorra tocarlo dos veces.

### El encargo, en una línea

Que se pueda hablar con PRAX **sin haber elegido proyecto** —contándole uno que
todavía no existe, con su documentación adjunta— y que de esa conversación salga
la **plantilla de arranque** del proyecto. Para que eso funcione, antes hace
falta que **lo que se le adjunta sobreviva al turno**.

Las dos mitades se piden juntas porque la segunda sin la primera sale coja:
contarle tu proyecto con tres PDF y que dos turnos después no se acuerde de nada
es exactamente el caso que esto viene a cubrir.

### Qué falla hoy

1. 🔴 **Un archivo no sobrevive al turno en el que se adjunta.** Está escrito
   como decisión consciente en `assistant.service.ts` (`pregunta:
   payload.message`, «se guarda lo que la persona escribió, no el mensaje con
   los archivos pegados») y el motivo es bueno: un turno con 40 000 caracteres
   de un `.md` dentro no se lee como conversación, y al releerlo se reenviaría
   entero en cada turno posterior. Pero la consecuencia es que **PRAX olvida el
   documento en cuanto contesta**.
2. **Sin proyecto no hay compositor.** `AssistantChat.tsx` es literalmente
   `{!projectId ? null : …}`: entrar sin `?p=` enseña el recibimiento y unos
   botones de proyecto, y **no se puede escribir**. No hay forma de usar a PRAX
   como se usa cualquier otro asistente.
3. **La plantilla de arranque vive fuera de la conversación.** `POST
   /me/assistant/project-draft` pide un `brief` de 20–4000 caracteres escrito de
   una sentada en un diálogo, cuando la forma natural de dar ese contexto es
   contarlo por partes y adjuntar lo que ya tienes escrito.
4. **Una conversación sin foco es un estado de paso, no un sitio donde estar.**
   El esquema ya admite `projectId: null` en `Conversation` y en `Message`, y
   `resolver()` fija el foco en el primer turno. Media pieza puesta, sin nadie
   que la use.

### Decisiones cerradas (2026-08-18)

Se discutieron y están respondidas. **No se vuelven a abrir.**

| Decisión | Respuesta |
|---|---|
| Qué se guarda de un adjunto | **Una columna `extract` en `Attachment`**, nada más. Ni tabla aparte, ni enum de estados, ni resumen de segundo nivel. `null` significa «no hay contenido que reinyectar» |
| Texto y Markdown | El UTF-8 decodificado, **al subir**. Gratis y determinista |
| PDF | La capa de texto, **al subir**. Y **sigue viajando nativo** (`inlineData`) en el turno en el que se adjunta: convertirlo a texto plano *para ese turno* sería perder maquetación, tablas y figuras que Gemini sí lee |
| Imágenes | **Se quedan, y sin llamada de descripción.** Ver abajo |
| Dónde se reinyecta | En `historial()`, **no** dentro del texto del mensaje. La burbuja sigue leyéndose como conversación y la base no miente |
| Cuánto se reinyecta | Presupuesto global, del más reciente hacia atrás. Se **almacena** más de lo que se **inyecta** |
| Cuota | **Un turno, una unidad**, lleve archivos o no |
| Chat sin proyecto | Ruta hermana `POST /me/assistant/chat`, solo `JwtGuard`. Sin briefing, sin miembros, sin chat de equipo |
| Herramientas sin foco | Exactamente tres: `proponer_plantilla`, `proponer_abrir_proyecto` y `proponer_pregunta` |
| Adoptar proyecto | **Sí, en dos casos**: al aceptar una plantilla (el proyecto recién creado se adopta sin preguntar) y cuando PRAX propone abrir uno tuyo y se acepta |
| La revisión del plan | **Componente compartido** entre el diálogo de proyecto nuevo y el chat, no una segunda forma de dibujar lo mismo |

#### Las imágenes se quedan, y la llamada de descripción se muere

La primera propuesta era describirlas con una segunda llamada a Gemini para
guardar esa descripción. Se descarta entera: era una llamada más, un modo de
fallo más, una columna con estados y una pregunta abierta sobre la cuota.

Lo que la sustituye no cuesta nada. **En el turno en el que se adjunta una
imagen el modelo ya la tiene delante, y su respuesta sí se guarda.** Basta con
que el prompt le exija a PRAX contar lo que ve cuando el turno lleva imágenes: la
descripción queda en su propio mensaje y se reinyecta por el camino que ya
existe. Cero llamadas nuevas, cero coste nuevo.

Como red de seguridad se planeó guardar un **marcador de hecho** —`[imagen
adjunta: captura.png]`— para que PRAX no negara después que hubo una imagen ahí.
⚠️ **Al implementarlo se cayó también**, y el motivo consta aquí: ese marcador se
compone de `filename` y `mimeType`, que están siempre, así que guardarlo era una
columna con un dato derivado de otras dos —lo que acaba desincronizado— y el
bloque que se pinta en el hilo (`bloqueSinContenido`) además explica *por qué* ya
no la tiene delante, que el marcador no decía. Una imagen guarda `extract: null`.

Matarlas del todo —que se consideró— habría costado uno de los mejores casos de
uso que tiene esto: pegar la captura de un error y decir «crea una tarea con
esto».

#### El presupuesto es obligatorio, no un ajuste fino

Con los topes de hoy —3 adjuntos por mensaje, 40 000 caracteres por archivo— un
hilo de 12 turnos reinyectaría hasta **360 000 caracteres en cada turno**. Eso no
es un riesgo: es una certeza de reventar la ventana y la factura.

- Se **almacena** hasta 40 000 caracteres por archivo (el tope de hoy).
- Se **inyecta** hasta **24 000 caracteres en total** por historial (~6 000
  tokens), del más reciente hacia atrás.
- Lo que se recorta **se avisa dentro del propio prompt**, como ya se hace con
  los archivos de texto. Un recorte mudo hace que el modelo hable con confianza
  de un documento del que solo ha visto el principio, que es la peor forma de
  equivocarse aquí.

Guardar más de lo que se inyecta es a propósito: **subir el dial luego no obliga
a reextraer nada.**

#### Lo que se decide NO hacer

- **Una herramienta `leer_adjunto`.** Resolvería el presupuesto sola y es
  elegante, pero exige un bucle de tool-calling **ejecutado en el backend**, y
  hoy aquí no se ejecuta ninguna llamada a función: se devuelven como propuestas.
  Aunque una lectura no viole la letra de la invariante 1, borra la línea que la
  hace fácil de razonar.
- **Backfill de los adjuntos que ya existen.** Son datos de desarrollo. Se quedan
  sin extracto y se comportan como hoy.
- **Multiproyecto en una conversación.** Sigue vetado por lo de siempre (§ del
  esquema de `Conversation`): los permisos son por proyecto y una sola lista de
  herramientas no puede expresar dos.

### Los stacks

Cada stack termina en algo que se puede entrar a ver. Al cerrar uno se dice qué
se hizo y se espera antes de seguir.

#### R6.1 — El extracto persistente

- [x] **R6.1.1 — `text/x-markdown` en `ASSISTANT_TEXT_MIME`.** 🐛 Está en la
      lista de permitidos con un comentario explicando que Safari y algunos Linux
      mandan así los `.md`, pero **no** en la de los que se pegan como texto: el
      mismo archivo entra como texto en Chrome y como binario en Safari.
- [x] **R6.1.2 — La columna `extract` y su migración.** Nullable, sin backfill.
      ⚠️ Y **`detalle()` no la selecciona**: si lo hiciera, metería cada documento
      del hilo en cada lectura de la pantalla.
- [x] **R6.1.3 — Extraer al subir.** Texto/Markdown por decodificación; PDF con
      capa de texto; imagen con su marcador. Un PDF escaneado —sin capa— se queda
      sin extracto y cae en el mismo trato que la imagen.
- [x] **R6.1.4 — Reinyectar en `historial()`**, con el presupuesto y el mismo
      formato `--- ARCHIVO ADJUNTO: nombre ---` que ya usa `repartirAdjuntos`,
      para que el prompt no tenga que aprender un segundo formato.
- [x] **R6.1.5 — El prompt**: narrar lo que se ve cuando el turno lleva
      imágenes, y no dar por hecho que un archivo de hace tres turnos sigue
      delante en su forma original.

#### R6.2 — Hablar sin proyecto

- [x] **R6.2.1 — `POST /me/assistant/chat`**, solo `JwtGuard`. El controlador
      `/me/assistant` ya existe y ya aloja cuota, conversaciones, adjuntos y el
      borrador de plantilla, precisamente por «esto no tiene proyecto detrás».
- [x] **R6.2.2 — `AssistantService.chat()` con `projectId` nulo**: sin briefing,
      sin miembros, sin chat de equipo, y con su propia instrucción de sistema.
- [x] **R6.2.3 — 🔴 El resolve de propuestas, en `/me`.** Hoy es
      `POST /projects/:projectId/assistant/proposals/:id/resolve`: en una
      conversación sin foco **aceptar o descartar cualquier tarjeta daría 404**.
      Hermana en `/me/assistant`, con el `userId` del token como llave, igual que
      se hizo con las conversaciones.
- [x] **R6.2.4 — El compositor sin la reja del `projectId`** y el recibimiento
      reescrito: sin foco ya no es «elige un proyecto», es «pregúntame lo que
      quieras, y si quieres que mire un proyecto, elígelo».

#### R6.3 — Adoptar un proyecto a mitad

- [x] **R6.3.1 — El gateway le pasa la lista.** Para los turnos sin foco,
      `id` + `nombre` de los proyectos con `canViewReports` —la consulta
      `GET /projects?permission=canViewReports` ya existe (§29.2)—. Sin esto el
      modelo no puede nombrar un proyecto tuyo.
- [x] **R6.3.2 — `proponer_abrir_proyecto(projectId, porQue)`**, validada contra
      esa lista. Nada de fiarse de un id que se invente el modelo.
- [x] **R6.3.3 — La tarjeta y la adopción.** Aceptar navega a
      `?p=<slug>&c=<conversación>` y a partir de ahí la conversación es de ese
      proyecto, con briefing y con las doce herramientas. Rechazar no hace nada:
      se sigue hablando sin foco.

#### R6.4 — La plantilla, desde la conversación

- [x] **R6.4.1 — La herramienta en el conjunto sin foco.** ⚠️ Sigue **fuera** de
      `herramientasPara()`, y el motivo de §36.1 no cambia: en una conversación
      *con* proyecto, declararla dejaría que a mitad de una charla sobre tareas el
      modelo propusiera rehacer el proyecto entero. Sin foco ese argumento
      desaparece —no hay proyecto que rehacer— y por eso vive ahí y solo ahí.
- [x] **R6.4.2 — Se guarda como `Proposal`**, con `tool` y `args`, y su
      `status`. §36.1 decía que no se podía porque una propuesta cuelga de una
      conversación y no la había; ahora sí la hay.
- [x] **R6.4.3 — Aceptar llama a `commons/template/apply.ts`**, que ya existe y
      crea el proyecto una llamada a la vez con la sesión de quien acepta.
      **Ninguna ruta de escritura nueva.**
      ⚠️ *Desviación:* la adopción del proyecto recién creado **no es
      automática**, es un botón en el resumen. Adoptarlo exige navegar —la
      pantalla resuelve el contexto en el servidor— y navegar se lleva por
      delante el resumen de lo que se creó, que es justo donde salen **los fallos
      uno a uno** (§36.4). Crear un proyecto y que la pantalla salte antes de
      poder leer qué no se pudo crear era peor que un clic de más.

#### R6.5 — La revisión del plan, compartida y con árbol

- [x] **R6.5.1 — Extraer el paso «revisar» de `AssistedTemplate`** a un
      componente compartido que consuman el diálogo de proyecto nuevo y la
      tarjeta del chat. Dibujar el plan de una segunda manera en el chat sería el
      pecado que documenta R1.4 con `ProjectList` como copia pobre de
      `ProjectCard` — y el componente pobre sería el nuevo.
- [x] **R6.5.2 — El árbol EDT**: espacios → tableros → columnas con su color,
      más etiquetas y roles con sus permisos, y el `porQué` de PRAX.
      *Resultado:* **ya existía**. `Revision` lo dibujaba desde el diálogo, con su
      comentario explicando por qué es un EDT y no una lista con sangría —«si no
      entiende la jerarquía, no está revisando: está confiando»—. Con R6.5.1 el
      chat lo hereda tal cual, así que esta tarea se cierra sin escribir nada.
- [x] **R6.5.3 — En el hilo, tarjeta compacta.** Un árbol dentro de una burbuja
      de chat no se lee: la tarjeta resume («3 espacios, 5 tableros, 12
      etiquetas, 4 roles») y abre la revisión a pantalla ancha.

#### R6.6 — Cierre de etapa

- [x] **R6.6.1 — Documentación**: sección propia en ESTADO-ACTUAL, las rutas
      nuevas en CONTRATO-API, y las trampas de aquí abajo en CLAUDE.md.
- [x] **R6.6.2 — Formato y tipos**: `pnpm format`, typecheck de las zonas
      tocadas y `next build`.
- [x] **R6.6.3 — Verificación** con el stack levantado. Si no levanta en esta
      máquina, **se dice**.

### Trampas conocidas de esta etapa

- 🔴 **`maxOutputTokens: 2048` es global en `gemini.client.ts`**, y por ahí pasa
  también la plantilla. Un plan de 4 espacios × 4 tableros × 8 columnas + 6 roles
  con su diccionario de permisos + 12 etiquetas + `porQué` se pasa de ahí, y
  cuando eso ocurre `finishReason` queda en `MAX_TOKENS` y **el JSON llega
  cortado, sin un solo error**. Hoy es latente; con R6.4 se vuelve probable.
- ⚠️ **El resolve de propuestas es una ruta de proyecto.** Ver R6.2.3.
- ⚠️ **Un adjunto en borrador no tiene conversación todavía** (`conversationId`
  *y* `messageId` nulos): lo que protege el borrador es `uploadedBy`. Cualquier
  consulta nueva sobre extractos tiene que filtrar por ahí.
- ⚠️ **El extracto se calcula una vez, al subir.** Recalcularlo por turno sería
  leer el blob entero en cada pregunta.
- ⚠️ **`ASSISTANT_TEXT_MAX_CHARS` y el presupuesto son dos números distintos** y
  hacen dos cosas distintas: el primero topa lo que se guarda por archivo, el
  segundo lo que se manda en total. Igualarlos parece limpio y rompe el motivo
  por el que se guarda más de lo que se inyecta.
- ⚠️ **La cuota se comprueba antes de llamar a Gemini y se consume después**, y
  solo si respondió bien. La ruta nueva de `/me/assistant/chat` tiene que repetir
  ese orden: es lo que evita cobrar por un error que no es del usuario.

---
## R7 — La caché de contexto (pendiente, y a propósito)

> Sale de medir el coste real de un turno (ESTADO-ACTUAL §43). Los recortes ya
> están hechos —el prompt bajó de 29 300 a 19 300 tokens y dejó de crecer con el
> proyecto—; esto es el lever que queda.

### El hecho de partida, que conviene entender antes de decidir nada

**Los modelos son sin estado.** No hay una sesión abierta donde el modelo
recuerde: cada petición es la primera vez que ve la conversación, así que el hilo
entero viaja en cada turno. Lo hacen igual ChatGPT, Claude y Gemini.

Lo que sí existe es que el proveedor tenga **cacheado el trabajo de procesar** un
prefijo idéntico, y lo cobre mucho más barato. Eso convierte esto en una cuestión
de **orden**: lo estable delante, lo volátil detrás.

### Qué habría que hacer

- [ ] **R7.1 — Comprobar qué ofrece el modelo en uso**: si hay caché implícita,
      desde cuántos tokens, y qué cuesta la explícita con su TTL. Sin ese dato
      todo lo demás son suposiciones.
- [ ] **R7.2 — Partir el bloque `CONTEXTO` por volatilidad.** Hoy es un único
      JSON: la estructura (tableros, etiquetas, gente) cambia de mes en mes y los
      números cambian cada vez que alguien mueve una tarea, pero van pegados, así
      que **un movimiento invalida el prefijo entero**.
- [ ] **R7.3 — Caché explícita por conversación**, si compensa: subir una vez lo
      estable y reutilizarlo mientras dure el hilo. Con su ciclo de vida —crear,
      caducar, invalidar cuando el proyecto cambia—, que es lo que hace que esto
      sea una tarea y no un ajuste.

### ⚠️ Por qué está pendiente y no hecho

**No se hace a ciegas.** Depende de números del proveedor que hay que verificar
—mínimos, TTL, tarifa— y **no se puede probar nada**: la clave de Gemini está sin
presupuesto. Implementar un ciclo de vida de cachés sin poder ejecutarlo una sola
vez es la mejor forma de dejar puesto algo peor que lo que había.

Se retoma cuando la clave responda.

---

## R8 — Que el contexto deje de ser «todo» (futuro, iteración de optimización)

> No es una tarea pendiente: es **la dirección** en la que hay que crecer el día
> que alguien traiga un proyecto de miles de tareas. Se escribe ahora porque la
> decisión se toma mejor con las medidas de §43 delante que dentro de un año.

### El problema, dicho una vez

Hoy el contexto es «mándaselo todo»: el inventario entero del proyecto en cada
turno. Eso escala hasta unos cientos de tareas y ahí se acaba. El techo de
`INVENTARIO_MAX_CHARS` **acota el coste** —un proyecto de 50 000 tareas cuesta lo
mismo que uno de 200— pero convierte un problema de dinero en uno de ceguera: de
50 000 tareas, PRAX vería un centenar.

⚠️ **Y esto NO se arregla «migrando a agentes».** Un agente de Bedrock, de
LangGraph o de donde sea es por dentro lo mismo que hay aquí: un bucle que arma
un prompt, lo manda y lee la respuesta. **Ninguna arquitectura evita reenviar el
contexto**, porque el modelo no tiene memoria. Lo único que cambia entre un
sistema y otro es **quién decide qué entra en ese prompt**, y eso es exactamente
lo que hay debajo.

### La progresión, en orden

- [ ] **R8.1 — Conjunto de trabajo en vez de inventario.** El briefing lleva los
      números —ya calculados, ocupan nada— más las tareas que importan: las de
      quien pregunta, las vencidas, las del tablero que está mirando. Nadie
      pregunta por sus 50 000 tareas; pregunta por las suyas.
- [ ] **R8.2 — Búsqueda como herramienta** (`buscar_tareas`). El salto de verdad:
      convierte «cabe o no cabe» en «pide lo que necesites». Cuesta un viaje extra
      al modelo en los turnos que la usen.
      ⚠️ Rompe la regla de «aquí no se ejecuta ninguna llamada a función», y hay
      que decir por qué se puede: esa regla es sobre **escrituras**. Una búsqueda
      con la sesión de quien pregunta no abre ninguna puerta nueva — la invariante
      1 sigue intacta, y conviene escribirlo al hacerlo para que no parezca un
      descuido.
- [ ] **R8.3 — Búsqueda semántica**, solo si un cliente la pide. «Las tareas que
      hablan de facturación» no se resuelve con un `LIKE`, pero es un índice más
      que mantener y no se mete antes de que haga falta.

### Lo que NO se hace, y por qué

**Migrar a un framework de agentes gestionado** (Bedrock y compañía). Resolvería
el alojamiento del modelo y daría orquestación hecha, a cambio de atar el
producto a un proveedor y —lo que de verdad importa— **quitar el control sobre lo
que se envía**. Todo lo que se ganó en §43 salió de poder medir el prompt y
recortarlo; con un agente gestionado no se sabe qué viaja.

Y **el asistente sigue sin ejecutar nada**. Eso, que parece una limitación, es lo
que hace vendible esto a una empresa: un agente con permisos de escritura sobre
el gestor de proyectos de un cliente es una conversación de seguridad de seis
meses; «propone y una persona con sus permisos acepta» se audita en una tarde.

Lo que sí conviene llevarse de ese mundo el día de la venta: **poder elegir el
modelo**, para que un cliente use su proveedor y su clave. Es un cambio pequeño
porque toda la superficie vive en `gemini.client.ts`.

### Y una consecuencia para los planes de pago

Con los tres topes puestos —inventario, extractos y páginas de PDF— un mensaje
cuesta entre 8 000 y ~25 000 tokens **pase lo que pase**. Esa es la propiedad que
hace honesto un plan por mensajes: el peor caso se puede calcular y ponerle
precio. Si algún día hace falta más justicia, el paso natural no es cambiar de
modelo de negocio, es **cobrar como dos** el mensaje que lleva adjuntos.

---

## R9 — Que el análisis no se le escape nada (en cola, 2026-08-19)

> **Encargado y sin empezar.** Se escribe con el diseño hecho para que se pueda
> retomar sin volver a pensarlo, no como recordatorio.

### El hueco, dicho en una línea

**Se guarda mucho más de lo que se mide.** `TaskEvent` tiene ocho tipos y los
informes usan tres; `dueDate` solo se cruza con «ahora» y nunca con
`completedAt`; los checklists, los comentarios y las subtareas no entran en
ningún agregado. No hace falta capturar nada nuevo para responder el doble de
preguntas — hace falta cruzar lo que ya está.

### 9.1 — Lo que ya está guardado y nadie mira

| Dato | Pregunta que contesta | Hoy |
|---|---|---|
| `REOPENED` | **Retrabajo**: qué porcentaje de lo cerrado se vuelve a abrir | Nada |
| `PRIORITY_CHANGED` | **Volatilidad**: tareas cuya prioridad baila = requisitos poco claros | Nada |
| `ASSIGNED` / `UNASSIGNED` | **Rotación**: una tarea que pasó por cuatro manos | Nada |
| `createdAt` → primer `ASSIGNED` | **Tiempo hasta que alguien la coge** | Nada |
| `dueDate` × `completedAt` | **Cumplimiento**: qué porcentaje llegó a tiempo, y con cuánto retraso | Solo `overdue`, que mira las **abiertas** de ahora |
| `MOVED` consecutivos | **Tiempo por columna**: dónde se va el tiempo, no solo cuánto | Solo el total (`cycle-time`) |
| `Checklist` | Avance interno como indicador **adelantado** del cierre | Solo dos totales en el resumen |
| `TaskComment` | Tareas con mucha conversación = fricción o ambigüedad | Nada |
| `parentTaskId` | Profundidad de descomposición | Nada |

⚠️ **El más valioso de la tabla es «tiempo por columna».** El tiempo de ciclo
dice cuánto tarda una tarea; no dice **dónde** espera. Un equipo que tarda doce
días de los que nueve son «En revisión» tiene un problema concreto y accionable;
el número de hoy solo dice «doce».

### 9.2 — Cruces que hoy no se pueden pedir

- **WIP contra throughput** (ley de Little). Con los dos en la misma serie se ve
  venir el atasco: cuando el trabajo en curso crece más rápido que el ritmo de
  cierre, el tiempo de ciclo va a subir **antes de que suba**.
- **Envejecimiento del trabajo en curso.** Para cada tarea abierta, días en su
  columna actual contra la distribución histórica de esa columna. Es
  estrictamente mejor que `blocked`, que usa un umbral fijo igual para todas.
- **Mezcla de trabajo en el tiempo**: qué proporción del esfuerzo va a cada
  etiqueta, semana a semana.
- **Dos dimensiones a la vez.** R4.3 lo dejó fuera a propósito —«de lo de
  frontend, cuánto es urgente» es una pregunta de dos dimensiones sobre un
  gráfico que tiene una— y es justo lo que hay que resolver aquí: un eje de
  **agrupar por** y otro de **partir por**.

### 9.3 — Formas de dibujo que faltan

Hoy son cinco y todas sirven para «una categoría, un número» o «una serie».
Faltan las que responden a otra clase de pregunta:

| Forma | Para qué |
|---|---|
| **Histograma** | La distribución del tiempo de ciclo. Un p50 y un p85 esconden si hay dos poblaciones |
| **Barras apiladas** | La mezcla, sin pasar por el área acumulada |
| **Barras divergentes** | Entradas contra cierres en el mismo eje |
| **Mapa de calor** | Persona × etiqueta, o día × hora de cierre |
| **Dispersión con percentiles** | Ya existe en `tiempos`, pero atada a ese informe y no al constructor |
| **Sparkline** | Dentro de las cifras del resumen: un número sin su tendencia no dice si va bien |

### 9.4 — Lo que el constructor debería aceptar y no acepta

`agruparPor` + `partirPor`, comparación con el periodo anterior, una línea de
objetivo, y acumulado contra por periodo. Cada uno multiplica el catálogo sin
añadir ni una consulta nueva.

### ⚠️ Cuatro trampas que ya se ven desde aquí

1. **El día natural miente.** Todo se cuenta en días de calendario, así que una
   tarea abierta un viernes por la tarde arrastra el fin de semana. Con
   distribuciones y percentiles eso deja de ser ruido y pasa a mover la mediana.
   Hay que decidir —y **decirlo en la pantalla**— si se cuentan días laborables.
2. **Esto sí puede pedir tablas en `reports-service`.** R4.8 se cerró sin ellas
   porque R4.2 y R4.4 agregan sobre lo que tasks ya tiene. «Tiempo por columna»
   por tarea y por día es una reconstrucción del historial entero en cada
   petición: ahí sí compensa materializar, y sería la primera migración de ese
   servicio (§25.6).
3. **`completedAt` solo existe desde que se captura el historial** (§25). Todo lo
   que se añada aquí hereda ese límite, y el que lo pinte tiene que decirlo — es
   la misma regla del recorte mudo.
4. **Más métricas es más prompt.** Cada una que entre en el briefing del
   asistente se paga en **cada turno** de **cada conversación**. Antes y después:
   `pnpm --filter @praxis/assistant-service medir-prompt <projectId>` (§43).

### Orden sugerido

R9.1 los eventos que ya están (retrabajo, rotación, volatilidad) → R9.2 tiempo
por columna, que es el que probablemente pide tabla → R9.3 las formas nuevas →
R9.4 las dos dimensiones en el constructor. Los tres primeros son valor por
separado; el cuarto solo luce con los anteriores puestos.

---

## R5 — Cierre

- [x] **R5.1 — Documentación.** ESTADO-ACTUAL con una sección por etapa,
      CONTRATO-API con las rutas y filtros nuevos, PENDIENTES-BACKEND con lo que
      quede fuera, y CLAUDE.md con el puerto y la zona nuevos.
- [x] **R5.2 — Formato y tipos.** `pnpm format`, typecheck de **las ocho zonas y
      los ocho servicios**, y `next build` de las ocho zonas. Todo en verde.
      ⚠️ El typecheck de una zona **con su `next dev` en marcha** da un falso
      positivo: `.next/dev/types/validator.ts` está a medias de regenerarse y
      falla con `TS1128`. Se para el dev server y desaparece.
- [x] **R5.3 — Verificación.** Corrida con el stack levantado, y es la
      **primera vez que la suite termina entera**: `190 passed, 5 failed` en
      32,5 min.
      Los cinco fallos eran **uno**, y preexistente: `crearProyectoEnLaInterfaz`
      buscaba el campo `{ name: 'Nombre', exact: true }` y el diálogo de nuevo
      proyecto se rediseñó en `dc06673` —el campo pasó a «Nombre del proyecto»—.
      Arreglado en `b927585` y verificados los tres ficheros afectados: 14 de 14.
      ⚠️ **No hay una corrida completa en verde de una sola pieza.** Lo que hay
      son 190 verdes de la primera y 14 verdes de la segunda, que cubren las 195.
      Volver a lanzarla entera son otros 32 min y se decidió no gastarlos. Queda
      dicho por lo de siempre: «pasa» no es lo mismo que «pasó junto».

---

## ⚠️ El incidente de la rama (2026-08-18)

Queda escrito porque volverá a pasar y cuesta media hora entenderlo.

A media tarea alguien hizo `git checkout main` sobre este mismo árbol de trabajo.
Durante un rato estuve editando archivos **sobre `main`**, no sobre la rama, y al
volver parecía que se había perdido todo: `git log` no mostraba ninguno de los
commits y los archivos modificados habían «vuelto atrás».

Lo que había pasado de verdad:

1. Los commits estaban intactos en `feature/rediseno-panel-admin-analisis`. El
   `reflog` lo dijo en la primera línea (`checkout: moving from … to main`).
2. Los archivos **sin seguimiento** (una zona nueva entera, por ejemplo)
   sobreviven a un `checkout`, así que el trabajo nuevo seguía ahí.
3. Los cambios sobre archivos **ya seguidos** sí se perdieron, y hubo que
   reaplicarlos.
4. Y un commit hecho desde fuera (`3c34162`) **capturó de rebote lo que estaba en
   el índice**: los `git mv` de `AssistantChat` y `assistant.ts` a `commons`
   estaban preparados, así que se los llevó — pero sin los arreglos de imports,
   que estaban sin preparar. La rama quedó un rato sin compilar por eso.

**Lo que hay que hacer si vuelve a pasar:** `git reflog` antes que nada, volver a
la rama, y comprobar qué sobrevivió con `git status` **antes** de reescribir
nada. Y no dar por perdido lo que no esté en `git log`.

---

## Traspaso — lo que hay que saber para seguir

> Escrito al desplegar por primera vez esta rama. Si retomas esto sin haber
> estado en la sesión anterior, empieza aquí.

### Lo que está hecho y lo que no

| Etapa | Estado |
|---|---|
| R1 Panel · R2 Administración · R3 Asistente | Cerradas |
| **R6** PRAX sin proyecto + adjuntos con memoria | Cerrada |
| **R4** Análisis | Cerrada entera (R4.1 – R4.8) |
| R5 Cierre | Cerrada |
| R7 Caché de contexto | **Bloqueada**: la clave de Gemini está sin presupuesto |
| R8 Que el contexto deje de ser «todo» | Futuro, cuando exista un proyecto grande de verdad |

**Por dónde seguir:** nada de este plan. R7 espera a que la clave de Gemini
tenga presupuesto y R8 a que exista un proyecto grande de verdad. Lo que sí queda
suelto y no es de aquí: PENDIENTES-BACKEND §21 —los slugs reservados— que afecta
a `projects-front` y a `reports-front`.

### Cinco cosas que costaron encontrarse

1. **Todo lo que se le manda al modelo viaja en cada turno.** Antes de tocar el
   briefing, las herramientas o las reglas:
   `pnpm --filter @praxis/assistant-service medir-prompt <projectId>`. Está
   escrito para eso y trae el desglose por bloque. Los números de referencia
   están en ESTADO-ACTUAL §43.
2. **Un recorte mudo es peor que no recortar.** Si acotas algo que ve el modelo,
   el prompt tiene que decirlo (`tareasOmitidas`, «las cerradas vienen
   abreviadas», «el archivo continúa»). Un modelo al que le cortan la lista por
   detrás responde «esas son todas» con total seguridad, y esa respuesta suena
   igual de bien que la correcta.
3. **`pnpm e2e:regresion` gasta el limitador de login.** Crea 84 cuentas, cada
   una con su login, contra el mismo cubo de 10 por minuto y por IP que usa la
   persona que esté probando la aplicación. No la lances mientras alguien la está
   usando.
4. **La clave de Gemini puede estar viva y aun así devolver 429.** Si el mensaje
   habla de `spending cap`, no es el saldo: es el tope de gasto del proyecto en
   AI Studio y no se pasa esperando. `gemini.client.ts` distingue los dos casos.
5. **El árbol de trabajo puede traer cambios del usuario sin commitear.** Ha
   pasado dos veces. `git status` antes de nada, y si los hay, commitéalos aparte
   con su propio mensaje en vez de mezclarlos con lo tuyo.

### Lo que NO está verificado

🔴 **Nada del asistente se ha probado contra el modelo**: R6 entera —conversación
sin proyecto, adopción de foco, plantilla desde el chat, narración de imágenes— y
los recortes del prompt están comprobados en todo lo que no depende de Gemini
(migraciones aplicadas, extracción con archivos reales, presupuestos, typecheck,
`next build`, y el turno llegando hasta la llamada al modelo), pero **la
respuesta del modelo no se ha visto ni una vez**.

~~Y `pnpm e2e:regresion` **no se ha pasado**~~ — **hecho el 2026-08-19**, con la
máquina libre. Terminó entera por primera vez: `190 passed, 5 failed` en 32,5
min, y los cinco fallos eran uno solo y preexistente (el campo «Nombre» del
diálogo de proyecto, arreglado en `b927585` y reverificado). Sigue sin haber una
corrida completa en verde **de una sola pieza**: son 190 de la primera más 14 de
la segunda.

Lo que sigue sin verificarse contra el modelo es todo lo del asistente, que
depende de la clave de Gemini.

---

## Cómo retomar esto en frío

1. Leer «Dónde estamos», «Decisiones cerradas» e «Invariantes».
2. `git log --oneline` en `feature/rediseno-panel-admin-analisis`: hay un commit
   por tarea y el mensaje lleva el código (`R1.4`, `R2.1`…).
3. Seguir por la primera casilla sin marcar **en el orden de ejecución de la
   tabla de arriba**, que no es el orden del documento: R6 va antes que R4.
4. Al terminar una tarea: marcarla, añadir la fila al registro de avance y
   commitear.
