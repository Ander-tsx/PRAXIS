# Revisión de arquitectura, escalabilidad y seguridad

> **Documento de encargo para una sesión nueva.** No es un plan cerrado como
> [PLAN-PULIDO](frontend/PLAN-PULIDO.md): es una lista de preguntas abiertas, con
> el análisis que ya se hizo y las que ya se descartaron. Se lee entero antes de
> tocar nada.

---

## El encargo

Tu objetivo es que PRAXIS sea un producto **de primer nivel**: que aguante la
escala de una herramienta de trabajo real —del orden de Slack o Teams, a la
escala de este proyecto—, que sea eficiente, y que sea seguro.

Tienes permiso sobre **todo el proyecto**: frontend, backend, base de datos e
infraestructura. Puedes cambiar el modelo de datos, partir servicios, reescribir
consultas y tocar el despliegue.

### Y ahora las restricciones, que importan tanto como el permiso

Ese permiso es amplio a propósito, pero **no es una invitación a refactorizar por
intuición**. Cinco reglas, y las cinco salen de errores reales cometidos en la
sesión que escribió este documento:

1. **Medir antes de cambiar, siempre.** No «parece que», no «esto escala mal»:
   `EXPLAIN ANALYZE`, `PUBSUB NUMPAT`, un contador. En esa sesión, **dos de las
   primeras mediciones dieron el resultado contrario al verdadero** — una por un
   dato de prueba mal parametrizado y otra por conexiones zombis de Redis. Las
   dos habrían llevado a la conclusión opuesta con toda la autoridad de una
   herramienta.
2. **Verificar la prueba rompiendo el código a propósito.** Una prueba de tiempo
   real de esa sesión pasaba también con el sujeto roto. Una prueba que pasa con
   el código roto es peor que no tenerla: da por cubierto lo que no lo está.
3. **Un cambio por commit, y nada más dentro.** Un renombrado que viaja con una
   corrección hace imposible revisar ninguna de las dos.
4. **La regresión en verde antes y después.** `pnpm e2e:regresion` y
   `pnpm e2e:seguridad`. El marcador al cerrar esa sesión era **194 ✅ / 0 ❌**,
   14 `@security` ✅ y 44 unitarias de gateway ✅. Si bajas de ahí, has roto algo.
5. **No toques lo que no has medido.** El código de este repositorio está mejor
   de lo que aparenta y sus comentarios explican por qué está como está. Si algo
   parece raro, lo más probable es que el comentario de al lado cuente la razón.

### Dos convenciones que no se negocian

- **El backend lo desarrolla otro equipo.** CLAUDE.md dice: «nosotros consumimos
  lo que existe y documentamos lo que falta — no lo modificamos sin acordarlo».
  Tienes permiso para tocarlo, pero **cada cambio de backend se anota** en
  `docs/frontend/PENDIENTES-BACKEND.md`, en la sección «Cambios que hicimos en
  `apps/backend/`, con autorización». Esa sección existe justo para esto.
- **El código en inglés, los comentarios en español.** Es deliberado, está
  decidido y no se reabre. Los comentarios son la mitad del valor de este
  repositorio; traducirlos sería reescribirlos.

### Lo que falta para poder decidir

⚠️ **«Slack-tier» no es medible, y sin una cifra todas estas decisiones son
opinables.** Antes de empezar, pregunta al usuario:

- ¿Cuántas cuentas activas se esperan? ¿Y concurrentes?
- ¿Cuántos mensajes al día en el chat?
- ¿Cuántas instancias del backend en producción hoy, y hasta cuántas escala?

Sin esos números, varias de las revisiones de abajo no tienen respuesta correcta,
solo respuestas defendibles. **No te los inventes**: pídelos.

---

## 1. 🔴 Los bytes de los adjuntos viven en Postgres

**Lo más urgente de este documento, y lo más acotado.**

`ChatAttachmentBlob` guarda el contenido binario de cada adjunto del chat en una
tabla de Postgres. Eso infla las copias de seguridad, el WAL y la replicación, y
compite por el mismo pool de conexiones que se acaba de ajustar (`E2.1` del plan
de pulido subió `max_connections` a 150 y acotó los pools a 5).

**Está medio hecho ya:** la infraestructura tiene la variable `activar_gcs_chat`
y el arranque conmuta `storage_driver` entre `gcs` y `postgres`
(`infra/terraform/plantillas/arranque-backend.yaml`). El bucket se crea siempre
(`storage.tf`).

✅ **Avanzado el 17-08.** Se arregló que el proveedor de GCS **ignoraba el
`mimeType`** —guardaba todo como `application/octet-stream`, lo que rompe el
servido directo y el CORS— y se escribió el script de migración que faltaba
(`src/scripts/migrar-blobs.ts`), sin el cual cambiar el driver dejaría cada
adjunto ya subido en un 404 silencioso.

Qué queda: **ejecutarlo contra un bucket real**. Este proveedor está escrito y
**nunca se ha ejecutado contra GCS de verdad**, así que hay que revisarlo entero
al conectarlo, no solo lo ya corregido. El orden exacto de activación —migrar
primero, cambiar el driver después— está en el **punto 18 de
PENDIENTES-BACKEND**.

