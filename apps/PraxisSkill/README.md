# 🎙️ Alexa Skill — PRAXIS

Guía paso a paso para configurar, ejecutar y probar localmente la Skill de Alexa integrada con el backend de **PRAXIS**.

---

Elige la guía según tu situación:
- ⚡ **[CAMINO A: Si ya eres colaborador invitado en la Alexa Skill de Amazon](#-camino-a-ya-eres-colaborador-invitado-flujo-rápido)** (Recomendado para el equipo).
- 🛠️ **[CAMINO B: Si vas a crear una Alexa Skill desde CERO](#-camino-b-crear-la-alexa-skill-desde-cero)** (Para crear una nueva skill independiente).

---

## ⚡ CAMINO A: Ya eres Colaborador Invitado (Flujo Rápido)

Si el propietario de la Skill ya te agregó como colaborador en la [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask), no necesitas crear ni compilar el modelo de interacción desde cero.

### 1. Verificar tu Acceso a la Skill
1. Entra a la [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask) con tu cuenta de Amazon.
2. En tu lista de Skills verás la Skill **Praxis** lista.

### 2. Levantar el Backend de NestJS y Poblar Datos de Prueba
1. En la raíz del repositorio de PRAXIS, ejecuta:
   ```bash
   pnpm docker:up
   pnpm dev:backend
   ```
   *(El API Gateway correrá en `http://localhost:3000/api` y `alexa-service` en el puerto TCP `3007`)*.

2. **Poblar la Base de Datos con Postman:**
   - Importa en Postman la colección [`apps/backend/gateway/postman/Praxis API.Alexa Skill Flow.json`](file:///c:/Users/erick/Desktop/Trabajos/PRAXIS/apps/backend/gateway/postman/Praxis%20API.Alexa%20Skill%20Flow.json).
   - Ejecuta del **Paso 01 al 09** (crea el usuario `admin@praxis.dev`, el proyecto *"Rediseño Web"*, columnas y tareas).
   - Ejecuta el **Paso 10** (`Generar Frase Semilla para Alexa`) y **copia la frase de 5 palabras** generada.

### 3. Levantar el Servidor Local y Túnel Ngrok
1. Abre una terminal en `apps/PraxisSkill` e inicia la Skill local:
   ```bash
   node --watch lambda/server.js
   ```
   *(Servidor Express local corriendo en `http://localhost:4000`)*.

2. En una segunda terminal, abre el túnel seguro:
   ```bash
   npx ngrok http 4000
   ```
   - Copia la URL pública HTTPS generada por Ngrok (ejemplo: `https://xxxx-xxx.ngrok-free.dev`).

### 4. Configurar tu Endpoint de Ngrok en Alexa Developer Console
1. En la [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask), abre la Skill **Praxis**.
2. Ve a **Build > Endpoint**.
3. Selecciona **HTTPS**.
4. En **Default Region**, pega tu URL de Ngrok (`https://xxxx-xxx.ngrok-free.dev`).
5. En el selector SSL, elige:
   > *"My development endpoint is a sub-domain of a domain that has a wildcard certificate from a certificate authority"*
6. Haz clic arriba en **Save Endpoints**.

### 5. Probar en el Simulador de Alexa
1. Ve a la pestaña **Test** en la consola de Alexa y activa el modo **Development**.
2. **Diálogo de prueba:**
   - 💬 *"abre praxis"*
   - 💬 *"mi semilla es [tu frase de 5 palabras]"* ➔ *"¡Listo! Tu cuenta ha sido vinculada..."*
   - 💬 *"quiero trabajar con rediseño web"*
   - 💬 *"¿cuál es el avance del proyecto?"*

---

## 🛠️ CAMINO B: Crear la Alexa Skill desde CERO

Sigue este camino si quieres crear tu propia Skill de Alexa independiente desde tu propia cuenta de Amazon.

### 1. Crear una nueva Skill en Alexa Developer Console
1. Entra a [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask) ➔ **Create Skill**.
   - **Skill name:** `Praxis`
   - **Default language:** `Spanish (MX)` o `Spanish (ES)`
   - **Model:** `Custom`
   - **Hosting service:** `Provision your own`
2. Una vez creada la Skill, copia su **Skill ID** (formato: `amzn1.ask.skill.xxxx-xxxx-xxxx-xxxx`).

### 2. Actualizar el `skillId` en el Repositorio Local
Reemplaza el `skillId` antiguo por tu nuevo `skillId` en los siguientes 2 archivos del repositorio:

1. **En [`ask-resources.json`](file:///c:/Users/erick/Desktop/Trabajos/PRAXIS/apps/PraxisSkill/ask-resources.json):**
   ```json
   "profiles": {
     "default": {
       "skillId": "TU_NUEVO_SKILL_ID_AQUI"
     }
   }
   ```
2. **En [`.vscode/launch.json`](file:///c:/Users/erick/Desktop/Trabajos/PRAXIS/apps/PraxisSkill/.vscode/launch.json):**
   ```json
   "--skillId",
   "TU_NUEVO_SKILL_ID_AQUI"
   ```

### 3. Cargar el Modelo de Interacción (Intents y Slots)
1. En la consola de Alexa, ve a **Build > Interaction Model > JSON Editor**.
2. Abre el archivo [`skill-package/interactionModels/custom/es-MX.json`](file:///c:/Users/erick/Desktop/Trabajos/PRAXIS/apps/PraxisSkill/skill-package/interactionModels/custom/es-MX.json) de este repositorio.
3. Copia todo su contenido y pégalo en el editor JSON de la consola.
4. Haz clic en **Save Model** y luego en **Build Model** (espera ~1 minuto a que finalice la compilación del modelo).

### 4. Cargar el Código Fuente (Si usas el Editor en Línea de Amazon)
Si en lugar de Ngrok prefieres usar el Code Editor de Amazon:
- Ve a la pestaña **Code** y pega el contenido autocontenido de [`index.js`](file:///c:/Users/erick/Desktop/Trabajos/PRAXIS/apps/PraxisSkill/index.js).

### 5. Levantar Backend, Ngrok y Probar
- Sigue los pasos **2, 3, 4 y 5 del Camino A** para levantar el backend NestJS (`pnpm dev:backend`), lanzar `node --watch lambda/server.js`, exponer con Ngrok y probar la skill en el simulador.

---

## 🛠️ Comandos de ASK CLI (Utilidades de Terminal)

```bash
# Configurar perfil de AWS y credenciales de developer
ask configure

# Inicializar y asociar el proyecto con la skill remota
ask init

# Probar la skill localmente mediante CLI
ask run

# Simular diálogos e intents por terminal
ask dialog

# Desplegar cambios directamente a AWS
ask deploy

# Generar tokens de depuración
ask util generate-lwa-tokens --scopes alexa::ask:skills:debug
```

---

## 🚀 Guía de Despliegue a Producción (AWS Lambda)

Para desplegar la Skill a producción en AWS Lambda:

1. **Variables de Entorno en AWS Lambda:**
   - **`PRAXIS_API_BASE_URL`**: `https://api.tu-dominio.com/api/alexa`
   - **`DYNAMODB_TABLE_NAME`**: `PraxisAlexaSkillTable`
   - **`AWS_REGION`**: `us-east-1`
2. **Endpoint:** Cambiar de HTTPS (Ngrok) a **AWS Lambda ARN**.
3. **IAM Permissions:** Asignar política `AmazonDynamoDBFullAccess` al rol de la función Lambda.
4. **Handler:** Apuntar la Lambda a `index.handler`.