# Praxis — Documento base de contexto del proyecto

> Este documento es la fuente de verdad del proyecto para el agente.
> Cualquier decisión técnica, organizacional o metodológica tomada aquí
> debe respetarse en todas las respuestas y sugerencias posteriores.
> No sugerir alternativas a las decisiones marcadas como cerradas
> salvo que se pida explícitamente.

---

## 1. Qué es Praxis

Praxis es una aplicación web de gestión de proyectos estilo Trello/Jira que permite a equipos administrar tableros Kanban, tareas, responsables, estimaciones de tiempo, costos y avance de trabajo.

Su característica central es un sistema de **privilegios dinámicos por módulo y acción**: el rol de un usuario es solo un perfil base. Lo que realmente puede ver y hacer depende de los permisos específicos asignados. Esta validación ocurre tanto en el frontend (menús y botones dinámicos) como en el backend (guards en cada endpoint).

---

## 2. Equipo

| Nombre | Rol en el equipo |
|---|---|
| Garcia Quiroz Gaspar Andres | Shaper principal / Líder técnico |
| Contreras Cortes Cesar Emilio | Builder — Backend / API |
| Diaz Barroso Juan Jose | Builder — Frontend / UI |
| Jimenez Ureña Angel Sebastian | Builder — Frontend / Kanban |
| Teja Carvajal Erick Humbert | Builder — Base de datos / Reportes |

---

## 3. Estructura del repositorio

```
praxis/
├── frontend/
│   └── ... /
├── backend/
│   └── api/                        # Un solo proyecto NestJS
│       └── src/
│           ├── auth/
│           ├── users/
│           ├── roles/
│           ├── privileges/
│           ├── projects/
│           ├── boards/
│           ├── tasks/
│           ├── costs/
│           ├── reports/
│           └── activity-log/
├── app-documentation/              # Documentación técnica y de producto
└── alexa-documentation/            # Documentación integración Alexa Skills
```

---

## 4. Decisiones de arquitectura — CERRADAS

Confirmadas con el profesor. No se cambian.

### Frontend

- **Un solo proyecto Next.js** organizado internamente como microfrontends por dominio.
- Cada módulo dentro de `src/modules/` es autónomo: tiene sus propias páginas, componentes, hooks y llamadas a API.
- El único estado compartido entre módulos es la sesión y los privilegios del usuario, manejado en el App Shell.
- No se usa Module Federation ni proyectos Next.js separados.
- Esto satisface el requisito de arquitectura SOFEA + Microfrontends del profesor.

### Backend

- **Un solo proyecto NestJS** organizado internamente como microservicios por dominio.
- Cada módulo dentro de `src/` tiene su propio controller, service y repository.
- Los módulos no se importan entre sí directamente salvo a través de sus interfaces públicas.
- Preparado para extraerse como servicios independientes si se requiere en el futuro.
- Esto satisface el requisito de arquitectura de Microservicios del profesor.

### Base de datos

- **PostgreSQL** — requisito obligatorio del profesor.
- Una sola instancia en desarrollo, con tablas separadas por dominio.
- En producción: AWS RDS.

---

## 5. Metodología

**Shape Up** con ciclos de **2 semanas de construcción + 1 semana de cool-down**.

- Los pitches se definen ciclo a ciclo, no todos de antemano.
- El cool-down sirve para revisar, integrar, corregir y shapear el siguiente ciclo.
- No hay backlog. No hay dailies obligatorios.
- Betting al inicio del ciclo. Review al final.
- El equipo completo participa en el betting. El shaper principal redacta los pitches.

### Ciclos proyectados

| Ciclo | Semanas | Contenido |
|---|---|---|
| Ciclo 1 | 1–2 + cool-down sem 3 | Bases completas: Auth, Roles, Privilegios dinámicos, Menú dinámico, CRUD Proyectos, CRUD Usuarios |
| Ciclo 2 | 4–5 + cool-down sem 6 | Tablero Kanban + Drag & Drop + Tareas completas |
| Ciclo 3 | 7–8 + cool-down sem 9 | Estimaciones + Costos + Presupuesto |
| Ciclo 4 | 10–11 + cool-down sem 12 | Dashboard + Reportes + Bitácora + Despliegue AWS |

> Los ciclos 2, 3 y 4 son proyección. Se definen formalmente en el cool-down del ciclo anterior.

---

## 6. Roles del sistema

| Rol | Descripción |
|---|---|
| Administrador | Configura proyectos, usuarios y permisos |
| Project Manager | Crea proyectos, asigna tareas y revisa costos |
| Colaborador | Actualiza tareas asignadas |
| Cliente / Observador | Consulta avances según permisos autorizados |

### Privilegios dinámicos principales