Es el corte que **más beneficio da por menos riesgo**: separa el dato que peor
encaja en una base transaccional sin tocar ninguna frontera de servicio.

---

## 2. ¿El chat merece su propio microservicio?

**Analizado en la sesión anterior. Conclusión: hoy no, y conviene saber por qué
antes de reabrirlo.**

El chat vive en `projects-service` (TCP 3003), con seis tablas en el esquema
`projects`: `ChatChannel`, `ChatChannelState`, `ChatMessage`, `ChatAttachment`,
`ChatAttachmentBlob` y `ChatReaction`.

**Lo que lo ata ahí no es la comodidad: es la autorización.** El reparto de cada
evento hace `JOIN` con `project_members` en la misma consulta y la misma base —
una sola sentencia con dos `LATERAL`, que es lo que dejó `e7c7c95`. Con un
`chat-service` aparte, cada evento pasa a ser una consulta local **más una
llamada TCP a projects** para pedir los miembros, multiplicado por el evento más
frecuente del sistema.

Y la salida obvia —cachear la lista de miembros— **ya se descartó, y con razón**:
abre una ventana en la que alguien a quien acaban de sacar de un proyecto sigue
recibiendo los mensajes del equipo. Es una fuga, no una latencia.

⚠️ **Si lo reabres, la pregunta no es «¿el chat tiene volumen propio?» —lo tiene—
sino «¿qué hacemos con la autorización?».** Cualquier propuesta que no responda a
eso está incompleta.

**Lo que sí conviene hacer ahora, sea cual sea la decisión:** preparar la costura.
Que `ChatService` no toque tablas de proyecto directamente sino a través de una
función acotada, para que el día que el volumen lo justifique el corte sea
mecánico en vez de una reescritura.

---

## 3. `reports-service` no tiene tablas propias

La asimetría interesante, y la contraria a la anterior: `reports-service` es un
servicio separado que **no tiene base de datos**. Solo agrega por TCP lo que le
sirven tasks y projects, y cachea en Redis.

O sea que el sistema tiene un servicio separado que quizá no necesitaba serlo,
mientras que el chat —que sí tiene volumen propio y creciente— comparte servicio
con la gestión de proyectos.

Merece revisarse con calma. No es un fallo: puede estar justificado por el coste
de CPU de la agregación, que sí conviene aislar. Pero la pregunta no consta
respondida en ningún documento.

---

## 4. Presencia y conexiones en vivo: qué es estado y dónde vive

El gateway mantiene en memoria un `Map` de oyentes SSE por usuario
(`NotificationsStreamService.oyentes`). Eso lo hace **estatal para el
enrutamiento de conexiones**: los eventos de una persona solo llegan a la
instancia a la que está conectada.

Tras el arreglo de la sesión anterior (un canal de Redis por persona en vez de
`psubscribe('avisos:*')`) eso ya no es un problema de escala — cada instancia
solo se suscribe a lo de su gente. Pero conviene revisar:

- Qué pasa con una instancia que se cae con conexiones abiertas. Hay caducidad en
  Redis como red de seguridad, pero no está medido cuánto tarda en notarse.
- Si el tope de 10 conexiones por cuenta (`SSE_MAX_CONEXIONES_POR_CUENTA`) es el
  número correcto con siete zonas, ahora que cruzar entre zonas abre una conexión
  nueva.

---

## 5. Reconexión del chat: hoy se recarga la conversación entera

Cuando una desconexión larga deja un hueco mayor que el tope de página, el panel
**no pega el trozo recibido**: recarga la conversación entera (`hasMoreAfter`, de
`32592f3`). Es correcto y no pierde nada, que era lo urgente.

Lo que queda es lo caro y está sin decidir: **Redis Streams con `Last-Event-ID`**
para replay exacto. Con eso, una reconexión reproduce solo lo que falta en vez de
recargarlo todo. Es la diferencia entre una app que se nota que se reconecta y
una que no.

Anotado como el «ideal» de E2.5 del plan de pulido.

---

## 6. El limitador de login cuenta por IP

`/auth/login` está limitado a 10 intentos por minuto **y por IP**. Eso:

- **castiga a quien comparte salida** — una oficina detrás de un NAT se bloquea
  entre sí;
- y **no frena el ataque real**, que es repartir intentos entre muchas IPs contra
  una sola cuenta.

Contar por cuenta —o por cuenta *y* por IP, con umbrales distintos— es lo
correcto. Está anotado en E1.7 del plan de pulido como mejora, no como
bloqueante.

⚠️ Hay una trampa al implementarlo, ya documentada: **una constante
`process.env.X` en el cuerpo de un módulo no ve el `.env`**, porque
`ConfigModule.forRoot()` carga al inicializar y los `import` se evalúan antes. Si
el valor se usa en un decorador (`@Throttle`), hay que resolverlo de otra forma.
Es la trampa 17 de CLAUDE.md.

---

## 7. Acuses de lectura por mensaje

Cerrado como **límite del producto** por decisión explícita del usuario, y
documentado como punto 25 de PENDIENTES-BACKEND. No se reabre sin motivo nuevo.

