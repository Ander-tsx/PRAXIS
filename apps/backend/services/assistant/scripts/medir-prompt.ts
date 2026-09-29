/**
 * Cuánto ocupa el prompt del asistente, medido contra un proyecto de verdad.
 *
 * ## Para qué existe
 *
 * Todo lo que se le manda al modelo viaja **en cada turno**, así que un campo de
 * más en el briefing no cuesta una vez: cuesta en cada mensaje de cada
 * conversación de cada persona. Y no se nota — no hay error, no hay lentitud
 * evidente, solo una factura y un modelo con las reglas más lejos de la
 * atención.
 *
 * Este script existe para que esa cifra **se pueda mirar antes de tocar nada**.
 * Salió de una pregunta que no se podía responder sin él: «1,6 M de tokens en 56
 * peticiones, ¿está bien o mal?». Ver ESTADO-ACTUAL §43.
 *
 * ## Cómo se usa
 *
 * Con el stack levantado —habla con reports-service por TCP, igual que el
 * servicio de verdad— y un `projectId` real:
 *
 * ```bash
 * pnpm --filter @praxis/assistant-service medir-prompt <projectId> [projectId…]
 * ```
 *
 * Los tokens salen de dos formas:
 *
 * - **Estimados**, a 4 caracteres por token. Sirven para comparar las partes
 *   entre sí sin gastar nada.
 * - **Reales**, con `:countTokens` de Gemini, si hay `GEMINI_API_KEY` en el
 *   entorno. Contar no cuesta cuota y es el número que se cobra de verdad, con
 *   el tokenizador de verdad: el español no sale a 4 caracteres por token.
 *
 * ⚠️ **No incluye ni el historial ni los adjuntos**, que dependen de cada
 * conversación: mide el suelo de cada turno, que es la parte que se paga siempre.
 * Lo que cuesta un turno entero, historial incluido, sale en el log de
 * assistant-service: una línea `gemini_uso` por llamada, con entrada, salida,
 * razonamiento y caché (F0 de docs/PLAN-PRAX-SEMIAGENTICO.md).
 *
 * ⚠️ Habla con reports-service por **TCP**, así que necesita el backend en
 * procesos separados (`dev:backend` o `start:backend:separado`), no el monolito.
 */
import { ClientProxyFactory, Transport } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

import { instruccionSinProyecto, systemInstruction } from '../src/assistant/prompt';
import { herramientasPara, herramientasSinProyecto } from '../src/assistant/tools';

const tk = (n: number) => Math.round(n / 4);

/**
 * Los tokens de verdad de un prompt, con el contador de Gemini. `null` si no hay
 * clave o el contador falla: la estimación sigue sirviendo para comparar.
 */
async function tokensReales(system: string, tools: unknown[]): Promise<number | null> {
  const clave = process.env.GEMINI_API_KEY;
  if (!clave) return null;
  const modelo = process.env.GEMINI_MODEL ?? 'gemini-flash-latest';
  const respuesta = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:countTokens`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave },
      body: JSON.stringify({
        generateContentRequest: {
          model: `models/${modelo}`,
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: '.' }] }],
          ...(tools.length > 0 ? { tools: [{ functionDeclarations: tools }] } : {}),
        },
      }),
    },
  ).catch(() => null);
  if (!respuesta?.ok) return null;
  const json = (await respuesta.json()) as { totalTokens?: number };
  return json.totalTokens ?? null;
}

const real = (n: number | null) =>
  n === null ? '  (sin GEMINI_API_KEY: solo estimado)' : `  → ${n} tokens reales`;
const fila = (etiqueta: string, chars: number, sangria = 2) =>
  `${' '.repeat(sangria)}${etiqueta.padEnd(32 - sangria)} ${String(chars).padStart(7)} chars  ~${String(tk(chars)).padStart(6)} tokens`;

/** Todos los permisos: el caso más caro, que es el que interesa medir. */
const TODO_PERMITIDO = {
  canCreateTask: true,
  canEditTask: true,
  canMoveTask: true,
  canComment: true,
  canViewReports: true,
  canDeleteTask: true,
  canCreateBoard: true,
  canCreateColumn: true,
};

async function main() {
  const proyectos = process.argv.slice(2);
  if (proyectos.length === 0) {
    console.error('Uso: medir-prompt <projectId> [projectId…]');
    process.exit(1);
  }

  const reports = ClientProxyFactory.create({
    transport: Transport.TCP,
    options: {
      host: process.env.REPORTS_SERVICE_HOST ?? '127.0.0.1',
      port: Number(process.env.REPORTS_SERVICE_PORT ?? 3005),
    },
  });

  const herramientas = herramientasPara(TODO_PERMITIDO).map((h) => h.name);
  const herramientasJson = JSON.stringify(herramientasPara(TODO_PERMITIDO)).length;

  for (const projectId of proyectos) {
    const briefing = (await firstValueFrom(
      reports.send({ cmd: 'report_briefing' }, { projectId, incluirPersonas: true }),
    )) as Record<string, unknown>;

    const conBriefing = systemInstruction(briefing, [], herramientas, [], undefined).length;
    const andamiaje = systemInstruction({}, [], herramientas, [], undefined).length;

    console.log(`\n=== ${projectId} ===`);
    console.log(fila('instruccion de sistema', conBriefing));
    console.log(fila('· reglas + andamiaje', andamiaje, 4));
    console.log(fila('· briefing', conBriefing - andamiaje, 4));
    console.log(fila('declaracion de herramientas', herramientasJson));
    console.log(fila('TOTAL por turno (suelo)', conBriefing + herramientasJson));
    console.log(
      real(
        await tokensReales(
          systemInstruction(briefing, [], herramientas, [], undefined),
          herramientasPara(TODO_PERMITIDO),
        ),
      ),
    );

    console.log('  --- dentro del briefing ---');
    Object.entries(briefing ?? {})
      .map(([clave, valor]) => [clave, JSON.stringify(valor).length] as const)
      .sort((a, b) => b[1] - a[1])
      .forEach(([clave, chars]) => console.log(fila(clave, chars, 4)));
  }

  /* El otro modo, que no depende de ningún proyecto. */
  const sinFoco = instruccionSinProyecto(
    [{ id: 'x', nombre: 'Un proyecto' }],
    herramientasSinProyecto().map((h) => h.name),
    undefined,
  ).length;
  const herramientasSinFoco = JSON.stringify(herramientasSinProyecto()).length;
  console.log('\n=== conversacion SIN proyecto ===');
  console.log(fila('instruccion de sistema', sinFoco));
  console.log(fila('declaracion de herramientas', herramientasSinFoco));
  console.log(fila('TOTAL por turno (suelo)', sinFoco + herramientasSinFoco));
  console.log(
    real(
      await tokensReales(
        instruccionSinProyecto(
          [{ id: 'x', nombre: 'Un proyecto' }],
          herramientasSinProyecto().map((h) => h.name),
          undefined,
        ),
        herramientasSinProyecto(),
      ),
    ),
  );

  process.exit(0);
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
