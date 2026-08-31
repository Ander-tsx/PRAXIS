# Plan de las cuotas — que las letras pequeñas las comprueba alguien

> Etapa abierta el 2026-08-28 sobre `feature/enterprise-cuotas`, a partir de
> [ENCARGO-ENTERPRISE.md](frontend/ENCARGO-ENTERPRISE.md). Se lee al retomar y se
> marca al terminar cada tarea.
>
> 📍 **Vive en `docs/` y no en `docs/frontend/`**, por lo mismo que
> [PLAN-ORGANIZACION-ACTIVA.md](PLAN-ORGANIZACION-ACTIVA.md): casi todo lo que
> hace es backend, y meterlo bajo `frontend/` haría que quien busque por qué un
> adjunto empezó a dar 402 no lo encuentre nunca.
>
> ⚠️ **Toca el backend, y CLAUDE.md dice que el backend es de otro equipo.** Es
> la misma excepción que abrió la etapa anterior el 2026-08-28, y por el mismo
> motivo: una cuota es una regla de negocio y no se puede aproximar desde la
> pantalla sin mentir.

---

## Por qué existe esta etapa, si el encargo Enterprise «ya está hecho»

Porque está hecho **de tres de sus seis cuotas**, y las otras tres no las
comprueba nadie.

El encargo de planes y Enterprise se construyó en tres etapas —`PLAN-ENTERPRISE`
(deprecada), `PLAN-ORGANIZACIONES` y `PLAN-ORGANIZACION-ACTIVA`— y lo que pidió
el dueño del producto está casi entero: cuatro planes, Stripe con checkout
alojado y portal, el mes gratis del primer peldaño de pago aplicado por
`trial_period_days`, la organización como unidad que paga, sus papeles, sus
asientos y su portal de gestión.

Lo que se retomó en frío el 2026-08-28 y **no** estaba es esto:

| Cuota del catálogo | ¿Quién la comprueba? |
|---|---|
| `proyectos` | `QuotaService.exigirProyecto` ✅ |
| `asientos` | `billing_org_invite`, 409 sin asiento ✅ |
| `iaMensualPorPersona` | assistant-service con el tope que le baja el gateway ✅ |
| `automatizacionesPorProyecto` | 🔴 **nadie** |
| `almacenamientoOrgMb` | 🔴 **nadie** |
| `historialAnalisisDias` | 🔴 **nadie** |

🔴 **Es exactamente el fallo que la etapa anterior encontró con
`organizacionesPropias`**: el número escrito en los cuatro planes, el mensaje de
error escrito en `MENSAJES`, el `QuotaKind` declarado — y ni una línea que lo
invoque. Se verificó con `grep` sobre todo `apps/`: `automatizacionesPorProyecto`,
`almacenamientoOrgMb` e `historialAnalisisDias` **no aparecen fuera de
`plans.ts`**.

Que no sea un fallo visible es lo que lo hace caro: la tabla de precios promete
tres topes que el servidor no aplica, así que el plan de pago vale menos de lo
que dice y el gratuito da más de lo que dice. Nadie se queja de una cuota que no
se aplica — se queja el día que se aplica.

Y hay una cuarta cosa, que es la **trampa 4 del encargo** y sigue sin decidirse:
*«bajar de plan con más proyectos de los que el plan permite es el caso que nadie
diseña y todos sufren»*.

---

## Decisiones cerradas

### D1 — Una cuota que no se comprueba se comprueba o se borra del catálogo

No hay tercera opción. Un número en la tabla de precios que el servidor no aplica
es una promesa incumplida en la dirección cara: se descubre cuando alguien la
usa. Las tres se comprueban.

### D2 — Las automatizaciones se cuentan **activas**, y el tope se toca al activar

`automatizacionesPorProyecto` dice «reglas activas en un proyecto. Las pausadas
no cuentan», y eso decide dónde va el guard: **no al crear una regla**, sino al
dejarla en `ENABLED`.

**Por qué importa la diferencia:** si el tope se aplicara al crear, alguien con
el cupo lleno no podría ni redactar una regla para tenerla lista, y la salida que
ofrece el mensaje —«pausa una»— no serviría de nada, porque la pausada seguiría
ocupando. Con el guard en la activación, pausar **libera de verdad** y el mensaje
dice la verdad.