Resumen: `ChatChannelState` guarda un `lastReadAt` por (canal, persona), así que
dentro de un hilo no se puede saber si alguien leyó *esa respuesta*. El «visto»
se oculta ahí (`mostrarVisto={false}`) en vez de enseñar un dato que parecería
exacto y no lo sería.

Si algún día se retoma, la vía barata es un `lastReadAt` por (hilo, persona) —la
misma forma que ya existe, con `threadRootId` en vez de `channelId`— y no un
acuse por mensaje suelto. Depende del punto 20 de PENDIENTES-BACKEND.

---

## Lo que ya está hecho: no lo repitas

La sesión anterior cerró estas, con medición. Están en `PLAN-PULIDO.md` con el
detalle:

| | Antes | Ahora |
|---|---|---|
| Conexiones SSE por cuenta | sin tope — DoS trivial | 429 al pasar de 10 |
| Fan-out de eventos | `psubscribe('avisos:*')`: cada instancia recibía **todo de todos** | un canal por persona · `NUMPAT` 1 → **0** |
| Contar no leídos | O(historial del canal) | O(sin leer) — 817→109 buffers, 3,96→0,73 ms |
| Perfiles en Análisis | una petición por persona | una sola, con `resolverPerfiles` |
| Miembros en el asistente | una llamada TCP por miembro | `user_find_by_ids` |
| Promesas sueltas | 3 sitios donde un rechazo mataba el proceso | blindadas |
| Pool de Cloud SQL | `max_connections = 25` | 150, aplicado en producción |

---

## 🔴 El despliegue sirve dos versiones a la vez, y eso se nota

Verificado en producción el 18-08. Un `rolling-action replace` con
`--max-unavailable 0` **no corta el servicio**, pero durante varios minutos hay
**dos máquinas del grupo recibiendo tráfico**: la nueva y la vieja. El
balanceador reparte entre las dos, así que una misma persona ve respuestas de
las dos versiones alternándose.

Lo que se vio: el chat en producción **sin conversaciones, sin chats de grupo y
fallando al enviar**, de forma intermitente. No era un fallo del código —el
backend nuevo respondía correctamente a todo— sino que aproximadamente la mitad
de las peticiones iban a la imagen anterior, que no tenía esos cambios.

⚠️ **Se diagnostica mal con facilidad.** El síntoma parece un fallo de la
versión nueva, y lleva a buscar en el código recién desplegado. Lo que lo
descarta en un minuto es preguntar al balanceador **cuántas instancias está
sirviendo**:

```
gcloud compute backend-services get-health praxis-backend-servicio --region us-east1
gcloud compute instance-groups managed describe praxis-backend-us-east1 \
  --region us-east1 --format='value(status.isStable)'
```

Con `isStable=False` hay dos versiones vivas y **no se puede concluir nada** de
lo que se vea en la aplicación. Hay que esperar.

**Lo que merece decidirse**, y no está decidido: si esa inconsistencia es
aceptable. Para un cambio de estilos lo es; para uno que añade rutas o cambia el
contrato del chat, significa que durante el despliegue hay usuarios viendo una
aplicación rota. Las salidas habituales son desplegar con la versión anterior
todavía compatible, o aceptar una ventana corta de indisponibilidad real
(`--max-unavailable 1` con una sola instancia) a cambio de que nadie vea dos
versiones.

---

## Dos trampas de entorno que cuestan una hora si no las conoces

1. **Un servicio que no compila no se anuncia.** `pnpm dev:backend` sigue en pie
   con uno caído: el que falla imprime su `Found 1 error` una vez, entre el
   arranque de los otros siete, y no vuelve a quejarse. El síntoma aparece tres
   capas más allá, como un 500 del gateway. Antes de diagnosticar nada:
   `grep 'Found [0-9]* error' <log>` y comprobar que **los ocho** dicen cero.

2. **Matar el frontend con `pkill` corrompe `.next`.** Sale como **las 33 pruebas
   de interfaz en rojo a la vez**, incluidas las que no tienen nada que ver, y
   como rutas que devuelven 404 aunque su archivo exista. Se sale parando por la
   tarea, borrando `apps/frontend/*/.next` y arrancando en frío. Y ojo:
   `pkill -f 'turbo run dev'` **se lleva también el backend**, porque los dos
   corren bajo turbo.

Las dos están documentadas como E1.8 y E1.9 en el plan de pulido.

---

## Cómo entregar

Al terminar cada revisión:

1. La medición, con el comando que la produjo. Un número sin su comando no es una
   medición.
2. El cambio, en su propio commit, en español y siguiendo Conventional Commits.
3. La prueba que lo fija — y la comprobación de que **falla** si rompes el código
   a propósito.
4. La anotación en `PENDIENTES-BACKEND.md` si tocaste `apps/backend/`.

Y si una revisión resulta no merecer la pena, **escríbelo igual**: «se analizó y
se descartó, por esto» vale tanto como un arreglo, y evita que la siguiente
sesión lo vuelva a analizar desde cero. Este documento existe en buena parte por
eso.