| Privilegio | Descripción |
|---|---|
| `proyecto:crear` | Iniciar nuevo proyecto |
| `proyecto:cerrar` | Finalizar proyecto |
| `tarea:crear` | Agregar tareas |
| `tarea:mover` | Cambiar estado en tablero |
| `tarea:asignar` | Definir responsable |
| `costos:ver` | Ver presupuesto y gastos |
| `reporte:exportar` | Descargar reporte en PDF |

---

## 7. Módulos del sistema

| Módulo | Descripción |
|---|---|
| Auth y Seguridad | Login, registro, sesiones, JWT, refresh token |
| Usuarios y Roles | Gestión de cuentas y perfiles base |
| Privilegios dinámicos | Permisos por módulo y acción, validados en frontend y backend |
| Proyectos | CRUD con estado, fechas y responsables |
| Tableros Kanban | Columnas To Do / Doing / Done con drag & drop |
| Tareas | Actividades con responsable, prioridad, estado y fecha |
| Estimaciones | Horas y costo estimado vs real por tarea |
| Costos | Presupuesto, costo por hora, gasto acumulado |
| Dashboard | Vista de avance según privilegios del usuario |
| Reportes | Desviación, productividad, exportación PDF |
| Bitácora | Registro de actividad: quién, qué, cuándo |

---

## 8. Stack tecnológico — CERRADO

### Obligatorio (definido por el profesor)

| Área | Tecnología |
|---|---|
| Frontend | Next.js + TypeScript + Tailwind CSS |
| Backend | NestJS + TypeORM |
| Base de datos | PostgreSQL |
| Arquitectura frontend | SOFEA + Microfrontends (módulos por dominio en un solo proyecto) |
| Arquitectura backend | Microservicios (módulos por dominio en un solo proyecto NestJS) |
| API Docs | Swagger / OpenAPI |
| Seguridad | JWT + guards de privilegios |

### Adoptado por el equipo

| Área | Tecnología | Para qué |
|---|---|---|
| Estado global | Redux Toolkit | Sesión del usuario y privilegios accesibles desde cualquier módulo |
| Peticiones HTTP | Axios | Llamadas a la API desde el frontend |
| Drag & Drop | @hello-pangea/dnd | Tablero Kanban |
| Contenedores | Docker + Docker Compose | Levantar PostgreSQL en desarrollo sin instalación local |
| Paquetes | pnpm | Gestor de paquetes |

---

## 9. Principios y patrones

### SOLID

| Principio | Aplicación en Praxis |
|---|---|
| S — Single Responsibility | Cada módulo NestJS tiene una sola responsabilidad de dominio |
| O — Open/Closed | Guards de permisos extensibles: nuevos privilegios sin modificar el guard base |
| L — Liskov Substitution | Repositorios TypeORM implementan interfaces; sustituibles por mocks en pruebas |
| I — Interface Segregation | DTOs separados: `CreateProjectDto`, `UpdateProjectDto`, `ProjectResponseDto` |
| D — Dependency Inversion | Servicios dependen de interfaces de repositorio, no de implementaciones concretas |

### Patrones de diseño

| Patrón | Dónde | Por qué |
|---|---|---|
| Repository | Capa de datos en cada módulo | Desacopla lógica de negocio del ORM |
| Strategy | Sistema de privilegios | Intercambiar estrategias de validación sin cambiar el guard |
| Observer | Bitácora de actividad | Eventos de dominio notifican al log sin acoplamiento directo |
| Gateway | Módulo gateway NestJS | Punto único de entrada y autenticación centralizada |
| Factory | DTOs y entidades | Centraliza construcción de objetos complejos |

---

## 10. Estrategia de ramas

| Aspecto | Decisión |
|---|---|
| Ramas base | `main` (producción), `develop` (integración del ciclo actual) |
| Integración | Pull Request con revisión de al menos un compañero. Merge a `main` solo al cerrar un ciclo |
| Nomenclatura | `tipo/cN-descripcion` — ejemplo: `feat/c1-auth-jwt`, `fix/c2-kanban-drag` |
| Tipos de rama | `feat/` funcionalidad, `fix/` corrección, `docs/` documentación, `test/` pruebas, `chore/` configuración |
| Eliminación | Al hacer merge exitoso a `develop` |
| Evitar conflictos | Ramas de vida corta (máx 2-3 días). Actualizar desde `develop` antes de abrir PR. Comunicar antes de tocar módulos compartidos |

### Convención de commits

```
feat(auth): add JWT refresh token rotation
fix(kanban): resolve drag drop permission validation
docs(pitch): update cycle 1 rabbit holes
chore(docker): add docker-compose dev config
test(projects): add unit tests for create project service
```