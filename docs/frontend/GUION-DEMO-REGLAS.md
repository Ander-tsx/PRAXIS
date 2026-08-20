# Guion de demostración — apartado «Reglas»

Qué sembrar, qué pulsar y qué debe verse. Recorre el apartado entero en unos
diez minutos, sin desviarse.

Sale del entregable «Pruebas focales y un guion breve de demostración» del
[plan base](../../.planning/PLAN-FRONTEND-REGLAS-AUTOMATIZACION.md), y de la
corrección C4 de [PLAN-CORRECCION-REGLAS.md](../../.planning/PLAN-CORRECCION-REGLAS.md).

---

## Antes de empezar

```bash
pnpm docker:up
pnpm dev:backend
pnpm dev:frontend
```

Con los seeds puestos (`pnpm prisma:seed`) y una cuenta con la que entrar.

⚠️ **Visita `/projects/<id>` una vez antes de la demostración.** En `next dev`
la primera visita a una ruta la compila sobre la marcha, y son decenas de
segundos con público delante. Las pruebas hacen justo esto en su `beforeAll`.

⚠️ **La revisión es manual a propósito.** No hay cron detrás del botón
«Revisar ahora» y no corre nada en segundo plano: es lo que hace que la
demostración sea determinista. Conviene decirlo en voz alta antes de pulsarlo,
porque es lo primero que alguien pregunta.

---

## Parte 1 — El apartado, vacío

1. Entrar a un proyecto propio y abrir la pestaña **Reglas**.
2. **Debe verse**: el estado vacío, que explica qué es una regla —«dice cuándo
   revisar, qué condiciones tienen que cumplirse y a quién avisar»— y no un
   «no hay nada» a secas. A la derecha, el panel de **Ejecuciones**, también
   vacío, con su frase sobre la revisión manual.

---

## Parte 2 — Crear una regla, con el lenguaje Cuando / Si / Entonces

3. Pulsar **«Nueva regla»**.
4. **Debe verse**: tres bloques con leyenda —**Cuando**, **Si**, **Entonces**—.
   Ese es el modelo mental entero del apartado, y conviene señalarlo.
5. Nombre: `Avisar vencimientos urgentes`.
6. En **Cuando**, dejar «Tarea próxima a vencer» y poner **4320** minutos de
   antelación (tres días).
7. En **Si**, pulsar **«Añadir condición»**. La fila nace con el primer campo
   del catálogo del trigger — «Prioridad» —. Elegir valor **Alta**.
   - **Debe verse**: encima de las filas, «Se tienen que cumplir todas — se
     combinan con Y, no con O». Es el criterio de aceptación sobre el `AND`, y
     no se adivina.
8. En **Entonces**: «Crear aviso: avisa a los responsables de la tarea».
   - **Señalar**: el destinatario **no se elige**, lo fija el trigger. Con el
     otro trigger cambia solo. Mandarlo desde el navegador daría 400.
9. Marcar **«Activar esta regla»**.
10. **«Crear regla»**.
11. **Debe verse** en la tarjeta: el nombre, la insignia **Activa**, y el
    resumen en español — «Cuando tarea próxima a vencer, si prioridad es Alta,
    entonces avisa a los responsables de la tarea.» Ni un identificador
    técnico.

---

## Parte 3 — Lo que la interfaz no deja hacer

Tres cosas rápidas que enseñan la validación y el catálogo.

12. **«Nueva regla»** y pulsar **«Crear regla»** con el nombre vacío.
    - **Debe verse**: «El nombre debe tener al menos 2 caracteres.», el campo
      marcado, y el diálogo **sin cerrarse**.
13. Escribir un nombre, añadir una condición, y cambiar el trigger a **«Tarea
    estancada»**.
    - **Debe verse**: un aviso preguntando antes de descartar las condiciones
      —pertenecen al catálogo del trigger anterior—. Al aceptar, las
      condiciones desaparecen y los campos de **Si** son otros: «Días parada»,
      «Vencida», «Sin historial». Y **Entonces** ya dice «avisa al dueño del
      proyecto».