⚠️ **Se comprueba en dos sitios y hay que acordarse de los dos**: crear con
`status: ENABLED` y actualizar una que estaba pausada. El segundo es la puerta
trasera que se olvida — es el mismo patrón que `cabenEn` con las invitaciones.

### D3 — El almacenamiento se mide por organización y se cobra al subir

`almacenamientoOrgMb` es de la organización, no del proyecto ni de la persona: es
lo que suma todo lo que hay dentro. Se comprueba **antes de guardar**, con el
tamaño real del archivo que ya está medido en el servidor (`file.size`), no con
uno declarado por el cliente.

**Se cuenta lo que ocupa, no lo que se subió alguna vez.** Borrar un adjunto
libera espacio, igual que borrar un proyecto libera un hueco de proyecto. Cobrar
por lo borrado es la clase de cuota que parece una avería.

⚠️ **El sumatorio no lo puede hacer billing-service**, que no tiene los adjuntos,
ni tasks-service, que no sabe de organizaciones. Lo compone el **gateway**, que
es el único que habla con los dos: pide los proyectos de la organización a
projects-service y la suma de bytes de esos proyectos a tasks-service. Es la
misma resolución que ya hace `exigirProyecto`, y la misma regla de arquitectura
que fijó B7 de la etapa anterior — **no se añade una dependencia entre
microservicios que hoy no existe**.

### D4 — El historial de Análisis no niega nada: recorta, y lo dice

🔴 **Es la única de las tres que no lanza 402, y es a propósito.** Las otras dos
acotan una **escritura**; esta acota una **lectura**. Devolver un 402 al abrir un
informe convertiría una pantalla de consulta en un muro de pago a media sesión,
y no hay nada que la persona pueda hacer distinto: no es que se haya pasado, es
que preguntó por más atrás de lo que su plan alcanza.

Así que se recorta el `from` al tope del plan y **se devuelve el recorte en la
respuesta**, para que la pantalla lo escriba.

⚠️ **Un recorte mudo es peor que no recortar** (CLAUDE.md, y `tareasOmitidas`
existe por esto mismo). Un gráfico que empieza noventa días atrás sin explicar
por qué se lee como un dato incompleto, no como un plan — y quien lo lea va a
sacar conclusiones de una serie que cree completa.

### D5 — Pasarse de plan hacia abajo no borra nada, y se dice en la pantalla

La trampa 4 del encargo, decidida: **nada se borra, nada se archiva y nada se
bloquea que no estuviera ya bloqueado.**

Lo que pasa al bajar de `BUSINESS` (150 proyectos) a `TEAM` (25) con 40 dentro es
que `cabe(40, 25)` es `false`, así que **no se puede crear el 41**, exactamente
como si se hubiera llegado al tope por arriba. Los 40 siguen ahí, se abren, se
editan y se borran.

Lo que falta y añade esta etapa es **decirlo**: el resumen de facturación pasa a
marcar qué topes están por encima y por cuánto, para que quien administra lo vea
antes de descubrirlo pulsando un botón que no responde.

**Por qué no se bloquea la escritura de los 40:** porque la organización pagó por
tenerlos y el que baja de plan suele ser quien menos culpa tiene del volumen.
Congelar cuarenta proyectos por una tarjeta caducada es la forma más rápida de
que un cliente se vaya con sus datos dentro.

**Y por qué no se archivan solos:** archivar es elegir a quién se le apaga el
trabajo, y eso no lo puede decidir un webhook. Es la misma regla que D7 de
`PLAN-ENTERPRISE`, que ya la fijó para los asientos.

---

## Invariantes — lo que esto NO puede romper

### I1 — El fallo va hacia el lado permisivo, y se registra

Si no se puede **contar**, se deja pasar y se escribe un `error` en el log.
Negar una escritura por no haber podido preguntar es un falso positivo que quien
lo sufre no puede resolver de ninguna manera. Un adjunto de más se borra; un
adjunto que no se pudo subir sin motivo, no se recupera.

