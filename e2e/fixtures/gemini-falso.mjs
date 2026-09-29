#!/usr/bin/env node
/**
 * Un Gemini falso, para ver PRAX funcionar en local sin clave ni cuota.
 *
 * Se arranca con `node e2e/fixtures/gemini-falso.mjs` (puerto 3999, o PORT) y se
 * apunta assistant-service a él con `GEMINI_BASE_URL=http://127.0.0.1:3999`.
 *
 * Responde como `streamGenerateContent` y `generateContent`, con un guion fijo
 * que ejercita el bucle de consultas (F3 de docs/PLAN-PRAX-SEMIAGENTICO.md):
 *
 * 1. Si el turno todavía no trae ninguna respuesta de consulta, escribe una
 *    frase y pide `consultar_tareas` (si está declarada).
 * 2. Si ya la trae, contesta con un texto en varios trozos que cita cuántas
 *    tareas le devolvió la consulta.
 *
 * No es Gemini y no pretende decidir nada: es un guion para comprobar la
 * tubería —el transporte, el streaming, los pasos y el texto en pantalla—.
 */
import { createServer } from 'node:http';

const PUERTO = Number(process.env.PORT ?? 3999);

function trozo(parts, extra = {}) {
  return { candidates: [{ content: { role: 'model', parts }, ...extra }] };
}

/**
 * Directivas en el mensaje, para que una prueba decida qué hace el modelo.
 *
 *     #consulta consultar_sprints {}
 *     #propon proponer_planificacion {"sprintId":"$r.tableros.0.sprints.0.id","taskIds":"$r.tableros.0.backlog.tareas.*.id","porQue":"x"}
 *
 * `#consulta` se pide en la primera vuelta; `#propon` sale en la siguiente (o en
 * la primera, si no hay consulta). Un valor que empieza por `$r.` se lee de la
 * respuesta de la consulta, con `*` para recorrer una lista: así la prueba
 * puede proponer sobre ids que solo existen en el servidor.
 */
function directivas(peticion) {
  const usuario = [...(peticion.contents ?? [])]
    .reverse()
    .find((c) => c.role === 'user' && (c.parts ?? []).some((p) => typeof p.text === 'string'));
  const texto = (usuario?.parts ?? []).map((p) => p.text ?? '').join('\n');
  const leer = (prefijo) =>
    texto
      .split('\n')
      .filter((l) => l.startsWith(prefijo))
      .map((l) => {
        const [, nombre, ...resto] = l.split(' ');
        return { name: nombre, args: JSON.parse(resto.join(' ') || '{}') };
      });
  return { consultas: leer('#consulta '), propuestas: leer('#propon ') };
}

function resolver(valor, respuesta) {
  if (typeof valor === 'string' && valor.startsWith('$r.')) {
    const camino = valor.slice(3).split('.');
    const bajar = (actual, pasos) => {
      if (pasos.length === 0) return actual;
      const [paso, ...resto] = pasos;
      if (paso === '*') return (actual ?? []).map((x) => bajar(x, resto));
      return bajar(actual?.[paso], resto);
    };
    return bajar(respuesta, camino);
  }
  if (Array.isArray(valor)) return valor.map((v) => resolver(v, respuesta));
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, resolver(v, respuesta)]));
  }
  return valor;
}

function guion(peticion) {
  const contenidos = peticion.contents ?? [];
  const pedido = directivas(peticion);
  if (pedido.consultas.length > 0 || pedido.propuestas.length > 0) {
    const respuestas = contenidos
      .flatMap((c) => c.parts ?? [])
      .filter((p) => p.functionResponse)
      .map((p) => p.functionResponse.response);
    if (pedido.consultas.length > 0 && respuestas.length === 0) {
      return [
        trozo(
          pedido.consultas.map((c) => ({ functionCall: c })),
          { finishReason: 'STOP' },
        ),
      ];
    }
    const ultima = respuestas[respuestas.length - 1] ?? {};
    return [
      trozo([{ text: 'Te propongo esto.' }]),
      trozo(
        pedido.propuestas.map((p) => ({
          functionCall: { name: p.name, args: resolver(p.args, ultima) },
        })),
        { finishReason: 'STOP' },
      ),
    ];
  }
  const respuestaDeConsulta = contenidos
    .flatMap((c) => c.parts ?? [])
    .find((p) => p.functionResponse);
  const puedeConsultar = (peticion.tools ?? [])
    .flatMap((t) => t.functionDeclarations ?? [])
    .some((f) => f.name === 'consultar_tareas');

  if (!respuestaDeConsulta && puedeConsultar) {
    return [
      trozo([{ text: 'Déjame mirar las tareas.' }]),
      trozo([{ functionCall: { name: 'consultar_tareas', args: {} } }], { finishReason: 'STOP' }),
    ];
  }
  const total = respuestaDeConsulta?.functionResponse?.response?.total;
  const frases = [
    'Según lo que he podido ver',
    total !== undefined ? `, hay ${total} tareas abiertas.` : ', todo está en orden.',
    ' Si quieres, te propongo por dónde empezar.',
  ];
  return frases.map((f, i) =>
    trozo([{ text: f }], i === frases.length - 1 ? { finishReason: 'STOP' } : {}),
  );
}

/* La entrada que declara cada respuesta. Súbela (GEMINI_FALSO_ENTRADA=35000) para
   ver el aviso de conversación larga (D9) sin escribir cien mensajes. */
const USO = {
  promptTokenCount: Number(process.env.GEMINI_FALSO_ENTRADA ?? 1200),
  candidatesTokenCount: 40,
  thoughtsTokenCount: 0,
};

createServer((req, res) => {
  let cuerpo = '';
  req.on('data', (d) => {
    cuerpo += d;
  });
  req.on('end', async () => {
    const peticion = JSON.parse(cuerpo || '{}');
    /* Cuánto pesa lo que se le manda: sirve para medir el router (D10) con y
       sin Jev sobre el mismo mensaje. */
    const instruccion = (peticion.systemInstruction?.parts ?? []).map((p) => p.text ?? '').join('');
    console.log(
      `[gemini-falso] ${req.url?.split(':').pop()} instruccion=${instruccion.length} ` +
        `inventarioOmitido=${instruccion.includes('"inventarioOmitido":true')}`,
    );
    const trozos = guion(peticion);
    trozos[trozos.length - 1].usageMetadata = USO;
    if (req.url?.includes('streamGenerateContent')) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (const t of trozos) {
        res.write(`data: ${JSON.stringify(t)}\r\n\r\n`);
        await new Promise((r) => setTimeout(r, 250));
      }
      res.end();
    } else if (req.url?.includes('countTokens')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ totalTokens: 1200 }));
    } else {
      const parts = trozos.flatMap((t) => t.candidates[0].content.parts);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ...trozo(parts, { finishReason: 'STOP' }), usageMetadata: USO }));
    }
  });
}).listen(PUERTO, '127.0.0.1', () => {
  console.log(`[gemini-falso] escuchando en http://127.0.0.1:${PUERTO}`);
});
