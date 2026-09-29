# MCP y Praxis — nota para la segunda iteración

> Documento interno, sin decisión tomada (2026-09-29). Lo pidió el encargo de
> [PLAN-PRAX-SEMIAGENTICO](PLAN-PRAX-SEMIAGENTICO.md) como algo que evaluar
> **después** de esa etapa, no durante. Nada de esto está empezado.

## Qué puede significar «un MCP con Praxis»

El Model Context Protocol es el estándar abierto con el que un cliente de IA
—Claude, ChatGPT, Cursor, un agente propio— descubre y llama herramientas de
un servidor. Con Praxis caben **dos direcciones**, y son proyectos distintos:

| | Dirección | Ejemplo | Quién es el agente |
|---|---|---|---|
| **A** | **Praxis como servidor MCP** | Desde Claude: «¿qué tengo pendiente en el sprint de PRAXIS?» | Una IA de fuera, con la cuenta del usuario |
| **B** | **PRAX como cliente MCP** | PRAX consulta el GitHub o el Drive del equipo para responder | PRAX, con conectores que añade la organización |

El interruptor «Servidores MCP — Pronto» que había en «Recursos»
(`ComposerControls.tsx:323-333`) apuntaba a la **B**, y se retira en F2 porque
no hace nada.

## A — Praxis como servidor MCP

**Viable, y es la que más valor da por lo que cuesta.** Lo que ya hay y lo que
falta:

- **Las herramientas ya existen.** El catálogo `capabilities.ts` de D4 es
  justo una lista de funciones con su permiso. Un servidor MCP las publicaría
  casi 1:1, llamando al gateway con el token del usuario.
- **La autenticación es lo difícil.** MCP remoto usa **OAuth 2.1** con
  descubrimiento. Praxis hoy tiene sesión por cookie `praxis_session` y JWT
  propio, sin servidor OAuth. Hace falta:
  - un emisor de tokens con alcances (`read`, `propose`, `write`);
  - una pantalla de consentimiento;
  - la revocación desde ajustes.

  Es el grueso del trabajo.
- **La organización activa no existe fuera del navegador.** Cada llamada MCP
  tendría que llevar `organizationId` y validarse con `organizacionElegida`, o
  el token se emite **atado a una organización** en el consentimiento. Lo
  segundo es más seguro y encaja con I2.
- 🔴 **La regla «propone; nunca ejecuta» es de PRAX, no de cualquier cliente.**
  Un Claude externo que actúa con el token del usuario *es* el usuario usando su
  propia herramienta. Hay que decidir:
  - **(a)** El servidor MCP solo publica lectura y propuestas: las propuestas
    aparecen en Praxis para aceptarlas.
  - **(b)** El alcance `write` deja escribir directo, como la API.

  La (a) es coherente con el producto. La (b) es lo que se espera de un MCP.
  **No se decide aquí.**
- **Cuotas.** Las llamadas de un MCP externo no gastan tokens de PRAX, porque
  el modelo lo paga quien usa Claude. Sí gastan API. Haría falta un límite
  propio por token OAuth, igual que el del login (trampa 16).
- **Transporte.** «Streamable HTTP» detrás del gateway, como una ruta más. No
  un servicio nuevo.

Estimación gruesa: el servidor MCP en sí, pocos días; OAuth bien hecho, lo
mismo o más.

## B — PRAX como cliente MCP

**Viable técnicamente; caro en seguridad y en tokens.**

- **Encaja con el bucle de F3.** Una herramienta MCP de solo lectura es una
  `consultar_*` más.
- **Tokens.** Cada servidor MCP publica sus herramientas, y sus descripciones
  viajan en cada turno. Es justo el caso para el que se mete el router (D10):
  que Jev elija qué conectores declarar según el mensaje.
- **Seguridad.** Hay tres frentes:
  - **Inyección de instrucciones.** Un documento de Drive o una issue de GitHub
    pueden traer texto que intente hacer que PRAX proponga cosas. La defensa es
    la de siempre: PRAX solo propone, y cada propuesta la acepta una persona.
    Aun así, hay que marcar en el prompt que el contenido externo son datos, no
    instrucciones.
  - **Credenciales.** Las guarda la organización, cifradas. Hace falta un
    almacén de secretos que hoy no existe.
  - **Escritura.** Una herramienta MCP que escribe **no se puede** llamar desde
    PRAX sin romper I1. Solo lectura, o convertirla en propuesta.
- **Plan.** Tiene sentido como capacidad de BUSINESS o ENTERPRISE, con una
  cuota propia.

## Recomendación para cuando toque

1. Empezar por **A en solo lectura** con un token personal de alcance mínimo
   (sin OAuth completo), solo para probar internamente con Claude Desktop. Es
   barato y enseña qué herramientas se usan de verdad.
2. Si se usa, hacer OAuth bien y decidir entre (a) y (b).
3. **B** después, con un solo conector (GitHub es el candidato natural para
   equipos de software) y solo lectura.

## Lo que hay que tener hecho antes

- F3 (bucle de consulta) y F7 (`capabilities.ts`) del plan semi-agéntico: son
  la base de ambas direcciones.
- La organización atada a cada llamada (I2) resuelta sin la cookie.
