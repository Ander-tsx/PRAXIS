# Prompt para levantar PRAXIS en el PC de casa

Copia todo lo que hay bajo la línea y pásaselo a `agy` en la máquina Linux.

Antes de empezar, ten a mano **tu clave de Gemini** (Google AI Studio): es el
único dato que el agente no puede inventar.

---

Vas a poner en marcha un proyecto llamado PRAXIS en esta máquina Linux y a
exponerlo temporalmente en Internet para que unos compañeros puedan probarlo.
Trabaja paso a paso y **verifica cada paso antes de pasar al siguiente**; si algo
falla, párate y dime qué salió en lugar de seguir adelante.

## Qué es lo que vas a levantar

Un monorepo con 12 procesos —un gateway HTTP, seis microservicios que hablan
entre sí por TCP y cinco aplicaciones Next.js— más PostgreSQL y Redis. **No los
vas a instalar ni configurar uno a uno.** El repositorio trae un `Dockerfile` en
la raíz que empaqueta absolutamente todo en una sola imagen, incluidos Postgres
y Redis, y un script de arranque que se encarga del orden, de las migraciones y
de la semilla. Tu trabajo es construir esa imagen y ejecutarla.

**No hace falta crear ningún archivo `.env`.** Toda la configuración interna
tiene valores por defecto correctos dentro del contenedor; solo se pasan tres
variables por línea de comandos.

## Paso 1 — Comprobar e instalar lo necesario

Necesitas `git`, `docker` (con el plugin `buildx`) y `cloudflared`. Comprueba
qué falta y, según la distribución, instálalo. Si Docker se acaba de instalar,
añade el usuario actual al grupo `docker` y avísame de que hay que reiniciar la
sesión.

Comprueba también la arquitectura con `uname -m`: debe ser `x86_64` o
`aarch64`. La imagen se construye nativa, así que cualquiera de las dos vale.

## Paso 2 — Clonar el repositorio

```
git clone https://github.com/Ander-tsx/PRAXIS.git
cd PRAXIS
git checkout feature/microfrontends-implementation
```

Confirma que existen en la raíz `Dockerfile`, `docker-entrypoint-praxis.sh` y
`.dockerignore`. Si no están, estás en la rama equivocada.

## Paso 3 — Construir la imagen

```
docker build -t praxis:local .
```

Tarda **entre 10 y 20 minutos**: instala las dependencias del monorepo, compila
quince paquetes y construye cinco aplicaciones Next. Es normal que parezca
parado un buen rato en `pnpm exec turbo run build`.

Si falla, dime el error exacto. No improvises cambios en el `Dockerfile`.

## Paso 4 — Preparar los secretos

Genera dos cadenas aleatorias y guárdalas donde puedas recuperarlas:

```
openssl rand -base64 32   # para JWT_SECRET
openssl rand -base64 32   # para POSTGRES_PASSWORD
```

La tercera, `GEMINI_API_KEY`, te la doy yo. Es solo para el asistente de IA: sin
ella el resto del producto funciona igual y únicamente el chat dará error.

## Paso 5 — Arrancar el contenedor

Crea un volumen para que la base de datos sobreviva a los reinicios y arranca:

```
docker volume create praxis-datos
```

```
docker run -d --name praxis -p 8080:8080 \
  -e JWT_SECRET='<la primera cadena>' \
  -e POSTGRES_PASSWORD='<la segunda cadena>' \
  -e GEMINI_API_KEY='<la clave de Gemini>' \
  -v praxis-datos:/var/lib/postgresql/data \
  --restart unless-stopped \
  praxis:local
```

⚠️ **El volumen no es opcional.** Sin él, cada vez que se recree el contenedor
se borra la base de datos entera: usuarios, proyectos y tareas.

Sigue los registros con `docker logs -f praxis` hasta ver esta línea:

```
[praxis] Todo arriba. Vigilando.
```

El primer arranque tarda un par de minutos porque crea el clúster de Postgres,
aplica las migraciones de cinco esquemas y siembra el usuario administrador.

Si el contenedor se para solo, es a propósito: se apaga en cuanto uno de los
doce procesos muere, para no quedarse «vivo» con media aplicación caída. Mira
los registros, encuentra cuál murió y dímelo.

## Paso 6 — Exponerlo en Internet

```
cloudflared tunnel --url http://localhost:8080
```

Te dará una URL del tipo `https://algo-aleatorio.trycloudflare.com`. **Esa es la
que hay que compartir.** Déjalo corriendo; si cierras el proceso, el túnel
desaparece.

⚠️ **Hay que entrar por la URL del túnel, no por `localhost:8080`.** La cookie
de sesión de este proyecto exige HTTPS en producción, así que por HTTP el
navegador la descarta y **el login falla sin dar ningún mensaje de error**:
simplemente no entra. El túnel aporta el HTTPS.

## Paso 7 — Verificar que funciona de verdad

Abre la URL del túnel y comprueba, en este orden:

1. Carga la página de inicio.
2. Entra con **`admin@praxis.dev`** y contraseña **`Admin@12345!`**.
3. Crea un proyecto.
4. Crea una tarea dentro y arrástrala de columna.

**El paso 2 y el 3 son los importantes**, y por un motivo concreto que quiero
que tengas presente: esta aplicación usa Server Actions de Next.js para todos
sus formularios, y en producción Next **rechaza** una Server Action cuando la
cabecera `Origin` no coincide con el `Host` que ve el servidor. Detrás de un
túnel eso puede pasar, y hasta ahora el proyecto solo se ha ejecutado en modo
desarrollo, donde esa comprobación no se aplica. **Es el fallo más probable de
todo este proceso.**

Si el login o el formulario de crear proyecto fallan con un error del tipo
`Invalid Server Actions request` o `Failed to find Server Action`, el arreglo
es este: en cada uno de estos cinco archivos

```
apps/frontend/web-shell/next.config.ts
apps/frontend/auth-front/next.config.ts
apps/frontend/dashboard-front/next.config.ts
apps/frontend/projects-front/next.config.ts
apps/frontend/reports-front/next.config.ts
```

añade dentro del objeto `nextConfig`:

```ts
experimental: {
  serverActions: {
    allowedOrigins: ['*.trycloudflare.com', 'localhost:8080'],
  },
},
```

Si alguno ya tiene una clave `experimental`, añade `serverActions` dentro en
lugar de duplicarla. Después reconstruye la imagen (paso 3) y vuelve a arrancar.
Avísame si tienes que hacerlo.

## Paso 8 — Cómo pararlo y cómo volver

Parar sin perder nada:

```
docker stop praxis
```

Volver a levantarlo:

```
docker start praxis
```

Los datos siguen en el volumen `praxis-datos`. Para borrarlo todo y empezar de
cero: `docker rm -f praxis && docker volume rm praxis-datos`.

## Lo que NO debes hacer

- No crees archivos `.env`: no hacen falta y solo pueden contradecir lo que ya
  está bien configurado.
- No cambies el `Dockerfile` ni `docker-entrypoint-praxis.sh` por tu cuenta.
- No pongas `NODE_ENV=development` en el contenedor. Haría que el login
  funcionara por HTTP, pero desactiva protecciones y no es lo que queremos con
  gente de fuera entrando.
- No expongas los puertos 3000-3006 ni 4101-4104 hacia fuera: solo el 8080. Los
  demás son internos y saltárselos evita las comprobaciones de permisos.
