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
| **Reports Service** | `3005` | Agregación, estadística y predicción sobre proyectos y tareas. **No tiene base de datos propia.** | — |

> ⚠️ **Corrección:** esta tabla listaba en el `3005` un «Notifications Service»
> que **nunca existió**. Las notificaciones se implementaron dentro de
> `projects-service` (comandos `notification_*`), que es donde ya vivían las
> membresías e invitaciones —cinco de los siete tipos de aviso—. El puerto estaba
> libre y lo ocupa `reports-service` desde esta sesión.
>
> Los enlaces de esta tabla apuntan a rutas absolutas de la máquina de otra
> persona (`c:/Users/cesar/...`) y no funcionan desde ningún otro sitio; se
> dejan como estaban para no tocar lo que no toca a esta sesión.

---

## Consideraciones Generales

1. **Protocolo TCP**: Todos los servicios se comunican utilizando el transporte TCP integrado de NestJS.
2. **DTOs Compartidos**: Las validaciones y esquemas de los payloads de entrada están definidos en el paquete global `@praxis/contracts`.
3. **Caché con Redis**: Los servicios emplean Redis para almacenar información de alta consulta (roles, sesiones, información frecuente de proyectos/tareas) con el fin de disminuir la latencia y la carga en la base de datos PostgreSQL.
