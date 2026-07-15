# Ejemplos de Endpoints de Microservicios — Praxis

En este directorio se encuentran los archivos de ejemplo detallados para cada uno de los microservicios del ecosistema Praxis. Cada archivo detalla el MessagePattern TCP, la descripción del endpoint, el DTO de entrada esperado con un ejemplo de payload JSON, la respuesta JSON y el comportamiento con respecto a bases de datos y caché en Redis.

---

## Índice de Microservicios

| Servicio | Puerto TCP | Descripción Breve | Enlace de Ejemplos |
|---|---|---|---|
| **Credentials Service** | `3001` | Identidad, credenciales de acceso, perfiles de usuario y sesiones. | [credentials-service.md](file:///c:/Users/cesar/OneDrive/Documentos/utez/9no/ulises/PRAXIS/docs/backend/examples/credentials-service.md) |
| **Roles Service** | `3002` | Roles globales del sistema y permisos de vista de proyectos. | [roles-service.md](file:///c:/Users/cesar/OneDrive/Documentos/utez/9no/ulises/PRAXIS/docs/backend/examples/roles-service.md) |
| **Projects Service** | `3003` | Proyectos, workspaces, boards, columnas, miembros y roles locales. | [projects-service.md](file:///c:/Users/cesar/OneDrive/Documentos/utez/9no/ulises/PRAXIS/docs/backend/examples/projects-service.md) |
| **Tasks Service** | `3004` | Tareas, subtareas y listas de control (checklists) en boards. | [tasks-service.md](file:///c:/Users/cesar/OneDrive/Documentos/utez/9no/ulises/PRAXIS/docs/backend/examples/tasks-service.md) |
| **Notifications Service** | `3005` | Registro, lectura y recuento de notificaciones internas de usuarios. | [notifications-service.md](file:///c:/Users/cesar/OneDrive/Documentos/utez/9no/ulises/PRAXIS/docs/backend/examples/notifications-service.md) |

---

## Consideraciones Generales

1. **Protocolo TCP**: Todos los servicios se comunican utilizando el transporte TCP integrado de NestJS.
2. **DTOs Compartidos**: Las validaciones y esquemas de los payloads de entrada están definidos en el paquete global `@praxis/contracts`.
3. **Caché con Redis**: Los servicios emplean Redis para almacenar información de alta consulta (roles, sesiones, información frecuente de proyectos/tareas) con el fin de disminuir la latencia y la carga en la base de datos PostgreSQL.