14. Volver a **«Tarea próxima a vencer»**, añadir la condición «Número de
    responsables» **es igual a 0**.
    - **Debe verse**: un aviso en ámbar. Esa regla el servidor la acepta y
      **no coincide nunca**: las tareas sin responsables no entran a
      evaluación en ese trigger. Es exactamente el tipo de regla que se crea
      en una demostración y no hace nada sin decir por qué.
15. Pulsar **«Cancelar»**.
    - **Debe verse**: pregunta antes de descartar lo escrito.
    - ⚠️ Solo pregunta desde «Cancelar». Con `Esc` o la `X` cierra sin
      preguntar — limitación conocida y anotada en `RuleDialog.intentarCerrar`.

---

## Parte 4 — Revisar, y que la revisión se explique

Hace falta una tarea candidata. Con la regla de la parte 2 (`priority = HIGH`,
3 días de antelación):

16. Ir al tablero y crear una tarea con **fecha de vencimiento mañana**,
    **prioridad Alta** y **un responsable asignado**. Los tres hacen falta:
    sin responsables no entra a evaluación.
17. Volver a **Reglas** y pulsar **«Revisar ahora»**.
18. **Debe verse**: `1 regla revisada · 1 candidata · 1 aviso · 0 fallos`, y
    una fila nueva con la insignia **Avisó**, el resumen del contexto
    —«prioridad Alta, fecha de vencimiento …»— y la hora.
19. Pulsar **«Revisar ahora»** otra vez.
20. **Debe verse**: `1 regla revisada · 1 candidata · 0 avisos · 0 fallos`, y
    **la misma única fila**. No se duplica el aviso para la misma causa.
    Es el criterio de idempotencia, y se ve sin explicarlo.
21. Abrir la campana de avisos: está el aviso de la automatización, una sola
    vez.

Opcional, si hay tiempo: editar la regla y cambiar la condición a prioridad
**Baja**, revisar, y ver la fila **«No cumplía las condiciones»**. Enseña que
la auditoría distingue «no se cumplió» de «no había candidatas».

---

## Parte 5 — Ciclo de vida y permisos

22. **«Desactivar»** en la tarjeta. La insignia pasa a **Inactiva**. Volver a
    activarla.
23. **«Eliminar»**. Pide confirmación y dice que no se puede deshacer.
    Cancelar: la regla sigue ahí. Confirmar: desaparece.
24. Si hay a mano una cuenta miembro **sin** `canManageAutomations`: entrar con
    ella y abrir Reglas.
    - **Debe verse**: «No tienes permiso para administrar automatizaciones en
      este proyecto.» — y **no** el mensaje de suspensión, que es otro caso.

---

## Sobre «Tarea estancada»

⚠️ **El segundo trigger no se puede demostrar en vivo con datos recién
sembrados, y conviene saberlo antes de intentarlo.** El estancamiento se mide
contra el último evento de la tarea, y el mínimo del contrato es **un día**:
una tarea creada durante la demostración tiene cero días parada y nunca sale
candidata. Es el hueco 6 de
[PENDIENTES-BACKEND-AUTOMATIZACION.md](PENDIENTES-BACKEND-AUTOMATIZACION.md).

Dos formas de enseñarlo igualmente:

- **Lo que sí funciona en vivo**: crear la regla `TASK_STALE`, verla descrita
  —«Cuando tarea estancada, … entonces avisa al dueño del proyecto.»— y
  revisar: responde `1 regla revisada · 0 candidatas · 0 avisos · 0 fallos`,
  limpiamente. Enseña el catálogo del otro trigger y su destinatario propio,
  sin prometer un disparo que no va a ocurrir.
- **Con preparación previa**: envejecer una tarea en la base antes de la
  demostración. Comprobado así, dispara de punta a punta:

  ```
  RESUMEN: { rules: 1, candidates: 1, succeeded: 1, failed: 0 }
  EJECUCIÓN: SUCCEEDED, contexto { overdue: false, staleDays: 30, withoutHistory: false }
  AVISO: AUTOMATION_TASK_STALE sobre «Tarea que se quedó parada»
  ```

---

## Lo que este apartado no hace, por si preguntan

Ni `OR`, ni condiciones anidadas, ni programación horaria, ni integraciones
externas, ni reintento manual, ni métricas. Está en el alcance excluido del
plan base, y la interfaz no lo insinúa en ninguna parte.
