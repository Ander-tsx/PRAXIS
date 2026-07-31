# Desplegar PRAXIS en Railway

Guía para poner el proyecto en línea y compartirlo. **Es para pedir opiniones,
no para producción**: todo vive en un contenedor —los 12 procesos, Postgres y
Redis— y no hay copias de seguridad.

Nada de esto obliga a cambiar la aplicación. Funciona porque el código ya lee su
configuración de variables de entorno y sus valores por defecto son `localhost`,
que dentro de un contenedor es justo lo correcto.

---

## Antes de empezar

- Una cuenta de Railway con el plan **Hobby** (5 USD/mes).
- El repositorio en GitHub.

### Lo que cuesta, según cuánto lo tengas encendido

El plan **incluye** 5 USD de consumo; no es tarifa plana. Railway cobra sobre
10 USD por GB de RAM al mes y esto ocupa **2-2,5 GB**, así que la cuenta es
aproximadamente **0,035 USD por hora**:

| Uso | Coste |
|---|---|
| Unas horas para enseñarlo | céntimos |
| Un fin de semana | ~2 USD |
| Encendido todo el mes | **20-25 USD** |

Para lo primero, los 5 USD sobran de largo. Lo que **no** conviene es dejarlo
encendido y olvidarse: ahí sí se va del plan en una semana.

**Apaga el servicio cuando termines** (Settings → Remove/Pause), no lo dejes
solo dormido: dormido sigue costando el volumen.

Si quieres tenerlo accesible sin vigilarlo, activa **App Sleeping**: se apaga
sin tráfico y despierta con la primera visita. El precio es que esa primera
visita tarda **medio minuto o más** —hay que arrancar Postgres, migrar y
levantar doce procesos—, así que avisa a quien vaya a probarlo.

---

## 1. Crear el servicio

1. En Railway: **New Project → Deploy from GitHub repo** y elige el repositorio.
2. Railway detecta el `Dockerfile` de la raíz por `railway.json`. No hace falta
   configurar comandos de compilación ni de arranque.

### ⚠️ No uses «Deploy from Docker image»

Es la otra opción del menú y parece más directa, pero no sirve aquí: pide una
imagen ya publicada en un registro, y tendrías que construirla tú.

El problema es la arquitectura. Los Mac con Apple Silicon son **arm64** y
Railway ejecuta **amd64**: una imagen construida en tu máquina no arranca allí.
Habría que construirla con `--platform linux/amd64`, es decir emulando con
QEMU — esta imagen pasa de diez minutos a media hora larga— y después subir
unos 2 GB a un registro.

Con la ruta de GitHub, Railway construye en sus máquinas, nativamente y sin
que tú subas nada.

## 2. El volumen — no te lo saltes

**Settings → Volumes → New Volume**, montado en:

```
/var/lib/postgresql/data
```

⚠️ **Sin volumen, cada redespliegue borra la base de datos entera.** Y no solo
los redespliegues: un reinicio de la plataforma hace lo mismo. Te presentarías a
enseñarlo y no habría ni usuarios.

## 3. Variables de entorno

**Settings → Variables**. Solo hacen falta estas:

| Variable | Valor |
|---|---|
| `JWT_SECRET` | Una cadena larga y aleatoria. La misma para todo el contenedor |
| `POSTGRES_PASSWORD` | Otra cadena aleatoria |
| `GEMINI_API_KEY` | Tu clave de Google AI Studio |

Para generar las dos aleatorias:

```bash
openssl rand -base64 32
```

`PORT` lo inyecta Railway solo. Todo lo demás tiene un valor por defecto que ya
es el correcto dentro del contenedor.

> El asistente es lo único que necesita `GEMINI_API_KEY`. Sin ella el resto del
> producto funciona; solo el chat responderá con error.

## 4. Dominio

**Settings → Networking → Generate Domain**. Railway da un `*.up.railway.app`
con HTTPS.

⚠️ **El HTTPS no es opcional aquí.** La cookie de sesión es `secure` cuando
`NODE_ENV=production`, así que sobre HTTP el navegador la descarta y **no
podrás iniciar sesión** — sin ningún mensaje de error, simplemente no entrarás.
El dominio de Railway ya resuelve esto.

## 5. Primer arranque

Tarda varios minutos: compila quince paquetes y cinco aplicaciones Next. En los
registros verás, en orden:

```
[praxis] Primera vez: creando el cluster de Postgres
[praxis] Arrancando Redis
[praxis] Aplicando migraciones
[praxis] Sembrando datos iniciales
[praxis] Arrancando microservicios
[praxis] Arrancando gateway
[praxis] Arrancando zonas
[praxis] Arrancando web-shell en el puerto 8080
[praxis] Todo arriba. Vigilando.
```

Si el último no aparece, algo se cayó antes: el contenedor se para a propósito
en cuanto uno de los doce procesos muere, porque un contenedor «vivo» con media
aplicación muerta es peor —nadie se entera.

---

## Probarlo en local primero

Merece la pena: los fallos salen aquí y no en la plataforma.

```bash
docker build -t praxis:local .
```

```bash
docker run --rm -p 8080:8080 -e JWT_SECRET=cualquier-cosa-larga -e GEMINI_API_KEY=... -v praxis-datos:/var/lib/postgresql/data praxis:local
```

Y abre `http://localhost:8080`.

⚠️ En local **no hay HTTPS**, así que la cookie `secure` impide iniciar sesión.
Para probar el login localmente hay que añadir `-e NODE_ENV=development`, que
desactiva ese requisito. En Railway no hace falta y **no debe ponerse**.

---

## Lo que este despliegue no es

- **No hay copias de seguridad.** Si el volumen se pierde, se pierde todo.
- **No escala.** Los doce procesos comparten una máquina; no se puede darle más
  a uno solo.
- **Los adjuntos van dentro de Postgres**, hasta 10 MB por PDF, así que el
  volumen crece con cada subida. Con una demo no se nota.
- **No hay observabilidad** más allá de los registros del contenedor.

Para algo serio, el camino es el otro: dos EC2 y una RDS, con la base gestionada
y sus copias automáticas.
