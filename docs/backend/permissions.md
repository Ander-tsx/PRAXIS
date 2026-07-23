# Sistema de permisos

El sistema tiene dos capas completamente independientes que no se mezclan entre sí.

---

## Capa 1 — Roles globales

Define qué puede hacer una persona dentro de la **plataforma completa**.

Solo existen dos roles:

| Rol | Descripción |
|---|---|
| `admin` | Puede ver y gestionar todos los proyectos, agregar o suspender usuarios, y asignar roles globales desde el panel de administración |
| `user` | Puede ver los proyectos a los que pertenece y trabajar dentro de ellos |

Todo usuario tiene siempre un rol global asignado. Al registrarse recibe `user` por defecto. Un admin puede cambiarlo desde el panel.

Este rol lo consulta el **gateway** antes de dejar pasar ciertas peticiones:

```
¿Quieres entrar al panel de administración?
→ Gateway pregunta a roles-service: ¿este userId tiene rol admin?
→ No → 403 Forbidden, la petición no llega al servicio
→ Sí → pasa
```

---

## Capa 2 — Roles internos de proyecto

Define qué puede hacer una persona dentro de **un proyecto específico**.

Estos roles los crea el administrador de cada proyecto (no el admin global). Ejemplos: Scrum Master, Dev, QA. Cada proyecto tiene sus propios roles y no se comparten entre proyectos.

A cada rol se le asignan permisos concretos:

| Permiso | Descripción |
|---|---|
| `canCreateTask` | Puede crear tareas |
| `canEditTask` | Puede editar tareas |
| `canDeleteTask` | Puede eliminar tareas |
| `canCreateBoard` | Puede crear tableros |
| `canEditBoard` | Puede editar tableros |
| `canDeleteBoard` | Puede eliminar tableros |
| `canCreateColumn` | Puede agregar columnas a un tablero |
| `canDeleteColumn` | Puede eliminar columnas |
| `canManageMembers` | Puede agregar o quitar personas del proyecto |
| `canManageRoles` | Puede crear roles y modificar sus permisos |

Los permisos se asignan por rol, no por persona. Si cambias el permiso de un rol, afecta a todos los miembros que tienen ese rol en ese proyecto.

---

## Cómo interactúan las dos capas

Son independientes. Tener rol `admin` global no otorga permisos dentro de un proyecto automáticamente. Un admin global que no es miembro de un proyecto no puede crear tareas ahí.

**Ejemplo:**

```
Persona A — rol global: admin
  └── Proyecto X — rol interno: Dev
        └── puede: canCreateTask, canEditTask
        └── no puede: canDeleteTask, canManageMembers

Persona B — rol global: user
  └── Proyecto X — rol interno: Scrum Master
        └── puede: todos los permisos excepto canManageRoles
  └── Proyecto Y — rol interno: Dev
        └── puede: canCreateTask solamente
```

---

## Flujo completo de una petición protegida

Ejemplo: **crear una tarea en un tablero**

```
1. Cliente envía:
   POST /api/tasks
   Authorization: Bearer <token>
   Body: { boardId, title, ... }

2. Gateway — JwtGuard
   → Verifica el token
   → Extrae userId del JWT

3. Gateway — ProjectPermissionGuard
   → Identifica qué proyecto contiene ese boardId
   → Pregunta a projects-service:
     "¿el userId tiene permiso canCreateTask en este proyecto?"
   → projects-service verifica:
       a. ¿Es miembro del proyecto? → sí
       b. ¿Qué rol interno tiene? → Dev
       c. ¿Dev tiene canCreateTask activo? → sí
   → Devuelve { allowed: true }

4. Gateway
   → allowed: true → reenvía la petición a tasks-service

5. tasks-service
   → Crea la tarea directamente, sin volver a verificar permisos
   → Devuelve la tarea creada al gateway → al cliente
```

Si en el paso 3 el usuario no es miembro del proyecto, o su rol no tiene el permiso requerido, el gateway devuelve `403 Forbidden` y la petición nunca llega a `tasks-service`.

---

## Dónde vive cada cosa en el código

```
roles-service
├── Roles globales: admin, user
└── Asignación de rol global a usuarios

projects-service/src/permissions/
├── Roles internos por proyecto (Scrum Master, Dev, QA...)
├── Permisos por rol (canCreateTask, canEditTask...)
├── Membresías (quién pertenece a qué proyecto con qué rol interno)
└── Verificación: dado userId + projectId + permiso → ¿allowed?

gateway/src/guards/
├── JwtGuard                 → verifica identidad en toda petición protegida
├── GlobalRoleGuard          → consulta roles-service (rutas del panel de admin)
└── ProjectPermissionGuard   → consulta projects-service (rutas de proyectos)
```

---

## Resumen de decisiones

- Todo usuario tiene siempre un rol global (`user` por defecto al registrarse)
- Los roles globales solo son dos y no son configurables
- Los roles internos son creados y configurados por el administrador de cada proyecto
- Los permisos internos se asignan por rol, nunca por persona individual
- Las dos capas son independientes — una no implica la otra
- La verificación de permisos ocurre siempre en el gateway, nunca dentro de los servicios de negocio