⚠️ **La excepción es el plan.** Si billing-service no contesta, `planDe` sigue
devolviendo FREE: un fallo no puede regalar el plan más caro. Las dos reglas
conviven porque miran cosas distintas — el tope se falla hacia abajo, el conteo
hacia arriba.

### I2 — Ninguna decisión de servidor lee la cookie `praxis_org`

Sigue valiendo entera. La organización de un adjunto se deriva del **proyecto de
la tarea**, y la de una automatización, del **proyecto de la regla**. Ninguna de
las dos rutas acepta un `organizationId` del cliente, así que ni siquiera hay
nada que validar.

### I3 — El tope se comprueba en el gateway

La quinta trampa del encargo, literal. La pantalla apaga botones y avisa antes de
gastar el viaje; quien decide es el servidor.

### I4 — Los números salen de `plans.ts` y de ningún otro sitio

Ni un `< 25` suelto. Todo pasa por `cabe()`, que es lo que hace que `SIN_TOPE`
—que es `null`— no se comporte como el plan más restrictivo de todos.

---

## Los stacks, en orden

| Stack | Qué | Estado |
|---|---|---|
| Q1 | **Automatizaciones** — `automation_rule_active_count`, `exigirAutomatizacion`, y el guard en las dos puertas | ✅ |
| Q2 | **Almacenamiento** — `attachment_bytes_of_projects`, `exigirAlmacenamiento`, y el guard al subir | ✅ |
| Q3 | **Historial de Análisis** — el recorte de `days`/`weeks`/`from`, y la pantalla diciéndolo | ✅ |
| Q4 | **Pasarse hacia abajo** — el resumen marca lo excedido, y la pantalla lo dibuja | ✅ |
| Q5 | Documentación: `CLAUDE.md`, contrato y este plan | ✅ |
| Q6 | **Regresión entera** (`pnpm e2e:regresion`) — no corrida, ver abajo | ⬜ |
| Q7 | Repaso visual de las dos tarjetas nuevas, en claro y en oscuro | ⬜ |

### Lo que sí se ha comprobado, y lo que no

✅ **Compila entero**: `tsc --noEmit` limpio en gateway, tasks, automation,
reports y billing, y en las **siete zonas**. `next build` verde en
`dashboard-front` y en `reports-front`.

✅ **Las unitarias, verdes**: las 16 tareas, con 10 pruebas nuevas —cuatro en el
controlador de automatizaciones y seis sobre `excedidasDe`—.

✅ **`biome check` sin un hallazgo nuevo** sobre la línea base de cada fichero
tocado. Los que quedan ya estaban.

⬜ **La regresión de punta a punta no se ha corrido, y no se espera rojo.** Se
revisó a mano dónde podría salir uno:

- `17-automatizaciones` es la única suite que roza el tope de 3 activas de FREE.
  No lo toca: su bloque largo de rechazos crea las reglas **sin `status`**, y las
  reglas nacen `DISABLED`, así que no gastan cupo. Los dos tests que sí piden
  `ENABLED` se hacen su propio `crearMundo`, con una regla activa cada uno.
- Ninguna prueba pide más historial del que da su plan, ni sube adjuntos cerca de
  los 200 MB de FREE.

Aun así hay que correrla: lo de arriba es lectura del código, no ejecución.

⬜ **Nada de esto se ha visto contra el stack levantado.** Los cuatro topes se
comprobaron por tipos y por unitarias, no pulsando.

---

## Registro

| Fecha | Stack | Commit | Qué entró |
|---|---|---|---|
| 2026-08-28 | Q1+Q2 | `6562126` | El tope de automatizaciones activas, con sus dos puertas, y el almacén de adjuntos de la organización compuesto en el gateway |
| 2026-08-28 | Q3 | `8b92953` | El historial de Análisis recortado al plan en las once rutas —menos el `days` de `blocked`— y el aviso encima del lienzo |
| 2026-08-28 | Q4 | `a85922f` | `excedidas[]` en el resumen y la tarjeta de topes rebasados, con la trampa 4 del encargo decidida |
| 2026-08-28 | Q5 | (este) | `CLAUDE.md` con dos trampas nuevas, el contrato con las tres cuotas y `ventana` |
