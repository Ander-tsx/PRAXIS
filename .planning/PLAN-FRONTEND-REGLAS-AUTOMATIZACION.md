# Plan base — Frontend de Reglas de automatización académica

## Propósito

Completar la experiencia frontend del MVP académico con un apartado **Reglas** dentro de cada
proyecto. Permitirá definir automatizaciones mediante trigger, condiciones y acciones de forma
parecida a las reglas de GitHub, manteniendo el catálogo y los límites que el backend ya soporta.

Este documento establece alcance, capacidades y criterios de aceptación. Deliberadamente no
prescribe archivos, componentes concretos ni una secuencia técnica cerrada.

## Estado de partida

El frontend ya tiene una integración mínima con el servicio:

- consulta las reglas del proyecto;
- permite habilitarlas y deshabilitarlas;
- ofrece la revisión manual «Revisar ahora»;
- muestra ejecuciones recientes;
- reconoce y presenta los avisos académicos resultantes;
- cuenta con rutas, tipos de dominio y acciones para ese flujo resumido.

La brecha principal es la administración completa de definiciones. No existe todavía una
experiencia dedicada para crear, editar y eliminar reglas detallando trigger, condiciones y
acciones.

## Objetivo funcional

Una persona con `canManageAutomations` podrá entrar al apartado **Reglas** de un proyecto,
comprender qué automatizaciones existen, crear o modificar una definición válida, controlar su
estado, revisar el proyecto manualmente y consultar el resultado reciente.

La definición se entenderá siempre como:

1. **Cuando** ocurre o se detecta un trigger.
2. **Si** se cumplen todas las condiciones configuradas.
3. **Entonces** se ejecutan las acciones declaradas.

## Alcance incluido

- Acceso al apartado Reglas desde el contexto del proyecto.
- Listado de reglas con nombre, estado y resumen legible de su definición.
- Creación y edición de una regla académica.
- Habilitación y deshabilitación desde el listado o el detalle.
- Eliminación con confirmación explícita.
- Constructor guiado dividido en trigger, condiciones y acciones.
- Validación antes de enviar y presentación clara de errores del contrato.
- Revisión manual del proyecto.
- Consulta de ejecuciones recientes y su resultado básico.
- Estados de carga, vacío, éxito, error, falta de permiso y proyecto suspendido.
- Compatibilidad con tema claro/oscuro, teclado y tamaños de pantalla habituales.

## Alcance excluido

- Editor visual de nodos, drag-and-drop o diagramas de flujo.
- Grupos `OR`, condiciones anidadas o expresiones libres.
- Opciones fuera del catálogo académico vigente.
- Programación horaria, cron o ejecución automática en segundo plano.
- Integraciones externas como GitHub.
- Dead-letter, replay, retry manual o administración avanzada de fallos.
- Métricas, analítica histórica o exportación de auditoría.
- Cambios al contrato backend salvo que se acuerden como una tarea independiente.

## Catálogo que debe representar la interfaz

- Tarea próxima a vencer.
- Tarea estancada.
- Condiciones compatibles con el trigger seleccionado, combinadas por `AND`.
- Operadores y tipos de valor admitidos por el contrato vigente.
- Creación de aviso con el destinatario definido por cada trigger.

La interfaz debe utilizar nombres y explicaciones comprensibles; los identificadores técnicos se
mantienen como parte del contrato, no como texto principal para la persona usuaria.

## Bloques de trabajo

### 1. Base de producto y contrato

- Alinear el vocabulario de Reglas con el catálogo académico.
- Definir estados visibles y restricciones por permiso y estado del proyecto.
- Establecer la forma de resumir reglas y ejecuciones.

**Resultado:** alcance de interfaz coherente con el backend existente.

### 2. Acceso y vista general de Reglas

- Incorporar el apartado dentro de la navegación del proyecto.
- Presentar listado, estado vacío, controles principales y resumen de cada regla.
- Mantener disponibles la revisión manual y la auditoría reciente.

**Resultado:** una persona puede localizar, entender y operar las reglas existentes.

### 3. Definición guiada de una regla

- Ofrecer creación y edición organizadas en trigger, condiciones y acciones.
- Adaptar las opciones disponibles al trigger elegido.
- Evitar combinaciones que el contrato rechazaría y explicar sus restricciones.

**Resultado:** una regla válida puede definirse sin conocer los identificadores internos.

### 4. Ciclo de vida

- Cubrir creación, actualización, habilitación, deshabilitación y eliminación.
- Confirmar resultados contra los datos devueltos por la API.
- Mantener la vista sincronizada después de cada operación.

**Resultado:** el ciclo de vida completo se administra desde Reglas.

### 5. Revisión y auditoría

- Comunicar el resultado de «Revisar ahora» de forma comprensible.
- Mostrar ejecuciones recientes, incluidos éxito, omisión y fallo.
- Relacionar la ejecución con la regla sin exponer complejidad fuera del MVP.

**Resultado:** la demostración permite comprobar qué ocurrió.

### 6. Calidad de experiencia

- Completar estados de interacción, accesibilidad, respuesta visual y mensajes de error.
- Verificar tema claro/oscuro y comportamiento responsive.
- Evitar pérdida accidental de cambios durante la edición.

**Resultado:** experiencia estable y presentable para el proyecto escolar.

### 7. Validación y demo

- Probar los flujos principales y las restricciones del formulario.
- Validar permisos, suspensión y errores del servicio.
- Ensayar un vencimiento próximo y una tarea estancada con datos preparados.

**Resultado:** apartado listo para demostrarse de punta a punta.

## Criterios de aceptación

- El apartado se llama **Reglas** y se entiende sin documentación técnica.
- Solo aparece operativo para quien tiene `canManageAutomations`.
- Se puede crear y editar cada uno de los dos tipos de regla del MVP.
- Las condiciones y el tipo de sus valores corresponden al trigger.
- La interfaz comunica que todas las condiciones se cumplen mediante `AND`.
- No se envían campos que el DTO no declare.
- Habilitar, deshabilitar y eliminar producen un resultado visible y verificable.
- «Revisar ahora» muestra su resumen y no duplica avisos para la misma causa.
- Las ejecuciones recientes permiten identificar regla, estado y momento.
- Permisos, suspensión, validación y ejecución tienen mensajes diferenciados.
- Los flujos críticos cuentan con verificación automatizada proporcional al MVP.

## Dependencias y riesgos

- El catálogo del frontend depende del contrato académico vigente; ampliarlo requiere coordinación
  con backend.
- La revisión es manual y debe explicarse como decisión del MVP, no como automatización continua.
- La auditoría es básica y no debe presentarse como observabilidad completa.
- Una experiencia demasiado genérica sugeriría capacidades inexistentes; el constructor debe
  permanecer guiado por el catálogo.
- Cambios concurrentes o reglas invalidadas necesitan una recuperación comprensible sin perder
  silenciosamente lo editado.

## Entregables esperados

- Apartado Reglas integrado al proyecto.
- Listado y detalle/edición guiada.
- Ciclo de vida completo de reglas.
- Revisión manual y ejecuciones recientes.
- Validaciones, estados y mensajes de la experiencia.
- Pruebas focales y un guion breve de demostración.
- Actualización de la documentación viva del frontend al finalizar.

## Uso de este plan

Cada bloque puede convertirse en una tarea o checkpoint independiente. Antes de implementarlo se
concretan sus decisiones visuales y técnicas con el estado real del repositorio; este plan sirve
como base de alcance y no sustituye ese diseño puntual.
